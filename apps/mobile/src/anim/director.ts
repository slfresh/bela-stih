import type { PublicView, Seat } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import { applyEventEnd, applyEventStart } from './patch';

/**
 * The animation director: owns the `PublicView` the screen renders, and paces
 * the event stream through it.
 *
 * Design rules (see the plan's architecture section):
 *  - Sequencing runs on plain JS timers. Reanimated sprites are fire-and-forget
 *    decoration; a dropped frame can never stall the game.
 *  - Two-phase commit per event: patch the source side when its animation
 *    starts, the destination side when it lands.
 *  - At the end of every batch the view is HARD-REPLACED by the batch's
 *    authoritative `finalView`, so drift is structurally impossible.
 *  - Batches arriving while one is playing compress: delays halve with one
 *    batch waiting, and anything older than the newest waiting batch is
 *    flushed instantly (progression still fires; sprites and sounds do not).
 *
 * Framework-free on purpose: the vitest harness drives it against a real
 * `Table` with zero timings, no device or React involved.
 */

export interface Batch {
  events: TableEvent[];
  finalView: PublicView;
}

export interface DirectorCallbacks {
  /** Every presentation-view change, including the terminal sync. */
  onView(view: PublicView): void;
  /**
   * Fired once per event when its animation begins. `flushed` is true when the
   * event is being skipped (fast-forward/compression): apply progression, but
   * spawn no sprite and play no sound.
   */
  onEventStart(e: TableEvent, flushed: boolean): void;
  onIdle(idle: boolean): void;
}

export interface EventTiming {
  /** start-commit → end-commit (the animation itself). */
  dur: number;
  /** pause after the end-commit before the next event. */
  gap: number;
}

export type Timings = Record<TableEvent['kind'], EventTiming>;

export const DEFAULT_TIMINGS: Timings = {
  dealStarted: { dur: 1400, gap: 200 },
  bidPassed: { dur: 500, gap: 120 },
  bidCalled: { dur: 900, gap: 150 },
  doubled: { dur: 900, gap: 150 },
  doublePassed: { dur: 250, gap: 80 },
  handsCompleted: { dur: 700, gap: 200 },
  declared: { dur: 1100, gap: 150 },
  declarationSkipped: { dur: 150, gap: 60 },
  belaCalled: { dur: 1100, gap: 100 },
  cardPlayed: { dur: 260, gap: 140 },
  trickWon: { dur: 1000, gap: 200 },
  dealScored: { dur: 900, gap: 0 },
  matchOver: { dur: 300, gap: 0 },
  matchStarted: { dur: 600, gap: 200 },
};

/** All-zero timings: the director settles synchronously. Used by tests. */
export const ZERO_TIMINGS: Timings = Object.fromEntries(
  Object.keys(DEFAULT_TIMINGS).map((k) => [k, { dur: 0, gap: 0 }]),
) as Timings;

interface Current {
  batch: Batch;
  /** Index of the next event to START. */
  nextIndex: number;
}

export class Director {
  private view: PublicView;
  private queue: Batch[] = [];
  private current: Current | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  idle = true;

  constructor(
    private readonly mySeat: Seat,
    initialView: PublicView,
    private readonly cb: DirectorCallbacks,
    private readonly timings: Timings = DEFAULT_TIMINGS,
  ) {
    this.view = initialView;
  }

  getView(): PublicView {
    return this.view;
  }

  enqueue(batch: Batch): void {
    if (this.disposed) return;
    this.queue.push(batch);
    this.compress();
    if (this.idle) {
      this.idle = false;
      this.cb.onIdle(false);
      this.next();
    }
  }

  /** Skip everything pending and land on the newest authoritative view. */
  fastForward(): void {
    if (this.disposed) return;
    this.clearTimer();

    let lastFinal: PublicView | null = null;
    if (this.current) {
      this.flushEvents(this.current.batch.events, this.current.nextIndex);
      lastFinal = this.current.batch.finalView;
      this.current = null;
    }
    for (const b of this.queue) {
      this.flushEvents(b.events, 0);
      lastFinal = b.finalView;
    }
    this.queue = [];

    if (lastFinal) {
      this.view = lastFinal;
      this.cb.onView(this.view);
    }
    if (!this.idle) {
      this.idle = true;
      this.cb.onIdle(true);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  // -------------------------------------------------------------------------

  /** With >1 batch waiting, flush all but the newest; with 1 waiting, halve delays. */
  private compress(): void {
    while (this.queue.length > 1) {
      const b = this.queue.shift()!;
      this.flushEvents(b.events, 0);
      // Its final view is superseded by the newer batch; no need to render it.
    }
  }

  private speed(): number {
    return this.queue.length > 0 ? 0.5 : 1;
  }

  private flushEvents(events: TableEvent[], from: number): void {
    for (let i = from; i < events.length; i++) this.cb.onEventStart(events[i]!, true);
  }

  private schedule(ms: number, fn: () => void): void {
    if (ms <= 0) {
      // Synchronous when zero: lets the test harness settle without timers.
      fn();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private next(): void {
    if (this.disposed) return;

    if (!this.current) {
      const batch = this.queue.shift();
      if (!batch) {
        this.idle = true;
        this.cb.onIdle(true);
        return;
      }
      this.current = { batch, nextIndex: 0 };
      if (batch.events.length === 0) {
        this.finishBatch();
        return;
      }
    }

    const { batch, nextIndex } = this.current;
    const e = batch.events[nextIndex]!;
    this.current.nextIndex = nextIndex + 1;

    this.cb.onEventStart(e, false);
    this.view = applyEventStart(this.view, e, this.mySeat);
    this.cb.onView(this.view);

    const t = this.timings[e.kind] ?? { dur: 300, gap: 100 };
    const s = this.speed();

    this.schedule(t.dur * s, () => {
      if (!this.current) return; // fast-forwarded meanwhile
      this.view = applyEventEnd(this.view, e, batch.finalView, this.mySeat);
      this.cb.onView(this.view);

      if (this.current.nextIndex >= batch.events.length) {
        this.finishBatch();
        return;
      }
      this.schedule(t.gap * s, () => this.next());
    });
  }

  private finishBatch(): void {
    const batch = this.current!.batch;
    this.current = null;
    // Terminal sync: authoritative truth, verbatim — prompts and legal actions
    // come back exactly as the engine/server stated them.
    this.view = batch.finalView;
    this.cb.onView(this.view);
    this.next();
  }
}
