import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardId, type PublicView, type Seat } from '@belot/engine';
import { Table, type TableEvent } from '@belot/table';
import { DEFAULT_TIMINGS, Director, ZERO_TIMINGS, type Batch } from '../src/anim/director';

/**
 * The director owns the view the screen renders, so its patch logic gets the
 * same treatment as the engine: a harness that replays real games and asserts
 * the presentation can never drift from the authority.
 *
 * With ZERO_TIMINGS the director settles synchronously inside `enqueue`, which
 * makes whole-match replay trivial. Fast-forward and compression use fake
 * timers against the real timing table.
 */

const SEAT: Seat = 0;

interface Capture {
  views: PublicView[];
  started: TableEvent[];
  flushed: TableEvent[];
  idleFlips: boolean[];
  /** The pace each ANIMATED event was started at. */
  speeds: number[];
}

function makeDirector(initial: PublicView, timings = ZERO_TIMINGS) {
  const cap: Capture = { views: [], started: [], flushed: [], idleFlips: [], speeds: [] };
  const d = new Director(SEAT, initial, {
    onView: (v) => cap.views.push(v),
    onEventStart: (e, f, speed) => {
      if (f) cap.flushed.push(e);
      else {
        cap.started.push(e);
        cap.speeds.push(speed);
      }
    },
    onIdle: (i) => cap.idleFlips.push(i),
  }, timings);
  return { d, cap };
}

/** The fields the patcher is responsible for, in comparable form. */
function projection(v: PublicView) {
  return {
    phase: v.phase,
    dealer: v.dealer,
    hand: v.hand.map(cardId).sort(),
    handCounts: v.handCounts,
    trump: v.context.trumpSuit,
    callerSeat: v.callerSeat,
    multiplier: v.multiplier,
    trickLeader: v.trickLeader,
    trick: v.currentTrick.map((p) => `${p.seat}:${cardId(p.card)}`),
    matchScores: v.matchScores,
    // The live counter is patched per trick; if bumpProgress ever drifts from
    // the engine's own arithmetic, this catches it at every batch boundary.
    dealProgress: v.dealProgress && {
      tricksPlayed: v.dealProgress.tricksPlayed,
      cardPoints: v.dealProgress.cardPoints,
      tricksWon: v.dealProgress.tricksWon,
      running: v.dealProgress.running,
      callerNeeds: v.dealProgress.callerNeeds,
      lastTrickTeam: v.dealProgress.lastTrickTeam,
    },
    // Order differs legitimately (event order vs per-seat flatten); compare as a set.
    declarations: v.announcedDeclarations
      .map((x) => `${x.seat}:${x.kind}:${x.value}:${x.topRank}`)
      .sort(),
    bela: v.belaAnnouncedBy,
  };
}

describe('director replay over real matches', () => {
  it('never drifts from the authoritative view, before or after the sync', () => {
    for (const seed of [3, 21, 77]) {
      const table = new Table({ seed, humanSeats: [SEAT] });
      const { d, cap } = makeDirector(table.view(SEAT));
      let batches = 0;

      const drainInto = () => {
        const events = table.drainEvents();
        const finalView = table.view(SEAT);
        const before = cap.views.length;
        d.enqueue({ events, finalView });
        batches++;

        // Terminal view is authoritative, verbatim.
        expect(d.getView()).toEqual(finalView);
        expect(d.idle).toBe(true);

        // The last PATCHED view (just before the sync) must already agree on
        // everything the patcher maintains — the sync may not be doing the work.
        if (events.length > 0) {
          const seq = cap.views.slice(before);
          const lastPatched = seq[seq.length - 2]!;
          expect(projection(lastPatched)).toEqual(projection(finalView));
          // Intermediate views never offer prompts or actions.
          for (const v of seq.slice(0, -1)) {
            expect(v.legalActions).toEqual([]);
            expect(v.toAct).toBeNull();
            expect(v.mustDeclare).toBe(false);
            expect(v.canAnnounceBela).toBe(false);
          }
        }
      };

      drainInto(); // whatever the constructor's bot run produced

      let guard = 0;
      while (table.phase !== 'MATCH_OVER') {
        if (guard++ > 20_000) throw new Error('match did not finish');
        if (table.phase === 'DEAL_OVER') {
          table.startNextDeal();
          drainInto();
          continue;
        }
        table.submit(table.legal()[0]!);
        drainInto();
      }

      expect(batches).toBeGreaterThan(50);
      // Every event fired exactly once, none double-fired via flush.
      expect(cap.flushed).toHaveLength(0);
      d.dispose();
    }
  });

  it('fires onEventStart exactly once per event', () => {
    const table = new Table({ seed: 9, humanSeats: [SEAT] });
    const { d, cap } = makeDirector(table.view(SEAT));
    let total = 0;
    let guard = 0;
    const feed = () => {
      const events = table.drainEvents();
      total += events.length;
      d.enqueue({ events, finalView: table.view(SEAT) });
    };
    feed();
    while (table.phase !== 'MATCH_OVER' && guard++ < 20_000) {
      if (table.phase === 'DEAL_OVER') table.startNextDeal();
      else table.submit(table.legal()[0]!);
      feed();
    }
    expect(cap.started.length + cap.flushed.length).toBe(total);
    expect(cap.flushed).toHaveLength(0);
  });
});

