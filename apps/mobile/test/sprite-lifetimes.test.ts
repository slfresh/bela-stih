import { describe, expect, it } from 'vitest';
import { cardId, SEATS, type PublicView, type Seat } from '@belot/engine';
import { Lang } from '@belot/i18n';
import { Table, type TableEvent } from '@belot/table';
import type { AnchorMap, AnchorRect } from '../src/anim/AnchorRegistry';
import { DEFAULT_TIMINGS } from '../src/anim/director';
import { FxBus, type Fx } from '../src/anim/FxBus';
import {
  BUBBLE_MIN_MS,
  DEAL_DONE_AT,
  FALLBACK_CARD_W,
  FLIGHT_MAX_MS,
  FLIGHT_MIN_MS,
  PULSE_MS,
  lifetimeOf,
  motionOf,
} from '../src/anim/lifetimes';
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
    // Each seat a different distance from its slot, as on a real table.
    rects.set(`seat:${s}`, { x: 120 * s, y: 40 + 50 * s, w: 54, h: 54 });
    if (withSlots) rects.set(`slot:${s}`, { x: 120 * s, y: 220, w: SLOT_W, h: SLOT_W * 1.45 });
  }
  rects.set('deck', { x: 180, y: 160, w: 10, h: 10 });
  const map = {
    rect: (k: string) => rects.get(k) ?? null,
    centre: (k: string) => {
      const r = rects.get(k);
      return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
    },
    set: (k: string, r: AnchorRect) => {
      rects.set(k, r);
    },
    delete: (k: string) => {
      rects.delete(k);
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
  // The view as the director holds it when each event STARTS: only the trick
  // on the felt matters to the spawner, so that is all this follows.
  const base = table.view(0 as Seat);
  let trick: PublicView['currentTrick'] = [];
  const spawn = makeFxSpawner({
    anchors,
    bus,
    lang: new Lang('hr'),
    mySeat: () => 0,
    view: () => ({ ...base, currentTrick: trick }),
  });
  for (const e of events) {
    current = e.kind;
    spawn(e, speed);
    if (e.kind === 'cardPlayed') trick = [...trick, { seat: e.seat, card: e.card }];
    if (e.kind === 'trickWon') trick = [];
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

describe('the sprites that replace real cards', () => {
  it('a won trick sweeps the four real cards, in play order, from their own slots', () => {
    const sweeps = spritesOfADeal(1).filter((s) => s.fx.kind === 'trickSweep');
    expect(sweeps.length).toBe(8);
    for (const { fx } of sweeps) {
      if (fx.kind !== 'trickSweep') continue;
      expect(fx.cards.length).toBe(4);
      expect(new Set(fx.cards.map((c) => c.seat)).size).toBe(4);
      for (const c of fx.cards) {
        // From the centre of that seat's slot — where the real card was.
        expect(c.from).toEqual({ x: 120 * c.seat + SLOT_W / 2, y: 220 + (SLOT_W * 1.45) / 2 });
      }
      expect(fx.width).toBe(SLOT_W);
      expect(fx.cards.some((c) => c.seat === fx.winner)).toBe(true);
    }
  });

  it('a played card flies for a distance-scaled time that still lands inside its beat', () => {
    // The card is committed to its slot at the end of the beat, not the gap:
    // a sprite still in the air then is a second copy over the real card.
    expect(FLIGHT_MAX_MS).toBeLessThanOrEqual(DEFAULT_TIMINGS.cardPlayed.dur);
    for (const speed of [1, 0.5]) {
      const flights = spritesOfADeal(speed).filter((s) => s.fx.kind === 'flight');
      const durations = new Set<number>();
      for (const { fx } of flights) {
        if (fx.kind !== 'flight') continue;
        expect(fx.duration).toBeGreaterThanOrEqual(FLIGHT_MIN_MS * speed);
        expect(fx.duration).toBeLessThanOrEqual(DEFAULT_TIMINGS.cardPlayed.dur * speed);
        durations.add(fx.duration);
      }
      // Four seats at four distances from their slots: not one fixed number.
      expect(durations.size).toBeGreaterThan(1);
    }
  });

  it('the deal fills its beat instead of finishing halfway through it', () => {
    for (const speed of [1, 0.5]) {
      const deals = spritesOfADeal(speed).filter((s) => s.fx.kind === 'deal');
      expect(deals.length).toBe(2); // the deal and the talon
      for (const { kind, fx } of deals) {
        const beat = DEFAULT_TIMINGS[kind as keyof typeof DEFAULT_TIMINGS];
        // The last back has landed well into the beat, and has faded before
        // the beat ends and the real cards appear under it.
        expect(motionOf(fx)).toBeGreaterThanOrEqual(beat.dur * speed * 0.7);
        expect(lifetimeOf(fx) - 100).toBeLessThanOrEqual(beat.dur * speed * DEAL_DONE_AT + 1);
      }
    }
  });
});

describe('a landed flight gives way to the sweep', () => {
  it('is gone before a trick at half pace can start moving its card', () => {
    // At speed 0.5 the trick sweep may begin as little as the cardPlayed gap
    // after the card lands; the flight copy must not still be drawn then.
    const gap = DEFAULT_TIMINGS.cardPlayed.gap;
    for (const speed of [1, 0.5]) {
      const flights = spritesOfADeal(speed).filter((s) => s.fx.kind === 'flight');
      for (const { fx } of flights) {
        if (fx.kind !== 'flight') continue;
        expect(lifetimeOf(fx)).toBeLessThanOrEqual(fx.duration + gap * speed);
      }
    }
  });
});

describe('the turn pulse', () => {
  it('is one short beat that scales with the pace', () => {
    const pulse = (speed: number) => ({ kind: 'pulse', at: { x: 0, y: 0 }, speed }) as const;
    expect(motionOf(pulse(1))).toBe(PULSE_MS);
    expect(motionOf(pulse(0.5))).toBe(PULSE_MS / 2);
    expect(lifetimeOf(pulse(1))).toBeGreaterThanOrEqual(PULSE_MS);
  });
});

describe('a played card sets off from the right place, the right way up', () => {
  it('flies from the tapped card, at the fan size, and forgets the rect', () => {
    const anchors = fakeAnchors();
    const table = new Table({ seed: 7, humanSeats: [] });
    const mine = table
      .drainEvents()
      .find((e): e is Extract<TableEvent, { kind: 'cardPlayed' }> => e.kind === 'cardPlayed' && e.seat === 0);
    expect(mine).toBeDefined();
    const key = `card:${cardId(mine!.card)}`;
    anchors.set(key, { x: 300, y: 500, w: 62, h: 90 });
    const bus = new FxBus();
    const out: Fx[] = [];
    bus.subscribe((fx) => out.push(fx));
    const spawn = makeFxSpawner({
      anchors,
      bus,
      lang: new Lang('hr'),
      mySeat: () => 0,
      view: () => table.view(0 as Seat),
    });
    spawn(mine!, 1);
    const flight = out.find((f) => f.kind === 'flight');
    expect(flight?.kind).toBe('flight');
    if (flight?.kind !== 'flight') return;
    expect(flight.from).toEqual({ x: 331, y: 545 });
    expect(flight.fromWidth).toBe(62);
    expect(flight.faceUp).toBe(true);
    // Read once: the next flight for the same card must not find it.
    expect(anchors.rect(key)).toBeNull();
  });

  it("an opponent's card leaves face down from their puck; my own face up", () => {
    const flights = spritesOfADeal(1).filter((s) => s.fx.kind === 'flight');
    let up = 0;
    let down = 0;
    for (const { fx } of flights) {
      if (fx.kind !== 'flight') continue;
      if (fx.faceUp) up += 1;
      else down += 1;
      expect(fx.fromWidth).toBeUndefined(); // nothing was tapped in a bot deal
    }
    // Seat 0 is "me" to the spawner: its eight cards fly face up, the other
    // twenty-four face down.
    expect(up).toBe(8);
    expect(down).toBe(24);
  });
});

describe('the deal', () => {
  it('spreads my backs across the hand and sends one a round to each opponent', () => {
    const deals = spritesOfADeal(1).filter((s) => s.fx.kind === 'deal');
    const [first, talon] = deals.map((d) => d.fx);
    if (first?.kind !== 'deal' || talon?.kind !== 'deal') throw new Error('no deal');
    // Two rounds: three opponents once each plus three for me, twice.
    expect(first.backs.length).toBe(12);
    // The talon: one each for the opponents, two for me.
    expect(talon.backs.length).toBe(5);
    // My backs land at six distinct points across the hand, not on one spot;
    // an opponent's land on its puck centre (x = 120·seat + 27 in the fake).
    const puckXs = new Set(SEATS.map((s) => 120 * s + 27));
    const mine = first.backs.filter((b) => !puckXs.has(b.x));
    expect(mine.length).toBe(6);
    expect(new Set(mine.map((b) => b.x)).size).toBe(6);
    // The talon's two land on the right of the fan, where the new cards go.
    const talonMine = talon.backs.filter((b) => !puckXs.has(b.x));
    expect(talonMine.length).toBe(2);
    expect(Math.min(...talonMine.map((b) => b.x))).toBeGreaterThan(Math.max(...mine.map((b) => b.x)) - 1);
  });
});
