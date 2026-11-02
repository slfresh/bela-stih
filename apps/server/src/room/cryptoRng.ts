import { randomBytes } from 'node:crypto';
import type { Rng } from '@belot/game-core';

/**
 * Randomness with no seed behind it.
 *
 * Seeding a 32-bit generator from crypto does not help: mulberry32's whole
 * state is 32 bits, so the deal it produces is still one of 2^32 — a table an
 * opponent can precompute once and then look up from their own six cards. The
 * only fix is for the server's shuffle not to come from a small seed at all.
 */
export function cryptoRng(): Rng {
  let pool = randomBytes(4096);
  let at = 0;
  return () => {
    if (at + 4 > pool.length) {
      pool = randomBytes(4096);
      at = 0;
    }
    const v = pool.readUInt32BE(at);
    at += 4;
    return v / 4294967296;
  };
}
