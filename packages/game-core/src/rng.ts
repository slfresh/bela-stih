/**
 * Deterministic randomness, shared by every game.
 *
 * mulberry32, byte for byte the generator in `@belot/engine` (cards.ts) — a
 * test pins the two to the same stream — kept here so a game module needs
 * nothing from the Bela engine to shuffle. It is NOT cryptographic: a server
 * injects a crypto-backed `Rng` instead of seeding one.
 */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with an injected generator. Returns a new array. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/**
 * The bot stream a session derives from a table seed, exactly as `Table` has
 * always done: the same constant keeps every existing seeded match replaying
 * the same way.
 */
export const BOT_RNG_SALT = 0x9e3779b9;
