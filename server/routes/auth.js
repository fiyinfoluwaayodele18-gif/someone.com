import express from 'express';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  sessionCookie,
  verifyPassword,
} from '../auth.js';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../model.js';
import { mePayload } from '../payload.js';
import { isValidEmail, normalizeEmail, nowMs, uid } from '../util.js';

function makeLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${req.ip || 'unknown'}:${String(req.body?.email || '').toLowerCase()}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Too many attempts. Please wait a few minutes and try again.' },
      });
      return;
    }
    next();
  };
}

function cookieSecure(req, config) {
  if (!config.secureCookies) return false;
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function registerAuthRoutes(app, { store, ai, config, services }) {
  const router = express.Router();
  const loginLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 12 });

  router.post('/auth/signup', loginLimiter, (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: { code: 'invalid_email', message: 'Enter a valid email address.' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { code: 'weak_password', message: 'Use at least 8 characters for your password.' } });
    }
    const existing = store.find('users', (u) => u.email === email)[0];
    if (existing) {
      return res.status(409).json({ error: { code: 'email_taken', message: 'That email already has an account. Try signing in.' } });
    }
    const { salt, hash } = hashPassword(password);
    const user = {
      id: uid('usr'),
      email,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: nowMs(),
      lastSeenAt: nowMs(),
    };
    store.insert('users', user);
    store.insert('profiles', { ...DEFAULT_PROFILE, id: user.id, completedAt: null });
    store.insert('settings', { ...DEFAULT_SETTINGS, id: user.id });

    const session = createSession(store, user.id, config.sessionTtlMs);
    res.setHeader(
      'Set-Cookie',
      sessionCookie(session.id, {
        maxAgeSeconds: Math.floor(config.sessionTtlMs / 1000),
        secure: cookieSecure(req, config),
      }),
    );
    res.status(201).json({ me: mePayload({ services, ai, user }) });
  });

  router.post('/auth/login', loginLimiter, (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const user = store.find('users', (u) => u.email === email)[0];
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: { code: 'bad_credentials', message: 'That email and password do not match.' } });
    }
    store.update('users', user.id, { lastSeenAt: nowMs() });
    const session = createSession(store, user.id, config.sessionTtlMs);
    res.setHeader(
      'Set-Cookie',
      sessionCookie(session.id, {
        maxAgeSeconds: Math.floor(config.sessionTtlMs / 1000),
        secure: cookieSecure(req, config),
      }),
    );
    res.json({ me: mePayload({ services, ai, user }) });
  });

  router.post('/auth/logout', (req, res) => {
    destroySession(store, req.sessionId);
    res.setHeader('Set-Cookie', clearSessionCookie({ secure: cookieSecure(req, config) }));
    res.json({ ok: true });
  });

  router.get('/auth/me', (req, res) => {
    res.json({ me: mePayload({ services, ai, user: req.user }) });
  });

  app.use('/api', router);
}
