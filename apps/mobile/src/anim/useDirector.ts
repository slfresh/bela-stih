import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PublicView, Seat } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import { markTick } from '../dev/counters';
import { DEFAULT_TIMINGS, Director, type Batch, type Timings } from './director';

/**
 * React glue for the animation director.
 *
 * The director itself is framework-free; this hook owns one instance, exposes
 * its paced view as state, and wires the two lifecycle rules that matter on a
 * phone: backgrounding fast-forwards (progression is flushed, nothing is lost,
 * the screen is simply correct on return), and unmount disposes.
 */
export function useDirector(
  mySeat: Seat,
  initialView: PublicView,
  onEvent: (e: TableEvent, flushed: boolean, speed: number) => void,
  /**
   * Called as each batch starts animating, queued ones included. The table
   * uses it to re-measure its anchors; the measurement lands a frame later,
   * so it freshens everything from the batch's second sprite on.
   */
  onBatch?: () => void,
  opts: {
    /** The pacing table; a change re-paces from the next beat on. */
    timings?: Timings;
    /** An animated event's end-commit has landed: landing sounds and stamps go here. */
    onEventEnd?: (e: TableEvent, speed: number) => void;
    /** The director flushed past `n` events without animating them. */
    onSkip?: (n: number) => void;
    /** A bot's think before its move shows (see DirectorCallbacks.thinkMs). */
    thinkMs?: (e: TableEvent, view: PublicView) => number;
    onThink?: (e: TableEvent) => void;
  } = {},
) {
  const [view, setView] = useState<PublicView>(initialView);
  const [idle, setIdle] = useState(true);

  // The handlers change identity across renders; the director must always call
  // the latest ones without being rebuilt.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onBatchRef = useRef(onBatch);
  onBatchRef.current = onBatch;
  const onEventEndRef = useRef(opts.onEventEnd);
  onEventEndRef.current = opts.onEventEnd;
  const onSkipRef = useRef(opts.onSkip);
  onSkipRef.current = opts.onSkip;
  const thinkRef = useRef(opts.thinkMs);
  thinkRef.current = opts.thinkMs;
  const onThinkRef = useRef(opts.onThink);
  onThinkRef.current = opts.onThink;

  const directorRef = useRef<Director | null>(null);
  if (directorRef.current === null) {
    directorRef.current = new Director(
      mySeat,
      initialView,
      {
        onView: (v) => {
          markTick();
          setView(v);
        },
        onEventStart: (e, flushed, speed) => onEventRef.current(e, flushed, speed),
        onEventEnd: (e, s) => onEventEndRef.current?.(e, s),
        onSkip: (n) => onSkipRef.current?.(n),
        onIdle: setIdle,
        onBatch: () => onBatchRef.current?.(),
        thinkMs: (e, v) => thinkRef.current?.(e, v) ?? 0,
        onThink: (e) => onThinkRef.current?.(e),
      },
      opts.timings ?? DEFAULT_TIMINGS,
    );
  }

  // The system reduce-motion switch is read asynchronously, so the first
  // render's table is always 'full'; this catches the real answer a tick later.
  const timings = opts.timings ?? DEFAULT_TIMINGS;
  useEffect(() => {
    directorRef.current?.setTimings(timings);
  }, [timings]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') directorRef.current?.fastForward();
    });
    return () => {
      sub.remove();
      directorRef.current?.dispose();
    };
  }, []);

  const enqueue = useCallback((batch: Batch) => directorRef.current?.enqueue(batch), []);
  const fastForward = useCallback(() => directorRef.current?.fastForward(), []);
  /** The director's own view, synchronously — `view` state lags it by a commit. */
  const getView = useCallback(() => directorRef.current?.getView() ?? null, []);

  return { view, idle, enqueue, fastForward, getView };
}
