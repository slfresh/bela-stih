import { describe, expect, it } from 'vitest';
import { AVATAR_IDS } from '../src/avatarIds';
import { guestsFor } from '../src/home/guests';

/** Every day of 2026, as the home's isoDay writes them. */
function daysOf2026(): string[] {
  const out: string[] = [];
  for (const d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe('the characters across the home table', () => {
  it('are two different house avatars, never the player\'s own', () => {
    for (const day of ['2026-09-09', '2026-09-10', '2026-09-11', '2026-10-01']) {
      for (const mine of AVATAR_IDS) {
        const [a, b] = guestsFor(day, mine, AVATAR_IDS);
        expect(a).not.toBe(mine);
        expect(b).not.toBe(mine);
        expect(a).not.toBe(b);
        expect(AVATAR_IDS).toContain(a);
        expect(AVATAR_IDS).toContain(b);
      }
    }
  });

  it('rotate through the house over a year, and tomorrow\'s pair is not today\'s', () => {
    // With the real twelve the old hash drew eleven pairs all year and the
    // same pair on every 9th → 10th of the month (35 repeats in 364 steps).
    const days = daysOf2026();
    expect(days.length).toBe(365);
    for (const mine of AVATAR_IDS) {
      const pairs = days.map((day) => guestsFor(day, mine, AVATAR_IDS).join('+'));
      let repeats = 0;
      for (let i = 1; i < pairs.length; i++) if (pairs[i] === pairs[i - 1]) repeats++;
      expect(new Set(pairs).size, `${mine}: distinct pairs`).toBeGreaterThanOrEqual(80);
      expect(repeats, `${mine}: same pair on consecutive days`).toBeLessThanOrEqual(8);
    }
  });

  it('copes with a house too small for a pair', () => {
    expect(guestsFor('2026-01-01', 'a', ['a'])).toEqual(['a', 'a']);
    expect(guestsFor('2026-01-01', 'a', ['a', 'b'])).toEqual(['b', 'b']);
  });
});
