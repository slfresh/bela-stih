import { describe, expect, it } from 'vitest';
import { guestsFor } from '../src/home/guests';

const AVATAR_IDS = ['djed', 'baka', 'brko', 'snasa', 'student', 'teta', 'sofer', 'majstor', 'gazda'];

describe('the characters across the home table', () => {
  it('are two different house avatars, never the player\'s own, and rotate with the day', () => {
    const days = ['2026-09-09', '2026-09-10', '2026-09-11', '2026-10-01'];
    const seen = new Set<string>();
    for (const day of days) {
      for (const mine of AVATAR_IDS) {
        const [a, b] = guestsFor(day, mine, AVATAR_IDS);
        expect(a).not.toBe(mine);
        expect(b).not.toBe(mine);
        expect(a).not.toBe(b);
        expect(AVATAR_IDS).toContain(a);
        expect(AVATAR_IDS).toContain(b);
      }
      seen.add(guestsFor(day, 'djed', AVATAR_IDS).join('+'));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
