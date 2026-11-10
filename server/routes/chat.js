import express from 'express';
import { cleanText } from '../util.js';

/**
 * Streaming chat. The browser receives Server-Sent Events:
 *   {type:'delta', text}  … partial reply
 *   {type:'done', message} … persisted message
 *   {type:'error', code, message}
 * Nothing is ever answered from a canned reply table: if the model is not
 * reachable the client is told so explicitly.
 */
export function registerChatRoutes(app, { services, ai }) {
  const router = express.Router();

  router.get('/messages', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const limit = Math.min(80, Math.max(10, Number(req.query.limit) || 40));
    const before = Number(req.query.before) || null;
    const messages = services.messagesFor(req.user.id, { limit, before });
    res.json({
      messages,
      hasMore: messages.length === limit && Boolean(messages[0]?.seq > 1),
    });
  });

  /** Polled by the client for proactive messages that arrive while the app is open. */
  router.get('/updates', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const since = Number(req.query.since) || 0;
    const messages = services
      .store.find('messages', (m) => m.userId === req.user.id && m.createdAt > since && m.role === 'assistant')
      .sort((a, b) => a.seq - b.seq);
    res.json({ messages, serverTime: Date.now() });
  });

  router.post('/chat', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const userId = req.user.id;
    const voiceMessageId = cleanText(req.body?.voiceMessageId, 60);
    let text = cleanText(req.body?.text, 2000);
    let userMessage = null;

    if (voiceMessageId) {
      // A recorded voice note is answered in place instead of duplicating the turn.
      const existing = services.store.get('messages', voiceMessageId);
      if (!existing || existing.userId !== userId || existing.role !== 'user') {
        return res.status(404).json({ error: { code: 'not_found', message: 'That voice note no longer exists.' } });
      }
      if (!existing.meta?.transcript) {
        return res.status(409).json({
          error: {
            code: 'no_transcript',
            message: "I couldn't make out that voice note, so I can't answer it yet. Try typing it instead?",
          },
        });
      }
      text = existing.text;
      userMessage = existing;
    } else {
      if (!text) {
        return res.status(400).json({ error: { code: 'empty_message', message: 'Type something first.' } });
      }
      userMessage = services.addMessage(userId, { role: 'user', text });
    }

    const companion = services.companionFor(userId);
    if (!companion) {
      return res.status(409).json({ error: { code: 'no_companion', message: 'Create your companion first.' } });
    }

    if (!ai.configured) {
      return res.status(503).json({
        error: {
          code: 'ai_not_configured',
          message:
            'SOMEONE needs its AI connection to reply. Add a GEMINI_API_KEY on the server and your companion will answer here — I will not fake it.',
        },
        userMessage,
      });
    }
    const { system } = services.buildChatPrompt(userId);
    const history = services.historyForModel(userId);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const send = (payload) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    send({ type: 'start', userMessage });

    const controller = new AbortController();
    // Abort only when the client actually goes away. Listening on the request
    // fires as soon as the body ends, which killed every real model call.
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    let full = '';
    let saved = null;
    try {
      for await (const delta of ai.streamChat({
        systemInstruction: system,
        messages: history,
        temperature: 1.05,
        maxOutputTokens: 800,
        signal: controller.signal,
      })) {
        full += delta;
        send({ type: 'delta', text: delta });
      }
      const reply = full.trim();
      if (!reply) throw new Error('The reply came back empty.');
      saved = services.addMessage(userId, { role: 'assistant', text: reply });
      send({ type: 'done', message: saved });
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('[chat] stream failed:', err.code || '', err.message);
        send({
          type: 'error',
          code: err.code || 'ai_error',
          message:
            err.code === 'ai_blocked'
              ? err.message
              : err.code === 'ai_rate_limited'
                ? 'I need a second — say that again in a moment?'
                : "My thoughts didn't come through just then. Try sending that again?",
        });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }

    // Post-turn bookkeeping: memory extraction and a slowly moving fictional life.
    if (saved) {
      void (async () => {
        try {
          await services.extractMemories(userId);
          const count = services.messageCount(userId);
          if (count % 8 === 0) await services.evolveLife(userId);
        } catch (err) {
          console.error('[chat] background work failed:', err.message);
        }
      })();
    }
  });

  app.use('/api', router);
}
