/**
 * Why getting to a table failed, in the player's terms rather than the
 * library's. Measured against Colyseus 0.16: a code nobody has open is 4212
 * `room "X" not found`; a table that has started, or is full (a full table
 * starts), is 4212 `room "X" is locked`; no server at all is an error with no
 * code ("connect ECONNREFUSED", "Failed to fetch", "Network request failed").
 */
export type Trouble = 'noSuchTable' | 'tableClosed' | 'offline' | 'server';

export function troubleOf(err: unknown): Trouble {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'number' ? e.code : null;
  const message = typeof e?.message === 'string' ? e.message : '';
  if (code === 4212 && /not found/i.test(message)) return 'noSuchTable';
  if (code === 4212) return 'tableClosed';
  if (code === null) return 'offline';
  return 'server';
}

/** Trying again can help only when the fault was the line or the server. */
export function retryHelps(t: Trouble | null): boolean {
  return t === 'offline' || t === 'server';
}
