import fs from 'node:fs';
import path from 'node:path';

const COLLECTIONS = [
  'users',
  'sessions',
  'profiles',
  'companions',
  'messages',
  'memories',
  'settings',
  'gist',
  'proactive',
  'trending',
];

function emptyData() {
  const data = { version: 1, seq: 0, savedAt: 0 };
  for (const name of COLLECTIONS) data[name] = {};
  return data;
}

function ensureCollection(data, name) {
  if (!data[name] || typeof data[name] !== 'object') data[name] = {};
  return data[name];
}

/**
 * Durable, dependency-free document store.
 *
 * Everything lives in one JSON document that is written atomically
 * (tmp file + rename) so a crash mid-write can never truncate user data.
 * The interface is deliberately repository-shaped so a managed database
 * (Firestore/Postgres) can be dropped in behind the same calls.
 */
export function createStore({ file = null } = {}) {
  let data = emptyData();
  let timer = null;
  let closed = false;

  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        data = { ...emptyData(), ...parsed };
        for (const name of COLLECTIONS) ensureCollection(data, name);
      } catch (err) {
        // Never lose a corrupt file silently: keep a copy for recovery.
        try {
          fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
        } catch {
          /* best effort */
        }
        data = emptyData();
      }
    }
  }

  function writeNow() {
    if (!file || closed) return;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
    data.savedAt = Date.now();
  }

  function persist() {
    if (!file || closed) return;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        writeNow();
      } catch (err) {
        console.error('[store] write failed', err.message);
      }
    }, 25);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    writeNow();
  }

  const api = {
    get file() {
      return file;
    },
    all(name) {
      return Object.values(ensureCollection(data, name));
    },
    get(name, id) {
      if (!id) return null;
      return ensureCollection(data, name)[id] || null;
    },
    insert(name, doc) {
      ensureCollection(data, name)[doc.id] = doc;
      persist();
      return doc;
    },
    update(name, id, patch) {
      const bucket = ensureCollection(data, name);
      const existing = bucket[id];
      if (!existing) return null;
      const next = { ...existing, ...patch };
      bucket[id] = next;
      persist();
      return next;
    },
    remove(name, id) {
      const bucket = ensureCollection(data, name);
      if (!bucket[id]) return false;
      delete bucket[id];
      persist();
      return true;
    },
    find(name, predicate) {
      return api.all(name).filter(predicate);
    },
    nextSeq() {
      data.seq = (data.seq || 0) + 1;
      persist();
      return data.seq;
    },
    persist,
    flush,
    close() {
      flush();
      closed = true;
    },
    /** Removes every record that belongs to a user (account deletion). */
    purgeUser(userId) {
      api.remove('users', userId);
      api.remove('profiles', userId);
      api.remove('companions', userId);
      api.remove('settings', userId);
      api.remove('gist', userId);
      api.remove('proactive', userId);
      for (const s of api.find('sessions', (x) => x.userId === userId)) api.remove('sessions', s.id);
      for (const m of api.find('messages', (x) => x.userId === userId)) api.remove('messages', m.id);
      for (const m of api.find('memories', (x) => x.userId === userId)) api.remove('memories', m.id);
      flush();
    },
  };

  return api;
}
