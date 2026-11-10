import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { loadConfig } from '../server/config.js';

/* ------------------------------------------------------------------ */
/* Stub Gemini: shaped like the real client, records every prompt.     */
/* ------------------------------------------------------------------ */

const SHEET = {
  selfName: 'Maya',
  age: 24,
  hometown: 'Ibadan',
  job: 'junior architect',
  catchphrase: 'wild.',
  textingStyle: 'short, lower-case, far too many emojis',
  family: [
    {
      name: 'Nina',
      relation: 'mother',
      age: 52,
      personality: 'warm and nosy',
      quirk: 'rearranges furniture at 11pm',
    },
    {
      name: 'Dami',
      relation: 'little brother',
      age: 17,
      personality: 'chaotic and funny',
      quirk: 'treats my room like a supermarket',
    },
  ],
  friends: [{ name: 'Tobi', personality: 'loyal and loud', howTheyMet: 'sat next to each other in a badly run maths class' }],
  hobbies: ['thrifting', 'badly playing the guitar'],
  favouriteMovies: ['Everything Everywhere All at Once'],
  favouriteMusic: ['Afrobeats', 'Sade'],
  interests: ['architecture', 'street food'],
  likes: ['rainy afternoons'],
  dislikes: ['phone calls before 9am'],
  ongoingEvents: ['trying to save for a trip to Accra'],
};

function createStubAi() {
  const calls = [];
  const stub = {
    configured: true,
    model: 'stub-model',
    ttsConfigured: true,
    calls,
    async *streamChat(opts) {
      calls.push({ kind: 'streamChat', opts });
      yield 'Okay wait, ';
      yield 'afrobeats is objectively the correct answer.';
    },
    async generateContent(opts) {
      calls.push({ kind: 'generateContent', opts });
      return { text: 'Hey! I am Maya. I already have opinions about your playlist.' };
    },
    async generateJSON(opts) {
      calls.push({ kind: 'generateJSON', opts });
      const props = opts?.schema?.properties || {};
      if (props.family) return { value: SHEET };
      if (props.memories) {
        return {
          value: { memories: [{ content: 'Listens to a lot of afrobeats', category: 'preference' }] },
        };
      }
      if (props.summary) return { value: { summary: 'Adopted a stray cat and named him Biscuit' } };
      if (props.topic) return { value: { topic: 'fridge logic', opener: 'Why do we open the fridge hoping for new food? 😂' } };
      return { value: {} };
    },
    async groundedSearch(opts) {
      calls.push({ kind: 'groundedSearch', opts });
      return {
        text: '- [confirmed] A new sci-fi series tops the streaming charts — it landed this week and people are arguing about the ending\n- [rumour] A pop star is teasing a tour — nothing official yet',
        sources: [{ title: 'Example entertainment desk', url: 'https://example.com/story' }],
      };
    },
    async speak() {
      return { wav: Buffer.from('RIFF....WAVE', 'utf8'), mimeType: 'audio/wav' };
    },
    async transcribe() {
      return { text: 'hey, how did your day go' };
    },
  };
  return stub;
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

async function boot({ ai = createStubAi() } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'someone-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    SOMEONE_DATA_DIR: dir,
    GEMINI_API_KEY: 'test-key',
    SOMEONE_DISABLE_PROACTIVE: '1',
  });
  const store = createStore({ file: config.storeFile });
  const app = createApp({ config, store, ai });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const client = () => {
    let cookie = '';
    return async (method, url, body, headers = {}) => {
      const res = await fetch(base + url, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual',
      });
      const setCookies =
        typeof res.headers.getSetCookie === 'function'
          ? res.headers.getSetCookie()
          : (res.headers.get('set-cookie') || '').split(/,(?=[^;]+=)/).filter(Boolean);
      if (setCookies.length) cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: res.status, json, text, headers: res.headers };
    };
  };

  return {
    base,
    dir,
    store,
    ai,
    config,
    client,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      if (typeof store.flush === 'function') await store.flush();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function poll(fn, { tries = 40, gap = 25 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, gap));
  }
  return null;
}

const CREDS = { email: 'ada@example.com', password: 'lavender-tea-42' };

