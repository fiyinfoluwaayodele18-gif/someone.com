import test from 'node:test';
import assert from 'node:assert/strict';

import { createGemini } from '../server/gemini.js';

function stubFetch(handler) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = realFetch;
  };
}

/**
 * The Gemini API retires model names for new keys (we hit this live: 404
 * "no longer available to new users"). The client must move to a supported
 * model instead of failing every conversation.
 */
test('a retired model name falls through to a supported one', async () => {
  const urls = [];
  const restore = stubFetch(async (url) => {
    urls.push(String(url));
    if (String(url).includes('gemini-retired')) {
      return new Response(
        JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: 'no longer available to new users' } }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hey, good to see you' }] } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });

  try {
    const ai = createGemini({
      apiKey: 'test-key',
      baseUrl: 'https://example.test',
      chatModel: 'gemini-retired',
      fallbackModels: ['gemini-3.8-flash'],
      enabled: true,
    });

    const { text } = await ai.generateContent({ prompt: 'hi' });
    assert.equal(text, 'hey, good to see you');
    assert.ok(
      urls.some((u) => u.includes('gemini-3.8-flash')),
      'retried with the fallback model',
    );
    assert.equal(ai.model, 'gemini-3.8-flash', 'remembers the working model');
  } finally {
    restore();
  }
});

/**
 * Gemini 3 returns internal "thought" parts next to the answer. We saw this
 * live: the companion's messages were stored as "Drafting options:" and
 * "currently pretending to read the last" — reasoning text shown to the user.
 * Only answer parts may reach a conversation.
 */
test('internal thought parts never become the reply', async () => {
  const sse = [
    { candidates: [{ content: { parts: [{ text: 'Drafting options:', thought: true }] } }] },
    { candidates: [{ content: { parts: [{ text: 'ok so my little brother ' }] } }] },
    { candidates: [{ content: { parts: [{ text: 'stole my snacks again 😂' }] } }] },
  ]
    .map((payload) => `data: ${JSON.stringify(payload)}\n\n`)
    .join('');

  const restore = stubFetch(
    async () =>
      new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  );

  try {
    const ai = createGemini({
      apiKey: 'test-key',
      baseUrl: 'https://example.test',
      chatModel: 'gemini-3.8-flash',
      enabled: true,
    });

    let streamed = '';
    for await (const delta of ai.streamChat({
      systemInstruction: 'be a friend',
      messages: [{ role: 'user', text: 'what happened?' }],
    })) {
      streamed += delta;
    }
    assert.equal(streamed, 'ok so my little brother stole my snacks again 😂');
    assert.ok(!streamed.includes('Drafting options'), 'thought text was dropped');
  } finally {
    restore();
  }
});

test('thought parts are dropped from non-streamed replies too', async () => {
  const restore = stubFetch(async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Drafting options:', thought: true },
                { text: 'hey, good to see you' },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );

  try {
    const ai = createGemini({
      apiKey: 'test-key',
      baseUrl: 'https://example.test',
      chatModel: 'gemini-3.8-flash',
      enabled: true,
    });
    const { text } = await ai.generateContent({ prompt: 'hi' });
    assert.equal(text, 'hey, good to see you');
  } finally {
    restore();
  }
});

test('an overloaded model falls through to a model with capacity', async () => {
  const urls = [];
  const restore = stubFetch(async (url) => {
    urls.push(String(url));
    if (String(url).includes('gemini-busy')) {
      return new Response(
        JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'still here, sorry — busy week' }] } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });

  try {
    const ai = createGemini({
      apiKey: 'test-key',
      baseUrl: 'https://example.test',
      chatModel: 'gemini-busy',
      fallbackModels: ['gemini-3.8-flash'],
      enabled: true,
    });

    const { text } = await ai.generateContent({ prompt: 'hi' });
    assert.equal(text, 'still here, sorry — busy week');
    assert.equal(ai.model, 'gemini-3.8-flash', 'moved to the model that answered');
  } finally {
    restore();
  }
});
