import express from 'express';
import { cleanText } from '../util.js';

export function registerLiveRoutes(app, { services, ai }) {
  const router = express.Router();

  /** Cached live trends with explicit provenance and honest failure states. */
  router.get('/trending', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const force = req.query.refresh === '1';
    const result = await services.getTrending({ force });
    res.json(result);
  });

  /** A fresh conversation starter, generated each time (never a fixed list). */
  router.post('/gist', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    if (!ai.configured) {
      return res.status(503).json({
        error: {
          code: 'ai_not_configured',
          message: 'Conversation starters need the AI connection. Add GEMINI_API_KEY and they will appear here.',
        },
      });
    }
    if (!services.companionFor(req.user.id)) {
      return res.status(409).json({ error: { code: 'no_companion', message: 'Create your companion first.' } });
    }
    const gist = await services.makeGist(req.user.id);
    res.json(gist);
  });

  /** The companion opens the topic as a real message in the thread. */
  router.post('/gist/send', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const userId = req.user.id;
    if (!ai.configured) {
      return res.status(503).json({
        error: { code: 'ai_not_configured', message: 'SOMEONE will not send a prewritten message in place of the AI.' },
      });
    }
    if (!services.companionFor(userId)) {
      return res.status(409).json({ error: { code: 'no_companion', message: 'Create your companion first.' } });
    }
    const gist = await services.makeGist(userId);
    if (!gist?.opener) {
      return res.status(409).json({
        error: { code: 'gist_unavailable', message: "I couldn't come up with a fresh topic just now. Try again in a moment." },
      });
    }
    const message = services.addMessage(userId, {
      role: 'assistant',
      text: cleanText(gist.opener, 400),
      meta: { gist: gist.topic || null },
    });
    res.status(201).json({ message, gist });
  });

  app.use('/api', router);
}