async function readyCompanion(ctx) {
  const call = ctx.client();
  const signup = await call('POST', '/api/auth/signup', CREDS);
  assert.equal(signup.status, 201, signup.text);

  const onboarding = await call('POST', '/api/onboarding', {
    preferredName: 'Ada',
    ageGroup: '25_34',
    interests: ['Music', 'Gaming'],
    entertainment: ['Sci-fi series'],
    humour: 'dry',
    communicationStyle: 'short_casual',
    companionship: 'friendship',
  });
  assert.equal(onboarding.status, 200, onboarding.text);

  const companion = await call('POST', '/api/companion', { name: 'Maya', traits: ['funny', 'caring'] });
  assert.equal(companion.status, 201, companion.text);
  return { call, companion: companion.json.companion };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test('public catalogs and unauthenticated access', async () => {
  const ctx = await boot();
  try {
    const call = ctx.client();
    const options = await call('GET', '/api/options');
    assert.equal(options.status, 200);
    assert.ok(options.json.traits.length >= 7);
    assert.ok(options.json.ageGroups.length > 0);

    const me = await call('GET', '/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.me.user, null);

    const guarded = await call('GET', '/api/memories');
    assert.equal(guarded.status, 401);
  } finally {
    await ctx.close();
  }
});

test('signup, onboarding and one permanent companion with a persistent life', async () => {
  const ctx = await boot();
  try {
    const { call, companion } = await readyCompanion(ctx);

    assert.equal(companion.name, 'Maya');
    assert.deepEqual(companion.traits, ['funny', 'caring']);
    assert.equal(companion.sheet.hometown, 'Ibadan');
    assert.equal(companion.sheet.family[0].name, 'Nina');
    assert.equal(companion.sheet.family[1].name, 'Dami');

    const me = await call('GET', '/api/auth/me');
    assert.equal(me.json.me.onboardingComplete, true);
    assert.equal(me.json.me.profile.preferredName, 'Ada');
    assert.equal(me.json.me.ai.configured, true);

    // The opening message is real generated text, not a scripted sample.
    const messages = await call('GET', '/api/messages');
    assert.equal(messages.status, 200);
    const intro = messages.json.messages.find((m) => m.meta?.intro);
    assert.ok(intro, 'companion intro message exists');
    assert.match(intro.text, /Maya/);

    // Only one companion per account.
    const again = await call('POST', '/api/companion', { name: 'Nope', traits: ['calm'] });
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, 'companion_exists');
  } finally {
    await ctx.close();
  }
});

test('personality and name edits keep the fictional world intact', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    const patched = await call('PATCH', '/api/companion', { name: 'Maya Rose', traits: ['playful', 'random'] });
    assert.equal(patched.status, 200, patched.text);
    assert.equal(patched.json.companion.name, 'Maya Rose');
    assert.deepEqual(patched.json.companion.traits, ['playful', 'random']);
    // Continuity: the family, hometown and ongoing events survive a retune.
    assert.equal(patched.json.companion.sheet.hometown, 'Ibadan');
    assert.equal(patched.json.companion.sheet.family[0].name, 'Nina');
    assert.ok(patched.json.companion.sheet.ongoingEvents.length > 0);
  } finally {
    await ctx.close();
  }
});

test('chat streams progressively, persists history and feeds the model the character world', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    const res = await call('POST', '/api/chat', { text: 'been listening to afrobeats all week, thoughts?' });
    assert.equal(res.status, 200, res.text);
    assert.match(res.text, /"type":"start"/);
    assert.match(res.text, /"type":"delta"/);
    assert.match(res.text, /afrobeats is objectively the correct answer/);
    assert.match(res.text, /"type":"done"/);

    const streamCall = ctx.ai.calls.filter((c) => c.kind === 'streamChat').pop();
    const system = String(streamCall.opts.systemInstruction || '');
    const prompt = String(streamCall.opts.prompt || '');
    assert.match(system + prompt, /Maya/);
    assert.match(system, /Nina|Dami|Ibadan/);

    const messages = await call('GET', '/api/messages');
    const texts = messages.json.messages.map((m) => m.text);
    assert.ok(texts.some((t) => t.includes('afrobeats all week')), 'user message stored');
    assert.ok(texts.some((t) => t.includes('objectively the correct answer')), 'assistant reply stored');
  } finally {
    await ctx.close();
  }
});

test('automatic memory is extracted, editable and deletable by the user', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    await call('POST', '/api/chat', { text: 'I have an exam next week and I am mostly listening to afrobeats' });

    const extracted = await poll(async () => {
      const res = await call('GET', '/api/memories');
      return res.json.memories.length ? res.json.memories : null;
    });
    assert.ok(extracted, 'memory extraction produced at least one memory');
    assert.ok(extracted.some((m) => /afrobeats/i.test(m.content)));

    const manual = await call('POST', '/api/memories', { content: 'Has an exam next week', category: 'event' });
    assert.equal(manual.status, 201);
    assert.equal(manual.json.memory.origin, 'manual');

    const edited = await call('PATCH', `/api/memories/${manual.json.memory.id}`, { content: 'Exam moved to Friday' });
    assert.equal(edited.status, 200);
    assert.equal(edited.json.memory.content, 'Exam moved to Friday');

    const removed = await call('DELETE', `/api/memories/${manual.json.memory.id}`);
    assert.equal(removed.status, 200);

    const cleared = await call('DELETE', '/api/memories');
    assert.equal(cleared.status, 200);
    const after = await call('GET', '/api/memories');
    assert.equal(after.json.memories.length, 0);
  } finally {
    await ctx.close();
  }
});

