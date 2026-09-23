/**
 * One place Android's back button asks before it acts.
 *
 * App owns the hardware-back listener, and it used to leave a game on the
 * spot — a deal in progress gone on a stray swipe from the screen's edge, the
 * very accident the leave button's confirmation now prevents. A screen that
 * needs a say registers a guard here; App asks it first, and only acts itself
 * when the guard declines. A module, not a second listener: which of two
 * listeners runs first depends on the order their effects ran in.
 */

import { useEffect, useRef } from 'react';

/** Returns true when it handled the press, false to let App go on. */
type Guard = () => boolean;

let current: Guard | null = null;

export function setBackGuard(guard: Guard | null): void {
  current = guard;
}

/**
 * Clears the slot only if it still holds this guard: a screen mounting in the
 * same commit may already have taken it, and cleanups run before mounts.
 */
export function clearBackGuard(guard: Guard): void {
  if (current === guard) current = null;
}

export function runBackGuard(): boolean {
  return current !== null && current();
}

/**
 * While `open`, Back - Android's, or the browser's - calls `close` instead of
 * leaving the screen: a question or a picture over a screen goes first.
 */
export function useBackCloses(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const guard = () => {
      closeRef.current();
      return true;
    };
    setBackGuard(guard);
    return () => clearBackGuard(guard);
  }, [open]);
}
