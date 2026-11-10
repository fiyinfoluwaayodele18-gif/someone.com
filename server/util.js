import crypto from 'node:crypto';

export function uid(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function nowMs() {
  return Date.now();
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function cleanText(value, maxLength = 4000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, maxLength);
}

export function uniqueStrings(list, max = 12, maxLength = 60) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const value = cleanText(typeof item === 'string' ? item : '', maxLength);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

/** Minutes since local midnight for a given epoch, using a fixed UTC offset. */
export function localMinutes(ms, offsetMinutes = 0) {
  const total = Math.floor(ms / 60000) + Number(offsetMinutes || 0);
  return ((total % 1440) + 1440) % 1440;
}

export function parseClock(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return fallback;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  return h * 60 + m;
}

/** True when `ms` falls inside [start, end) in the user's own timezone. */
export function isQuietHours(ms, startMinutes, endMinutes, offsetMinutes = 0) {
  const start = parseClock(startMinutes, 22 * 60);
  const end = parseClock(endMinutes, 8 * 60);
  const now = localMinutes(ms, offsetMinutes);
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function formatClock(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Small per-key sliding window limiter used on auth + chat endpoints. */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return function limit(key) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return { ok: true, remaining: max - 1, retryAfterMs: 0 };
    }
    entry.count += 1;
    if (entry.count > max) {
      return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - entry.start) };
    }
    return { ok: true, remaining: max - entry.count, retryAfterMs: 0 };
  };
}

export function escapeForPrompt(value, max = 400) {
  return String(value || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max);
}
