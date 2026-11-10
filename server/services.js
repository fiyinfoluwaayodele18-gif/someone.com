import {
  buildSystemInstruction,
  characterPrompt,
  composeCharacter,
  introPrompt,
  lifeEventPrompt,
  localCharacterSheet,
  localGist,
  gistPrompt,
  memoryExtractionPrompt,
  normalizeSheet,
  proactivePrompt,
  trendingPrompt,
  CHARACTER_SCHEMA,
  GIST_SCHEMA,
  LIFE_EVENT_SCHEMA,
  MEMORY_SCHEMA,
  LOCAL_GISTS,
} from './persona.js';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, FREQUENCIES, sanitizeSettings, sanitizeProfile } from './model.js';
import { isQuietHours, uid, nowMs, cleanText } from './util.js';

const TRENDING_TTL_MS = 30 * 60 * 1000;
const MAX_MEMORIES = 150;
const MAX_HISTORY_FOR_MODEL = 26;

function normalizeForCompare(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createServices({ store, ai }) {
  /* ------------------------------ reads ------------------------------ */

  function profileFor(userId) {
    return { ...DEFAULT_PROFILE, ...(store.get('profiles', userId) || {}) };
  }

  function settingsFor(userId) {
    return { ...DEFAULT_SETTINGS, ...(store.get('settings', userId) || {}) };
  }

  function companionFor(userId) {
    return store.get('companions', userId) || null;
  }

  function memoriesFor(userId) {
    return store
      .find('memories', (m) => m.userId === userId)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  function messagesFor(userId, { limit = 40, before = null } = {}) {
    let rows = store.find('messages', (m) => m.userId === userId).sort((a, b) => a.seq - b.seq);
    if (before) rows = rows.filter((m) => m.seq < before);
    const slice = rows.slice(-limit);
    return slice;
  }

  function messageCount(userId) {
    return store.find('messages', (m) => m.userId === userId).length;
  }

  function addMessage(userId, { role, text, kind = 'text', audioId = null, proactive = false, meta = {} }) {
    const message = {
      id: uid('msg'),
      userId,
      seq: store.nextSeq(),
      role,
      text: cleanText(text, 6000),
      kind,
      audioId,
      proactive,
      meta,
      createdAt: nowMs(),
    };
    store.insert('messages', message);
    return message;
  }

  /* --------------------------- generation --------------------------- */

  async function generateCharacterSheet({ userId, name, traits, profile }) {
    if (!ai.configured) {
      return localCharacterSheet({ seed: userId, name, traits, profile });
    }
    try {
      const { value } = await ai.generateJSON({
        systemInstruction:
          'You invent consistent, believable fictional lives for characters in a companionship app. Return only the requested JSON.',
        prompt: characterPrompt({ name, traits, profile }),
        schema: CHARACTER_SCHEMA,
        temperature: 1.1,
        maxOutputTokens: 1600,
      });
      if (!value || !Array.isArray(value.family)) throw new Error('incomplete character sheet');
      return normalizeSheet(value, { name, traits, profile });
    } catch (err) {
      console.error('[character] falling back to local generator:', err.message);
      return localCharacterSheet({ seed: userId, name, traits, profile });
    }
  }

  async function generateIntro({ userId, companion, profile }) {
    const fallback = localIntro(companion, profile);
    if (!ai.configured) return fallback;
    try {
      const { text } = await ai.generateContent({
        systemInstruction: buildSystemInstruction({
          sheet: companion.sheet,
          traits: companion.traits,
          profile,
          memories: [],
        }),
        prompt: introPrompt({ sheet: companion.sheet, profile, traits: companion.traits }),
        temperature: 1.05,
        maxOutputTokens: 220,
      });
      const cleaned = cleanText(text, 500);
      return cleaned || fallback;
    } catch (err) {
      console.error('[intro] falling back:', err.message);
      return fallback;
    }
  }

  function localIntro(companion, profile) {
    const name = profile.preferredName;
    const sheet = companion.sheet || {};
    const interest = (profile.interests || [])[0];
    const opener = [
      name ? `Hey ${name} — I'm ${companion.name}.` : `Hey — I'm ${companion.name}.`,
      interest
        ? `I saw you're into ${interest.toLowerCase()}, so we're going to get along.`
        : 'I have a feeling we are going to get along.',
      sheet.ongoingEvents?.[0]?.summary
        ? `Fair warning, I'm currently ${sheet.ongoingEvents[0].summary}.`
        : 'Fair warning: I overshare.',
    ];
    return opener.join(' ');
  }

  /* ---------------------------- memory ----------------------------- */

  async function extractMemories(userId) {
    if (!ai.configured) return { added: 0 };
    const companion = companionFor(userId);
    if (!companion) return { added: 0 };

    const recent = messagesFor(userId, { limit: 8 });
    if (!recent.some((m) => m.role === 'user')) return { added: 0 };

    const existing = memoriesFor(userId);
    const known = existing.slice(-50).map((m) => `- ${m.content}`).join('\n');
    const transcript = recent.map((m) => `${m.role === 'user' ? 'User' : companion.name}: ${m.text}`).join('\n');

    try {
      const { value } = await ai.generateJSON({
        systemInstruction: memoryExtractionPrompt(),
        prompt: `Known memories:\n${known || '(none)'}\n\nConversation:\n${transcript}`,
        schema: MEMORY_SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 700,
      });
      const items = Array.isArray(value?.memories) ? value.memories : [];
      const seen = new Set(existing.map((m) => normalizeForCompare(m.content)));
      let added = 0;
      for (const item of items.slice(0, 6)) {
        const content = cleanText(item?.content, 240);
        if (!content) continue;
        const key = normalizeForCompare(content);
        if (!key || seen.has(key)) continue;
        // Skip near-duplicates: one memory containing the other.
        const duplicate = [...seen].some((k) => k.includes(key) || key.includes(k));
        if (duplicate) continue;
        seen.add(key);
        store.insert('memories', {
          id: uid('mem'),
          userId,
          content,
          category: ['preference', 'person', 'event', 'plan', 'feeling', 'fact'].includes(item?.category)
            ? item.category
            : 'fact',
          origin: 'auto',
          sourceMessageId: recent[recent.length - 1]?.id || null,
          createdAt: nowMs(),
          updatedAt: nowMs(),
        });
        added += 1;
        if (memoriesFor(userId).length >= MAX_MEMORIES) break;
      }
      return { added };
    } catch (err) {
      console.error('[memory] extraction failed:', err.message);
      return { added: 0, error: err.code || 'error' };
    }
  }

  /* --------------------------- life engine -------------------------- */

  async function evolveLife(userId) {
    const companion = companionFor(userId);
    if (!companion || !ai.configured) return null;
    const recent = messagesFor(userId, { limit: 6 }).map((m) => `${m.role}: ${m.text}`).join('\n');
    try {
      const { value } = await ai.generateJSON({
        systemInstruction: 'You maintain continuity in a fictional character\'s life. Return only the requested JSON.',
        prompt: lifeEventPrompt({ sheet: companion.sheet, recent }),
        schema: LIFE_EVENT_SCHEMA,
        temperature: 1.0,
        maxOutputTokens: 200,
      });
      const summary = cleanText(value?.summary, 160);
      if (!summary) return null;
      const events = [...(companion.sheet.ongoingEvents || [])];
      const active = events.filter((e) => e.status !== 'resolved');
      const nextActive = [...active, { id: uid('ev'), summary, status: 'active', startedAt: nowMs() }];
      // Keep the world moving: retire the oldest event once a few are live.
      const kept = nextActive.slice(-5);
      const retired = nextActive.slice(0, Math.max(0, nextActive.length - 5)).map((e) => ({ ...e, status: 'resolved' }));
      const past = [...(companion.sheet.pastExperiences || []), ...retired.map((e) => e.summary)].slice(-12);
      const sheet = { ...companion.sheet, ongoingEvents: kept, pastExperiences: past, updatedAt: nowMs() };
      store.update('companions', userId, { sheet, updatedAt: nowMs() });
      return summary;
    } catch (err) {
      console.error('[life] evolution failed:', err.message);
      return null;
    }
  }

  /* --------------------------- live trends -------------------------- */

  function parseTrending(text) {
    const items = [];
    for (const rawLine of String(text || '').split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('-') && !line.startsWith('•')) continue;
      const body = line.replace(/^[-•]\s*/, '');
      const statusMatch = /^\[(confirmed|rumou?r|unconfirmed)\]/i.exec(body);
      const status = statusMatch ? (statusMatch[1].toLowerCase().startsWith('confirm') ? 'confirmed' : 'rumour') : 'reported';
      const rest = statusMatch ? body.slice(statusMatch[0].length).trim() : body;
      const [title, ...detailParts] = rest.split(/\s+[—–-]\s+/);
      const title_ = cleanText(title, 120);
      if (!title_) continue;
      items.push({
        title: title_,
        detail: cleanText(detailParts.join(' — '), 240),
        status,
      });
      if (items.length >= 6) break;
    }
    return items;
  }

  async function getTrending({ force = false } = {}) {
    const cache = store.get('trending', 'global');
    const fresh = cache && nowMs() - (cache.fetchedAt || 0) < TRENDING_TTL_MS;

    if (!ai.configured) {
      return {
        available: false,
        reason: 'ai_not_configured',
        message: 'Live trends need the AI connection. Add a Gemini API key and they will appear here.',
        items: [],
        sources: [],
        fetchedAt: cache?.fetchedAt || 0,
      };
    }
    if (!force && fresh) {
      return { ...cache, available: true, cached: true };
    }
    try {
      const { text, sources } = await ai.groundedSearch({
        systemInstruction:
          'You are a careful entertainment and culture researcher. You only report what search results support, and you label rumours as rumours.',
        prompt: trendingPrompt({ profile: {} }),
      });
      const items = parseTrending(text);
      if (!items.length) {
        return {
          available: false,
          reason: 'no_results',
          message: "I couldn't confirm anything current right now, so I won't make something up.",
          items: cache?.items || [],
          sources: sources.length ? sources : cache?.sources || [],
          fetchedAt: cache?.fetchedAt || 0,
          stale: Boolean(cache),
        };
      }
      const record = { id: 'global', items, sources, fetchedAt: nowMs() };
      store.insert('trending', record);
      return { ...record, available: true, cached: false };
    } catch (err) {
      return {
        available: false,
        reason: err.code || 'error',
        message:
          err.code === 'ai_rate_limited'
            ? 'The live feed is rate-limited right now. I would rather wait than invent headlines.'
            : "I couldn't reach the live feed, so I'm not going to pretend to know what's trending.",
        items: cache?.items || [],
        sources: cache?.sources || [],
        fetchedAt: cache?.fetchedAt || 0,
        stale: Boolean(cache),
      };
    }
  }

  function liveContextBlock() {
    const cache = store.get('trending', 'global');
    if (!cache?.items?.length) return '';
    if (nowMs() - (cache.fetchedAt || 0) > TRENDING_TTL_MS * 2) return '';
    const lines = cache.items
      .map((i) => `- ${i.title}${i.detail ? `: ${i.detail}` : ''} [${i.status}]`)
      .join('\n');
    return `\n\n# CURRENT ENTERTAINMENT / INTERNET CONTEXT (from a live search on ${new Date(cache.fetchedAt).toUTCString()})\n${lines}\nUse this only if it is relevant. Treat [rumour] items as unconfirmed chatter and say so. If the user asks about something not covered here, say you are not sure what is current right now rather than inventing it.`;
  }

  /* ------------------------------ gist ----------------------------- */

  async function makeGist(userId) {
    const profile = profileFor(userId);
    const companion = companionFor(userId);
    const record = store.get('gist', userId) || { id: userId, used: [] };
    const used = record.used || [];

    if (ai.configured && companion) {
      try {
        const { value } = await ai.generateJSON({
          systemInstruction:
            'You generate fresh, specific conversation starters for a companionship app. Never repeat an earlier opener. Return only the requested JSON.',
          prompt: gistPrompt({ profile, sheet: companion.sheet, avoid: used }),
          schema: GIST_SCHEMA,
          temperature: 1.25,
          maxOutputTokens: 260,
        });
        const topic = cleanText(value?.topic, 60);
        const opener = cleanText(value?.opener, 300);
        if (topic && opener) {
          rememberGist(userId, topic, record);
          return { topic, opener, source: 'ai' };
        }
      } catch (err) {
        console.error('[gist] generation failed:', err.message);
      }
    }

    const fallback = localGist(used);
    rememberGist(userId, fallback.topic, record);
    return { ...fallback, source: 'local' };
  }

  function rememberGist(userId, topic, record) {
    const used = [...(record.used || []), topic].slice(-40);
    store.insert('gist', { id: userId, used, lastAt: nowMs() });
  }

  /* --------------------------- proactive --------------------------- */

  async function composeProactive(userId) {
    const companion = companionFor(userId);
    if (!companion) return null;
    const profile = profileFor(userId);
    const memories = memoriesFor(userId);
    const recent = messagesFor(userId, { limit: 6 });
    const lastProactive = recent.filter((m) => m.proactive).length;
    const reason = lastProactive ? 'a new thought, not a repeat of last time' : 'reaching out first';

    if (ai.configured) {
      try {
        const { text } = await ai.generateContent({
          systemInstruction: buildSystemInstruction({
            sheet: companion.sheet,
            traits: companion.traits,
            profile,
            memories,
          }),
          prompt: proactivePrompt({ sheet: companion.sheet, profile, memories, lastMessages: recent, reason }),
          temperature: 1.1,
          maxOutputTokens: 220,
        });
        const cleaned = cleanText(text, 400);
        if (cleaned) return cleaned;
      } catch (err) {
        console.error('[proactive] generation failed:', err.message);
      }
    }
    // Never fabricate a companion message when live generation is unavailable.
    return null;
  }

  async function runProactiveForUser(userId, { force = false, now = nowMs() } = {}) {
    const companion = companionFor(userId);
    if (!companion) return { sent: false, reason: 'no_companion' };
    const settings = settingsFor(userId);
    if (!settings.notificationsEnabled) return { sent: false, reason: 'disabled' };
    if (settings.frequency === 'off') return { sent: false, reason: 'frequency_off' };
    if (!ai.configured) return { sent: false, reason: 'ai_not_configured' };

    if (!force && isQuietHours(now, settings.quietStart, settings.quietEnd, settings.timezoneOffsetMinutes)) {
      return { sent: false, reason: 'quiet_hours' };
    }
    const minGap = FREQUENCIES.find((f) => f.id === settings.frequency)?.minGapMs ?? Infinity;
    const last = settings.lastProactiveAt || 0;
    if (!force && last && now - last < minGap) {
      return { sent: false, reason: 'too_soon', nextInMs: minGap - (now - last) };
    }

    const text = await composeProactive(userId);
    if (!text) return { sent: false, reason: 'generation_unavailable' };

    const message = addMessage(userId, { role: 'assistant', text, proactive: true });
    store.update('settings', userId, { lastProactiveAt: now, nextProactiveAt: now + (minGap === Infinity ? 0 : minGap) });
    return { sent: true, message };
  }

  async function runProactiveSweep({ now = nowMs() } = {}) {
    const results = [];
    for (const user of store.all('users')) {
      try {
        const result = await runProactiveForUser(user.id, { now });
        if (result.sent) results.push({ userId: user.id, ...result });
      } catch (err) {
        console.error('[proactive] sweep error', err.message);
      }
    }
    return results;
  }

  /* ----------------------------- voice ----------------------------- */

  async function transcribe(audioBuffer, mimeType) {
    if (!ai.configured) return '';
    try {
      const { text } = await ai.transcribe({ audio: audioBuffer, mimeType });
      return cleanText(text, 1000);
    } catch (err) {
      console.error('[voice] transcription failed:', err.message);
      return '';
    }
  }

  /* -------------------------- prompt build ------------------------- */

  function buildChatPrompt(userId) {
    const profile = profileFor(userId);
    const companion = companionFor(userId);
    const memories = memoriesFor(userId);
    const system =
      buildSystemInstruction({
        sheet: companion.sheet,
        traits: companion.traits,
        profile,
        memories,
      }) + liveContextBlock();
    return { system, companion, profile, memories };
  }

  function historyForModel(userId) {
    return messagesFor(userId, { limit: MAX_HISTORY_FOR_MODEL }).map((m) => ({
      role: m.role,
      text: m.text || (m.kind === 'voice' ? '[voice note]' : ''),
    }));
  }

  function updateProfile(userId, patch) {
    const current = profileFor(userId);
    const next = sanitizeProfile(patch, current);
    store.insert('profiles', { ...next, id: userId });
    return next;
  }

  function updateSettings(userId, patch) {
    const current = settingsFor(userId);
    const next = sanitizeSettings(patch, current);
    if (next.frequency !== current.frequency) next.nextProactiveAt = 0;
    store.insert('settings', { ...next, id: userId });
    return next;
  }

  return {
    profileFor,
    settingsFor,
    companionFor,
    memoriesFor,
    messagesFor,
    messageCount,
    addMessage,
    generateCharacterSheet,
    generateIntro,
    extractMemories,
    evolveLife,
    getTrending,
    liveContextBlock,
    makeGist,
    composeProactive,
    runProactiveForUser,
    runProactiveSweep,
    transcribe,
    buildChatPrompt,
    historyForModel,
    updateProfile,
    updateSettings,
    parseTrending,
    localGists: LOCAL_GISTS,
    composeCharacter,
  };
}
