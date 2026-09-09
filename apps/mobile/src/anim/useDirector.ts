import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PublicView, Seat } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import { markTick } from '../dev/counters';
import { Director, type Batch } from './director';

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
   * Called the moment a batch starts animating, before its first sprite spawns.
   * The table uses it to re-measure its anchors — the one place drift between a
   * layout and the sprites flying to it could actually be seen.
   */
  onBusy?: () => void,
) {
  const [view, setView] = useState<PublicView>(initialView);
  const [idle, setIdle] = useState(true);

  // The handlers change identity across renders; the director must always call
  // the latest ones without being rebuilt.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;

  const directorRef = useRef<Director | null>(null);
  if (directorRef.current === null) {
    directorRef.current = new Director(mySeat, initialView, {
      onView: (v) => {
        markTick();
        setView(v);
      },
      onEventStart: (e, flushed, speed) => onEventRef.current(e, flushed, speed),
      onIdle: (i) => {
        if (!i) onBusyRef.current?.();
        setIdle(i);
      },
    });
  }

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

  return { view, idle, enqueue, fastForward };
}
