import crypto from 'node:crypto';
import { uid, nowMs } from './util.js';

const SESSION_COOKIE = 'someone_session';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function createSession(store, userId, ttlMs) {
  const id = crypto.randomBytes(32).toString('hex');
  const session = { id, userId, createdAt: nowMs(), expiresAt: nowMs() + ttlMs };
  store.insert('sessions', session);
  return session;
}

export function destroySession(store, sessionId) {
  if (sessionId) store.remove('sessions', sessionId);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function readSessionId(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

export function sessionCookie(value, { maxAgeSeconds, secure }) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie({ secure }) {
  return sessionCookie('', { maxAgeSeconds: 0, secure });
}

/**
 * Resolves the signed-in user for a request, dropping expired sessions.
 * Sets req.user (public shape) and req.sessionId.
 */
export function attachUser(store) {
  return function attach(req, _res, next) {
    const sessionId = readSessionId(req);
    if (!sessionId) return next();
    const session = store.get('sessions', sessionId);
    if (!session) return next();
    if (session.expiresAt < nowMs()) {
      store.remove('sessions', sessionId);
      return next();
    }
    const user = store.get('users', session.userId);
    if (!user) {
      store.remove('sessions', sessionId);
      return next();
    }
    req.sessionId = sessionId;
    req.user = { id: user.id, email: user.email, createdAt: user.createdAt };
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in to continue.' } });
    return;
  }
  next();
}

/**
 * Rejects cross-site state-changing requests. Combined with SameSite=Lax
 * cookies this blocks classic CSRF against the JSON API.
 */
export function sameOriginGuard(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser client (tests, curl)
  try {
    const host = new URL(origin).host;
    if (host !== req.headers.host) {
      res.status(403).json({ error: { code: 'bad_origin', message: 'Cross-origin request blocked.' } });
      return;
    }
  } catch {
    res.status(403).json({ error: { code: 'bad_origin', message: 'Invalid origin.' } });
    return;
  }
  next();
}

export { SESSION_COOKIE };
