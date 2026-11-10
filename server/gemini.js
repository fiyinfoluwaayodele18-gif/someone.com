const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

export class AiError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gemini 3 answers arrive as several parts, some of which are internal
 * "thought" parts. Only the answer text may reach the user — leaking a thought
 * part showed up live as a companion message reading "Drafting options:".
 */
function answerText(parts) {
  return (parts || [])
    .filter((part) => part && part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

/**
 * Server-side Gemini client. The API key never leaves the server: the browser
 * only ever talks to our own /api routes.
 */
export function createGemini(cfg) {
  const configured = Boolean(cfg.apiKey) && cfg.enabled !== false;

  // Model names get retired and models get overloaded. Walk the chain in order,
  // remember which names are currently unusable, and always prefer the best one.
  const chatChain = [...new Set([cfg.chatModel, ...(cfg.fallbackModels || [])].filter(Boolean))];
  const RETIRED_MS = 10 * 60 * 1000;
  const BUSY_MS = 60 * 1000;
  const skipUntil = new Map();

  function chatModel() {
    const now = Date.now();
    const usable = chatChain.find((m) => (skipUntil.get(m) || 0) <= now);
    if (usable) return usable;
    // Everything is cooling down: start from the top rather than staying stuck.
    skipUntil.clear();
    return chatChain[0];
  }

  function skip(model, ms) {
    if (chatChain.includes(model)) skipUntil.set(model, Date.now() + ms);
  }

  function endpoint(model, action) {
    const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
    return `${base}/v1beta/models/${model}:${action}`;
  }

  async function request(model, action, body, { signal, attempt = 0 } = {}) {
    if (!configured) {
      throw new AiError(
        'ai_not_configured',
        'Live AI is not connected yet. Add a GEMINI_API_KEY to enable conversations.',
        503,
      );
    }
    let res;
    try {
      res = await fetch(endpoint(model, action), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new AiError('ai_unreachable', 'Could not reach the language service. Please try again.', 503);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const idx = chatChain.indexOf(model);
      const next = idx >= 0 ? chatChain[idx + 1] : undefined;
      const retryable = res.status === 429 || res.status === 503;
      if (res.status === 404) {
        // Retired for this key: stop retrying it for a while, but never cache it
        // as "the" model — a bad fallback must not poison later requests.
        skip(model, RETIRED_MS);
        if (next) {
          console.warn(`[gemini] model "${model}" is unavailable, retrying with "${next}"`);
          return request(next, action, body, { signal, attempt });
        }
      }
      if (retryable && attempt === 0) {
        await sleep(600);
        return request(model, action, body, { signal, attempt: attempt + 1 });
      }
      // Still overloaded after a retry: another model may have capacity.
      if (retryable) {
        skip(model, BUSY_MS);
        if (next) {
          console.warn(`[gemini] model "${model}" is busy, retrying with "${next}"`);
          return request(next, action, body, { signal });
        }
      }
      if (res.status === 429) {
        throw new AiError('ai_rate_limited', 'The companion is a little busy right now. Try again in a moment.', 429);
      }
      console.error('[gemini] request failed', res.status, detail.slice(0, 400));
      throw new AiError('ai_upstream', 'The language service returned an error. Please try again.', 502);
    }
    return res;
  }

  function toContents(messages) {
    return messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));
  }

  /** Streams plain text deltas from the chat model. */
  async function* streamChat({ systemInstruction, messages, temperature = 1.0, maxOutputTokens = 1200, signal }) {
    const res = await request(
      chatModel(),
      'streamGenerateContent?alt=sse',
      {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: toContents(messages),
        generationConfig: { temperature, maxOutputTokens, topP: 0.95 },
        safetySettings: SAFETY_SETTINGS,
      },
      { signal },
    );

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let blocked = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const candidate = json?.candidates?.[0];
        if (candidate?.finishReason && ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(candidate.finishReason)) {
          blocked = candidate.finishReason;
        }
        for (const part of candidate?.content?.parts || []) {
          const piece = answerText([part]);
          if (piece) yield piece;
        }
      }
    }
    if (blocked) {
      throw new AiError('ai_blocked', "I can't go there with you — but I'm still here. Want to talk about something else?", 200);
    }
  }

  async function generateContent({ systemInstruction, messages, prompt, tools, temperature = 0.9, maxOutputTokens = 1200, responseSchema, signal }) {
    const contents = messages
      ? toContents(messages)
      : [{ role: 'user', parts: [{ text: prompt }] }];
    const body = {
      contents,
      generationConfig: { temperature, maxOutputTokens },
      safetySettings: SAFETY_SETTINGS,
    };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (responseSchema) {
      body.generationConfig.responseMimeType = 'application/json';
      body.generationConfig.responseSchema = responseSchema;
    }
    if (tools) body.tools = tools;

    const res = await request(chatModel(), 'generateContent', body, { signal });
    const json = await res.json();
    const candidate = json?.candidates?.[0];
    const text = answerText(candidate?.content?.parts).trim();
    return { text, raw: json, finishReason: candidate?.finishReason || null };
  }

  async function generateJSON(options) {
    // Callers pass `schema`; the REST API calls it responseSchema.
    const { schema, ...rest } = options;
    const { text } = await generateContent({ ...rest, responseSchema: schema || rest.responseSchema });
    return { value: parseJson(text), text };
  }

  /** Live search grounding (Google Search tool) with citation extraction. */
  async function groundedSearch({ systemInstruction, prompt, signal }) {
    const { text, raw } = await generateContent({
      systemInstruction,
      prompt,
      tools: [{ google_search: {} }],
      temperature: 0.4,
      maxOutputTokens: 1400,
      signal,
    });
    const chunks = raw?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = [];
    const seen = new Set();
    for (const chunk of chunks) {
      const web = chunk?.web;
      if (!web?.uri || seen.has(web.uri)) continue;
      seen.add(web.uri);
      sources.push({ title: web.title || web.uri, url: web.uri });
    }
    return { text, sources };
  }

  /** Verbatim transcription of a voice note (inline audio). */
  async function transcribe({ audio, mimeType, signal }) {
    const res = await request(
      chatModel(),
      'generateContent',
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Transcribe this voice note verbatim. Return only the spoken words, no commentary.' },
              { inlineData: { mimeType: mimeType || 'audio/webm', data: audio.toString('base64') } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 400 },
      },
      { signal },
    );
    const json = await res.json();
    const text = answerText(json?.candidates?.[0]?.content?.parts).trim();
    return { text };
  }

  /** Gemini TTS returns raw PCM; we wrap it in a WAV container for playback. */
  async function speak({ text, voice, signal }) {
    const res = await request(
      cfg.ttsModel,
      'generateContent',
      {
        contents: [{ role: 'user', parts: [{ text: `Say this naturally, like a friend talking: ${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || cfg.ttsVoice } } },
        },
      },
      { signal },
    );
    const json = await res.json();
    const inline = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!inline?.data) throw new AiError('tts_empty', 'No audio was returned.', 502);
    const pcm = Buffer.from(inline.data, 'base64');
    const rate = Number((/rate=(\d+)/.exec(inline.mimeType || '') || [])[1] || 24000);
    return { wav: pcmToWav(pcm, rate), sampleRate: rate };
  }

  return {
    configured,
    get model() {
      return chatModel();
    },
    ttsModel: cfg.ttsModel,
    ttsConfigured: configured,
    streamChat,
    generateContent,
    generateJSON,
    groundedSearch,
    speak,
    transcribe,
  };
}

export function parseJson(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Wraps 16-bit mono little-endian PCM in a 44-byte WAV header. */
export function pcmToWav(pcm, sampleRate = 24000, channels = 1) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * 16) / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * 16) / 8, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
