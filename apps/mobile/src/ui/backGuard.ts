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

/** Returns true when it handled the press, false to let App go on. */
type Guard = () => boolean;

let current: Guard | null = null;

export function setBackGuard(guard: Guard | null): void {
  current = guard;
}

export function runBackGuard(): boolean {
  return current !== null && current();
}
