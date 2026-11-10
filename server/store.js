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
export function createStore({ file = null, remote = null } = {}) {
  let data = emptyData();
  let timer = null;
  let closed = false;
  let remoteTimer = null;
  let remoteQueued = false;
  let saving = false;

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
    if (closed) return;
    scheduleRemote();
    if (!file) return;
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
    scheduleRemote();
  }

  /* ---- remote (durable) mirror -------------------------------------- */

  function snapshot() {
    return JSON.parse(JSON.stringify(data));
  }

  function scheduleRemote() {
    if (!remote || closed) return;
    remoteQueued = true;
    if (remoteTimer) return;
    remoteTimer = setTimeout(() => {
      remoteTimer = null;
      void pushRemote();
    }, 50);
    if (typeof remoteTimer.unref === 'function') remoteTimer.unref();
  }

  async function pushRemote() {
    if (!remote || closed || saving) return;
    if (!remoteQueued) return;
    remoteQueued = false;
    saving = true;
    try {
      await remote.save(snapshot());
    } catch (err) {
      // Keep the data queued so the next write retries instead of losing it.
      remoteQueued = true;
      console.error('[store] remote save failed:', err.message);
    } finally {
      saving = false;
    }
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
    /**
     * Hydrate from the remote backend before the server starts serving.
     * Remote wins when it already holds data; otherwise the local document is
     * pushed up so an existing deployment is never silently discarded.
     */
    async ready() {
      if (!remote) return api;
      try {
        const doc = await remote.load();
        if (doc && typeof doc === 'object' && Object.keys(doc).length > 0) {
          data = { ...emptyData(), ...doc };
          for (const name of COLLECTIONS) ensureCollection(data, name);
          writeNow();
        } else {
          await remote.save(snapshot());
        }
      } catch (err) {
        console.error('[store] remote load failed, continuing on local data:', err.message);
      }
      return api;
    },
    /** Waits for any queued remote write (used on shutdown). */
    async drain() {
      if (remoteTimer) {
        clearTimeout(remoteTimer);
        remoteTimer = null;
      }
      if (!remote || closed) return;
      remoteQueued = true;
      await pushRemote();
    },
    get remote() {
      return Boolean(remote);
    },
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
