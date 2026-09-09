import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Pins that live in the source rather than in behaviour.
 *
 * Each of these guards a fix whose failure mode is silent: a card face that
 * loses its memo just renders twelve times a tick again, an anchor that goes
 * back to measuring on every commit just costs frames, and nothing in a test
 * of behaviour would notice. So the text itself is checked.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, '../src', rel), 'utf8');

describe('the card tree stays memoised', () => {
  it('CardFace, CardBackFace, PlayingCard, SeatPuck and FanCard are wrapped in memo', () => {
    const cardFace = src('deck/CardFace.tsx');
    expect(cardFace).toMatch(/export const CardFace = memo\(/);
    expect(cardFace).toMatch(/export const CardBackFace = memo\(/);
    expect(src('PlayingCard.tsx')).toMatch(/export const PlayingCard = memo\(/);
    expect(src('table/SeatPuck.tsx')).toMatch(/export const SeatPuck = memo\(/);
    expect(src('TableScreen.tsx')).toMatch(/const FanCard = memo\(/);
  });

  it('a memoised card never reads cosmetics() during its own render', () => {
    // The parent reads it and passes it down, so a deck change reaches the
    // card as a changed prop instead of being swallowed by the memo.
    const cardFace = src('deck/CardFace.tsx');
    expect(cardFace).not.toMatch(/cosmetics\(\)/);
    const playingCard = src('PlayingCard.tsx');
    const body = playingCard.slice(playingCard.indexOf('export const PlayingCard'), playingCard.indexOf('export function CardBack'));
    expect(body).not.toMatch(/cosmetics\(\)/);
  });
});

describe('anchors measure on demand', () => {
  it('has no bare useEffect(measure) that re-measures on every commit', () => {
    const registry = src('anim/AnchorRegistry.tsx');
    expect(registry).not.toMatch(/useEffect\(measure\)/);
    expect(registry).toMatch(/map\.subscribe\(measure\)/);
  });

  it('the home screen no longer re-renders on every scroll event', () => {
    const home = src('HomeScreen.tsx');
    expect(home).not.toMatch(/setScrollTick/);
    expect(home).not.toMatch(/onScroll=/);
  });
});

describe('sprite timing has one source of truth', () => {
  it('the overlay carries no hard-coded card width or sprite duration', () => {
    const overlay = src('anim/EffectsOverlay.tsx');
    expect(overlay).not.toMatch(/const CARD_W/);
    expect(overlay).not.toMatch(/withTiming\(1, \{ duration: 240/);
    expect(overlay).not.toMatch(/withTiming\(1, \{ duration: 320/);
    expect(overlay).toMatch(/from '\.\/lifetimes'/);
  });

  it('the spawner scales every duration by the speed it is given', () => {
    const fx = src('table/fx.ts');
    expect(fx).toMatch(/FLIGHT_MS \* speed/);
    expect(fx).not.toMatch(/duration: 260/);
  });

  it('fx.ts stays free of react-native, so the golden-timings test can run under node', () => {
    expect(src('table/fx.ts')).not.toMatch(/from 'react-native/);
  });
});
