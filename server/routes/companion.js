import express from 'express';
import { mePayload } from '../payload.js';
import { sanitizeTraits } from '../model.js';
import { cleanText, nowMs, uid } from '../util.js';

const NAME_MAX = 24;

export function registerCompanionRoutes(app, { services, ai }) {
  const router = express.Router();

  router.get('/companion', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const companion = services.companionFor(req.user.id);
    if (!companion) return res.status(404).json({ error: { code: 'not_found', message: 'No companion yet.' } });
    res.json({ companion });
  });

  /** One permanent companion per account. */
  router.post('/companion', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const userId = req.user.id;
    if (services.companionFor(userId)) {
      return res.status(409).json({
        error: { code: 'companion_exists', message: 'You already have a companion. You can rename them or change their personality.' },
      });
    }
    const name = cleanText(req.body?.name, NAME_MAX);
    if (!name) {
      return res.status(400).json({ error: { code: 'invalid_name', message: 'Give your companion a name.' } });
    }
    const traits = sanitizeTraits(req.body?.traits);
    if (!traits.length) {
      return res.status(400).json({ error: { code: 'invalid_traits', message: 'Pick at least one personality trait.' } });
    }

    const profile = services.profileFor(userId);
    const sheet = await services.generateCharacterSheet({ userId, name, traits, profile });
    const companion = {
      id: userId,
      userId,
      name,
      traits,
      sheet,
      introSent: false,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    services.store.insert('companions', companion);

    const intro = await services.generateIntro({ userId, companion, profile });
    services.addMessage(userId, { role: 'assistant', text: intro, meta: { intro: true } });
    services.store.update('companions', userId, { introSent: true });

    res.status(201).json({ companion: services.companionFor(userId), me: mePayload({ services, ai, user: req.user }) });
  });

  /** Rename / retune personality without losing identity, life or memories. */
  router.patch('/companion', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const userId = req.user.id;
    const existing = services.companionFor(userId);
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No companion yet.' } });

    const patch = {};
    if (req.body?.name !== undefined) {
      const name = cleanText(req.body.name, NAME_MAX);
      if (!name) return res.status(400).json({ error: { code: 'invalid_name', message: 'Give your companion a name.' } });
      patch.name = name;
      patch.sheet = { ...existing.sheet, selfName: name };
    }
    if (req.body?.traits !== undefined) {
      const traits = sanitizeTraits(req.body.traits);
      if (!traits.length) {
        return res.status(400).json({ error: { code: 'invalid_traits', message: 'Keep at least one personality trait.' } });
      }
      patch.traits = traits;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: { code: 'nothing_to_update', message: 'Nothing to change.' } });
    }
    const companion = services.store.update('companions', userId, { ...patch, updatedAt: nowMs() });
    res.json({ companion, me: mePayload({ services, ai, user: req.user }) });
  });

  app.use('/api', router);
}