describe('fast-forward and compression', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function oneDealBatch(seed: number): { batch: Batch; initial: PublicView } {
    // An all-bot table plays its ENTIRE first deal inside the constructor, so
    // the first drain already holds a full deal's events. (An earlier version
    // discarded that drain "as a marker" and every batch here was empty — two
    // of these tests passed vacuously.)
    const table = new Table({ seed, humanSeats: [] });
    const batch = { events: table.drainEvents(), finalView: table.view(SEAT) };
    if (batch.events.length < 30) throw new Error('helper produced a hollow batch');
    return { batch, initial: batch.finalView };
  }

  it('fastForward lands on the final view with every remaining event flushed', () => {
    const t = new Table({ seed: 5, humanSeats: [] });
    const initial = t.view(SEAT);
    t.runBots();
    const events = t.drainEvents();
    const finalView = t.view(SEAT);

    const { d, cap } = makeDirector(initial, DEFAULT_TIMINGS);
    d.enqueue({ events, finalView });
    expect(d.idle).toBe(false);

    // Let a few events play, then interrupt.
    vi.advanceTimersByTime(2500);
    const startedBefore = cap.started.length;
    expect(startedBefore).toBeGreaterThan(0);
    expect(startedBefore).toBeLessThan(events.length);

    d.fastForward();
    expect(d.idle).toBe(true);
    expect(d.getView()).toEqual(finalView);
    // Everything fired exactly once, split between animated and flushed.
    expect(cap.started.length + cap.flushed.length).toBe(events.length);
    expect(cap.flushed.length).toBe(events.length - startedBefore);

    // No stray timers keep running afterwards.
    const views = cap.views.length;
    vi.advanceTimersByTime(60_000);
    expect(cap.views.length).toBe(views);
  });

  it('flushes older batches when more than one is waiting', () => {
    const a = oneDealBatch(11);
    const b = oneDealBatch(12).batch;
    const c = oneDealBatch(13).batch;

    const { d, cap } = makeDirector(a.initial, DEFAULT_TIMINGS);
    d.enqueue(a.batch); // starts animating
    d.enqueue(b); // waits
    d.enqueue(c); // b must be flushed instantly
    expect(cap.flushed.length).toBe(b.events.length);

    // Drain everything; the final view is the newest batch's.
    d.fastForward();
    expect(d.getView()).toEqual(c.finalView);
    expect(cap.started.length + cap.flushed.length).toBe(
      a.batch.events.length + b.events.length + c.events.length,
    );
  });

  it('halves delays while a batch is waiting', () => {
    const a = oneDealBatch(31);
    const b = oneDealBatch(32).batch;
    const { d, cap } = makeDirector(a.initial, DEFAULT_TIMINGS);
    d.enqueue(a.batch);
    const solo = cap.started.length;
    vi.advanceTimersByTime(4000);
    const soloAfter = cap.started.length - solo;

    // Fresh director, same batch, but with a second batch waiting throughout.
    const { d: d2, cap: cap2 } = makeDirector(a.initial, DEFAULT_TIMINGS);
    d2.enqueue(a.batch);
    d2.enqueue(b);
    const duo = cap2.started.length;
    vi.advanceTimersByTime(4000);
    const duoAfter = cap2.started.length - duo;

    expect(duoAfter).toBeGreaterThan(soloAfter);
    // And it SAYS so: every beat started while a batch waited was announced at
    // half pace, so the sprites can shrink with it, while the solo run was
    // announced at full pace throughout.
    expect(cap.speeds.every((s) => s === 1)).toBe(true);
    expect(cap2.speeds.slice(duo).every((s) => s === 0.5)).toBe(true);
    d.dispose();
    d2.dispose();
  });
});
