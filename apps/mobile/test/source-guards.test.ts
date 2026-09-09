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
    const body = playingCard.slice(playingCard.indexOf('export const PlayingCard'));
    expect(body).not.toMatch(/cosmetics\(\)/);
  });
});

describe('anchors measure on demand', () => {
  it('has no bare useEffect(measure) that re-measures on every commit', () => {
    const registry = src('anim/AnchorRegistry.tsx');
    expect(registry).not.toMatch(/useEffect\(measure\)/);
    expect(registry).toMatch(/map\.subscribe\(measure\)/);
  });

  it('the table re-measures whenever a row around the felt comes or goes', () => {
    // A status line, a chip row or a prompt moves every anchor without any
    // of them changing its own layout; on the web onLayout cannot see a move.
    const table = src('TableScreen.tsx');
    expect(table).toMatch(/const reflowKey = \[/);
    expect(table).toMatch(/\}, \[anchors, reflowKey\]\);/);
    expect(table.match(/onLayout=\{\(\) => anchors\.bump\(\)\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
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
    // The unmount timer is the lifetime, full stop.
    expect(overlay).toMatch(/\}, lifetimeOf\(fx\)\);/);
    expect(overlay).not.toMatch(/lifetimeOf\(fx\) \+ \d+/);
  });

  it('the spawner scales every duration by the speed it is given', () => {
    const fx = src('table/fx.ts');
    expect(fx).toMatch(/flightDuration\(.*\) \* speed/);
    expect(fx).not.toMatch(/duration: 260/);
  });

  it('fx.ts stays free of react-native, so the golden-timings test can run under node', () => {
    expect(src('table/fx.ts')).not.toMatch(/from 'react-native/);
  });
});

describe('the first frame and the last resort', () => {
  it('every screen renders inside the error boundary', () => {
    // A thrown render used to leave a blank page with no way back. The
    // boundary must wrap the screen switch itself, not sit inside one branch.
    const app = readFileSync(join(here, '../App.tsx'), 'utf8');
    const open = app.indexOf('<ErrorBoundary');
    const close = app.indexOf('</ErrorBoundary>');
    expect(open).toBeGreaterThan(-1);
    expect(app.slice(open, close)).toMatch(/\{content\}/);
    expect(app.slice(open, close)).toMatch(/onReset=/);
  });

  it('the web template paints dark before the bundle parses', () => {
    const html = readFileSync(join(here, '../public/index.html'), 'utf8');
    expect(html).toMatch(/<html lang="hr">/);
    expect(html).toMatch(/<meta name="color-scheme" content="dark"/);
    expect(html).toMatch(/<meta name="theme-color" content="#0d2a1f"/);
    expect(html).toMatch(/#root\s*\{[^}]*background:\s*#0d2a1f/);
    expect(html).toMatch(/id="boot"/);
    // Expo substitutes the title; a hard-coded one would silently drift from app.json.
    expect(html).toMatch(/%WEB_TITLE%/);
  });

  it('metrics stay a pure function of the box, so the landscape invariant is testable', () => {
    expect(src('table/metrics.ts')).not.toMatch(/from 'react-native/);
    expect(src('table/useTableMetrics.ts')).toMatch(/computeTableMetrics\(usableW, usableH\)/);
  });
});
