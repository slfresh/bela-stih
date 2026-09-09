import { describe, expect, it } from 'vitest';
import { luminance, shade } from '../src/colour';
import { ROOMS, roomStyle } from '../src/cosmetics';

/** A room's colours are derived; this keeps the derivation honest. */
describe('the rooms', () => {
  it('light the baize at the centre and shade it at the rim, on every felt', () => {
    for (const [id, r] of Object.entries(ROOMS)) {
      expect(luminance(r.feltLight), id).toBeGreaterThan(luminance(r.felt));
      expect(luminance(r.felt), id).toBeGreaterThan(luminance(r.feltDeep));
      expect(luminance(r.rimLight), id).toBeGreaterThan(luminance(r.rim));
      expect(luminance(r.rim), id).toBeGreaterThan(luminance(r.rimDark));
      // The page is the darkest thing in the room: the table stands off it.
      expect(luminance(r.page), id).toBeLessThan(luminance(r.feltDeep));
    }
  });

  it('fall back to green for an unknown cosmetic', () => {
    expect(roomStyle('nope')).toBe(ROOMS.green);
  });

  it('shade() moves a colour and leaves a bad one alone', () => {
    expect(shade('#000000', 0.5)).toBe('#808080');
    expect(shade('#ffffff', -0.5)).toBe('#808080');
    expect(shade('red', 0.3)).toBe('red');
  });
});
