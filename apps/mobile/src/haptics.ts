import * as Haptics from 'expo-haptics';

/**
 * Haptics, as a module rather than a prop.
 *
 * Mirrors `audio.ts`: `App` sets the preference once and every call site just
 * buzzes. Feedback that is not event-driven — your turn starting, the clock
 * running down — has no `TableEvent` to ride on, so threading a `haptics` flag
 * to each of them would mean plumbing settings into the table screen for a
 * boolean.
 */

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export type Buzz = 'light' | 'medium' | 'heavy' | 'select';

const STYLE: Record<Exclude<Buzz, 'select'>, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

/** Never throws and never awaits: a missing haptic engine must not break play. */
export function buzz(kind: Buzz): void {
  if (!enabled) return;
  if (kind === 'select') {
    void Haptics.selectionAsync().catch(() => {});
    return;
  }
  void Haptics.impactAsync(STYLE[kind]).catch(() => {});
}

/** Two taps a beat apart — "speak now", for a call you would otherwise miss. */
export function doubleBuzz(kind: Buzz = 'medium'): void {
  if (!enabled) return;
  buzz(kind);
  setTimeout(() => buzz(kind), 90);
}
