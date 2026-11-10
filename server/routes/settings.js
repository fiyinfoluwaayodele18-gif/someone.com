import express from 'express';
import { mePayload } from '../payload.js';
import { clearSessionCookie } from '../auth.js';

export function registerSettingsRoutes(app, { services, ai, config }) {
  const router = express.Router();

  router.patch('/settings', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const settings = services.updateSettings(req.user.id, req.body || {});
    res.json({ settings, me: mePayload({ services, ai, user: req.user }) });
  });

  /** "Send one now" — uses the same generator and gating as the scheduler, forced. */
  router.post('/proactive/test', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const result = await services.runProactiveForUser(req.user.id, { force: true });
    if (!result.sent) {
      const messages = {
        no_companion: 'Create your companion first.',
        ai_not_configured: 'Connect the AI first — I will not send a prewritten message in its place.',
        generation_unavailable: "I couldn't think of anything worth saying right now. Try again in a moment.",
      };
      return res.status(409).json({
        error: {
          code: result.reason,
          message: messages[result.reason] || 'That message could not be generated.',
        },
      });
    }
    res.json({ message: result.message });
  });

  router.delete('/messages', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const mine = services.store.find('messages', (m) => m.userId === req.user.id);
    for (const message of mine) services.store.remove('messages', message.id);
    // A cleared history means the opening message can be re-seeded.
    services.store.update('companions', req.user.id, { introSent: false });
    res.json({ ok: true, removed: mine.length });
  });

  router.delete('/account', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    services.store.purgeUser(req.user.id);
    res.setHeader('Set-Cookie', clearSessionCookie({ secure: config.secureCookies }));
    res.json({ ok: true });
  });

  app.use('/api', router);
}
