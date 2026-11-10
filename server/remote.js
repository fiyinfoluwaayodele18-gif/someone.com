/**
 * Remote document backend for the store.
 *
 * The whole store document is kept in a single row so the store's synchronous,
 * repository-shaped API stays unchanged: reads come from memory, writes are
 * pushed to the database in the background. If the remote is unavailable the
 * app keeps running on its local file instead of failing requests.
 *
 * Uses the PostgREST endpoint that ships with Supabase, so no extra dependency
 * (and no extra supply-chain surface) is required.
 */
export function createSupabaseRemote(remote) {
  if (!remote || !remote.url || !remote.key) return null;

  const table = remote.table || 'someone_state';
  const rowId = remote.rowId || 'root';
  const base = `${String(remote.url).replace(/\/+$/, '')}/rest/v1/${table}`;
  const headers = {
    apikey: remote.key,
    authorization: `Bearer ${remote.key}`,
    'content-type': 'application/json',
  };

  return {
    table,
    async load() {
      const res = await fetch(`${base}?id=eq.${encodeURIComponent(rowId)}&select=data`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const rows = await res.json();
      return Array.isArray(rows) && rows[0] ? rows[0].data : null;
    },
    async save(doc) {
      const res = await fetch(base, {
        method: 'POST',
        headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ id: rowId, data: doc, updated_at: new Date().toISOString() }]),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`save failed: ${res.status} ${detail.slice(0, 200)}`);
      }
    },
  };
}