test('memories are private to their owner', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    const mine = await call('POST', '/api/memories', { content: 'Private detail' });
    assert.equal(mine.status, 201);

    const other = ctx.client();
    const signup = await other('POST', '/api/auth/signup', { email: 'other@example.com', password: 'another-pass-99' });
    assert.equal(signup.status, 201);

    const list = await other('GET', '/api/memories');
    assert.equal(list.json.memories.length, 0);

    const patch = await other('PATCH', `/api/memories/${mine.json.memory.id}`, { content: 'hijacked' });
    assert.equal(patch.status, 404);
  } finally {
    await ctx.close();
  }
});

test('settings control notifications, quiet hours and frequency', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    const res = await call('PATCH', '/api/settings', {
      notificationsEnabled: false,
      frequency: 'low',
      quietStart: '23:00',
      quietEnd: '07:30',
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.settings.notificationsEnabled, false);
    assert.equal(res.json.settings.frequency, 'low');
    assert.equal(res.json.settings.quietStart, '23:00');

    const bad = await call('PATCH', '/api/settings', { frequency: 'every-second' });
    assert.equal(bad.status, 200);
    assert.notEqual(bad.json.settings.frequency, 'every-second');
  } finally {
    await ctx.close();
  }
});

test('random gist and live trends are generated, not hardcoded', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);

    const gist = await call('POST', '/api/gist');
    assert.equal(gist.status, 200, gist.text);
    assert.ok(gist.json.opener, 'gist has an opener');

    const sent = await call('POST', '/api/gist/send');
    assert.equal(sent.status, 201, sent.text);
    assert.equal(sent.json.message.role, 'assistant');

    const trends = await call('GET', '/api/trending');
    assert.equal(trends.status, 200, trends.text);
    assert.equal(trends.json.available, true);
    assert.ok(trends.json.items.length >= 1);
    assert.equal(trends.json.items[0].status, 'confirmed');
    assert.equal(trends.json.items[1].status, 'rumour');
    assert.ok(trends.json.sources.length >= 1);
  } finally {
    await ctx.close();
  }
});

test('live trends state honestly when search is unavailable', async () => {
  const ai = createStubAi();
  ai.groundedSearch = async () => {
    const err = new Error('search offline');
    err.code = 'ai_unavailable';
    throw err;
  };
  const ctx = await boot({ ai });
  try {
    const { call } = await readyCompanion(ctx);
    const trends = await call('GET', '/api/trending');
    assert.equal(trends.status, 200);
    assert.equal(trends.json.available, false);
    assert.equal(trends.json.items.length, 0);
    assert.match(trends.json.message, /pretend|couldn't reach|make something up/i);
  } finally {
    await ctx.close();
  }
});

test('proactive message can be generated on demand', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    await call('PATCH', '/api/settings', { notificationsEnabled: true, frequency: 'high', quietStart: '00:00', quietEnd: '00:00' });
    const res = await call('POST', '/api/proactive/test');
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.message.role, 'assistant');
    assert.ok(res.json.message.text.length > 0);
    assert.equal(res.json.message.proactive, true);
  } finally {
    await ctx.close();
  }
});

test('history and account deletion remove data for real', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    await call('POST', '/api/chat', { text: 'hello there' });
    const cleared = await call('DELETE', '/api/messages');
    assert.equal(cleared.status, 200);
    assert.ok(cleared.json.removed >= 1);
    const empty = await call('GET', '/api/messages');
    assert.equal(empty.json.messages.length, 0);

    const deleted = await call('DELETE', '/api/account');
    assert.equal(deleted.status, 200);
    const me = await call('GET', '/api/auth/me');
    assert.equal(me.json.me.user, null);
    assert.equal(ctx.store.find('users', (u) => u.email === CREDS.email).length, 0);
  } finally {
    await ctx.close();
  }
});

test('unknown voice clips 404 instead of inventing audio', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    const res = await call('GET', '/api/voice/aud_missing');
    assert.equal(res.status, 404);
  } finally {
    await ctx.close();
  }
});

test('cross-origin state-changing requests are rejected', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    const res = await call('POST', '/api/chat', { text: 'hi' }, { origin: 'https://evil.example' });
    assert.ok(res.status === 403 || res.status === 400, `expected rejection, got ${res.status}`);
  } finally {
    await ctx.close();
  }
});

test('conversations and companion survive a store reload', async () => {
  const ctx = await boot();
  try {
    const { call } = await readyCompanion(ctx);
    await call('POST', '/api/chat', { text: 'remember that I love mangoes' });
    if (typeof ctx.store.flush === 'function') await ctx.store.flush();
    await new Promise((r) => setTimeout(r, 60));

    const reloaded = createStore({ file: ctx.config.storeFile });
    const user = reloaded.find('users', (u) => u.email === CREDS.email)[0];
    assert.ok(user, 'user persisted');
    const companion = reloaded.get('companions', user.id);
    assert.ok(companion, 'companion persisted');
    assert.equal(companion.sheet.family[0].name, 'Nina');
    assert.ok(reloaded.find('messages', (m) => m.userId === user.id).length >= 2);
  } finally {
    await ctx.close();
  }
});
