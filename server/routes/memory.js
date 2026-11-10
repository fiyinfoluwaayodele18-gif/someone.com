import express from 'express';
import { cleanText, nowMs, uid } from '../util.js';

const CATEGORIES = ['preference', 'person', 'event', 'plan', 'feeling', 'fact'];

export function registerMemoryRoutes(app, { services }) {
  const router = express.Router();

  router.get('/memories', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    res.json({ memories: services.memoriesFor(req.user.id) });
  });

  router.post('/memories', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const content = cleanText(req.body?.content, 240);
    if (content.length < 2) {
      return res.status(400).json({ error: { code: 'invalid_content', message: 'Write something to remember first.' } });
    }
    const memory = {
      id: uid('mem'),
      userId: req.user.id,
      content,
      category: CATEGORIES.includes(req.body?.category) ? req.body.category : 'fact',
      origin: 'manual',
      sourceMessageId: null,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    services.store.insert('memories', memory);
    res.status(201).json({ memory });
  });

  router.patch('/memories/:id', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const existing = services.store.get('memories', req.params.id);
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: { code: 'not_found', message: 'That memory no longer exists.' } });
    }
    const content = cleanText(req.body?.content, 240);
    if (content.length < 2) {
      return res.status(400).json({ error: { code: 'invalid_content', message: 'Write something to remember first.' } });
    }
    const memory = services.store.update('memories', existing.id, {
      content,
      category: CATEGORIES.includes(req.body?.category) ? req.body.category : existing.category,
      origin: 'manual',
      updatedAt: nowMs(),
    });
    res.json({ memory });
  });

  router.delete('/memories/:id', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const existing = services.store.get('memories', req.params.id);
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: { code: 'not_found', message: 'That memory no longer exists.' } });
    }
    services.store.remove('memories', existing.id);
    res.json({ ok: true });
  });

  router.delete('/memories', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const mine = services.memoriesFor(req.user.id);
    for (const memory of mine) services.store.remove('memories', memory.id);
    res.json({ ok: true, removed: mine.length });
  });

  app.use('/api', router);
}
