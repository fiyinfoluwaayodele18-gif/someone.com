import express from 'express';
import { AGE_GROUPS, TRAITS, HUMOURS, STYLES, GOALS, INTEREST_SUGGESTIONS, FREQUENCIES } from '../model.js';
import { mePayload } from '../payload.js';

export function registerProfileRoutes(app, { services, ai }) {
  const router = express.Router();

  // Catalogs are public data (no user content) and drive the onboarding UI.
  router.get('/options', (_req, res) => {
    res.json({
      ageGroups: AGE_GROUPS,
      traits: TRAITS,
      humours: HUMOURS,
      styles: STYLES,
      goals: GOALS,
      interestSuggestions: INTEREST_SUGGESTIONS,
      frequencies: FREQUENCIES,
    });
  });

  router.get('/', (req, res) => {
    res.json(mePayload({ services, ai, user: req.user }));
  });

  /** Onboarding completion: stores the collected answers and marks the profile done. */
  router.post('/onboarding', (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in to continue.' } });
      return;
    }
    const body = req.body || {};
    const profile = services.updateProfile(req.user.id, {
      ...body,
      completedAt: Date.now(),
    });
    res.json({ profile, me: mePayload({ services, ai, user: req.user }) });
  });

  /** Later edits to the same answers (Settings → About you). */
  router.patch('/profile', (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in to continue.' } });
      return;
    }
    const profile = services.updateProfile(req.user.id, req.body || {});
    res.json({ profile, me: mePayload({ services, ai, user: req.user }) });
  });

  app.use('/api', router);
}
