/**
 * Helpers for `GameDefinition.normalize` — turning an untrusted object off the
 * wire into one of the game's own actions, or nothing.
 */

/** JSON with object keys sorted, so two equal actions serialise identically. */
export function canonical(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

/**
 * The strictest normaliser: the raw action must equal one of the legal ones.
 * Right for games whose legal list enumerates every option (bid, fold, hit).
 */
export function matchLegal<A>(legal: readonly A[], raw: unknown): A | null {
  const want = canonical(raw);
  for (const a of legal) if (canonical(a) === want) return a;
  return null;
}

/** Is `raw` an object with a string `type` and this `seat`? The minimum any action must be. */
export function looksLikeAction(raw: unknown, seat: number): raw is { type: string; seat: number } {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return typeof r.type === 'string' && r.seat === seat;
}
