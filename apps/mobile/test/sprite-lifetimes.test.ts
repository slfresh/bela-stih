import { describe, expect, it } from 'vitest';
import { SEATS } from '@belot/engine';
import { Lang } from '@belot/i18n';
import { Table } from '@belot/table';
import type { AnchorMap, AnchorRect } from '../src/anim/AnchorRegistry';
import { DEFAULT_TIMINGS } from '../src/anim/director';
import { FxBus, type Fx } from '../src/anim/FxBus';
import { BUBBLE_MIN_MS, FALLBACK_CARD_W, lifetimeOf, motionOf } from '../src/anim/lifetimes';
import { makeFxSpawner } from '../src/table/fx';

/**
 * Golden timings: no sprite may still be moving when the director has moved on.
 *
 * The overlay animates from constants in `lifetimes.ts`; the director paces
 * from `DEFAULT_TIMINGS`; nothing else ties the two together. Before this
 * test they had drifted in both directions — the flight kept its full 260ms
 * while the director committed the card at 130ms with a batch waiting, and
 * the dealt backs were done 560ms before the deal beat ended.
 *
 * Runs under node: the spawner only needs an object that answers `rect` and
 * `centre`, so the registry's React half is never imported at runtime.
 */

const SLOT_W = 60;

function fakeAnchors(withSlots = true): AnchorMap {
  const rects = new Map<string, AnchorRect>();
  for (const s of SEATS) {
    rects.set(`seat:${s}`, { x: 120 * s, y: 40, w: 54, h: 54 });
    if (withSlots) rects.set(`slot:${s}`, { x: 120 * s, y: 220, w: SLOT_W, h: SLOT_W * 1.45 });
  }
  rects.set('deck', { x: 180, y: 160, w: 10, h: 10 });
  const map = {
    rect: (k: string) => rects.get(k) ?? null,
    centre: (k: string) => {
      const r = rects.get(k);
      return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
    },
  };
  return map as unknown as AnchorMap;
}

/** Every sprite a whole all-bot deal produces, tagged with the event that spawned it. */
function spritesOfADeal(speed: number, anchors = fakeAnchors()) {
  const table = new Table({ seed: 7, humanSeats: [] });
  const events = table.drainEvents();
  if (events.length < 30) throw new Error('hollow deal');
  const bus = new FxBus();
  const out: { kind: string; fx: Fx }[] = [];
  let current = '';
  bus.subscribe((fx) => out.push({ kind: current, fx }));
  const spawn = makeFxSpawner({ anchors, bus, lang: new Lang('hr') });
  for (const e of events) {
    current = e.kind;
    spawn(e, speed);
  }
  return out;
}

describe('sprites fit the beats they fill', () => {
  for (const speed of [1, 0.5]) {
    it(`at speed ${speed}: every sprite has landed before its beat plus gap is over`, () => {
      const sprites = spritesOfADeal(speed);
      expect(sprites.length).toBeGreaterThan(30);
      for (const { kind, fx } of sprites) {
        const beat = DEFAULT_TIMINGS[kind as keyof typeof DEFAULT_TIMINGS];
        expect(beat, `no timing for ${kind}`).toBeDefined();
        const budget = (beat.dur + beat.gap) * speed;
        expect(motionOf(fx), `${fx.kind} spawned by ${kind}`).toBeLessThanOrEqual(budget);
        // The fade tail may run into the gap, but never past the sprite's own motion.
        expect(lifetimeOf(fx)).toBeGreaterThanOrEqual(motionOf(fx));
        // A bubble's pop and fade are fixed choreography that only scales with
        // speed; motionOf must own up to them, or a short beat passes vacuously.
        if (fx.kind === 'bubble') {
          expect(motionOf(fx)).toBeGreaterThanOrEqual(BUBBLE_MIN_MS * speed);
        }
      }
    });
  }

  it('halving the speed halves the motion', () => {
    const full = spritesOfADeal(1);
    const half = spritesOfADeal(0.5);
    expect(half.length).toBe(full.length);
    for (let i = 0; i < full.length; i++) {
      expect(motionOf(half[i]!.fx)).toBeCloseTo(motionOf(full[i]!.fx) / 2, 5);
    }
  });
});

describe('sprites are sized from the table, not from a constant', () => {
  it('a played card flies at the width of the slot it lands in', () => {
    const flights = spritesOfADeal(1).filter((s) => s.fx.kind === 'flight');
    expect(flights.length).toBe(32);
    for (const { fx } of flights) {
      if (fx.kind === 'flight') expect(fx.width).toBe(SLOT_W);
    }
  });

  it('falls back to a sane width before the first layout has measured a slot', () => {
    const flights = spritesOfADeal(1, fakeAnchors(false)).filter((s) => s.fx.kind === 'flight');
    // Without slot anchors the flight has nowhere to land, so nothing is spawned…
    expect(flights.length).toBe(0);
    // …but the dealt backs, which only need seats and the deck, still get a width.
    const deals = spritesOfADeal(1, fakeAnchors(false)).filter((s) => s.fx.kind === 'deal');
    expect(deals.length).toBeGreaterThan(0);
    for (const { fx } of deals) {
      if (fx.kind === 'deal') {
        expect(fx.width).toBeGreaterThan(0);
        expect(fx.width).toBeLessThanOrEqual(FALLBACK_CARD_W);
      }
    }
  });

  it('spawns nothing when an anchor is missing, and never throws', () => {
    const none = { rect: () => null, centre: () => null } as unknown as AnchorMap;
    expect(spritesOfADeal(1, none)).toEqual([]);
  });
});

describe('a bubble owns up to its fixed choreography', () => {
  const bubble = (duration: number, speed: number) =>
    ({ kind: 'bubble', at: { x: 0, y: 0 }, text: 'x', tone: 'plain', duration, speed }) as const;

  it('never reports less than the pop and the fade, scaled by speed', () => {
    // The overlay's pop-in and fade-out are fixed legs; a beat shorter than
    // both cannot cut them, only the hold. Reporting the bare duration here is
    // what let a 310ms budget pass a 430ms bubble.
    expect(motionOf(bubble(100, 1))).toBe(BUBBLE_MIN_MS);
    expect(motionOf(bubble(100, 0.5))).toBe(BUBBLE_MIN_MS * 0.5);
    expect(motionOf(bubble(900, 1))).toBe(900);
    expect(lifetimeOf(bubble(100, 1))).toBeGreaterThan(BUBBLE_MIN_MS);
  });
});
