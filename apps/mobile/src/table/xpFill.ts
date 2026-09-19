/**
 * How the XP bar gets from what it showed to what it shows now. Inside a
 * level it fills straight to the new share. A level crossed fills to the end,
 * empties at once and fills on to the new level's share: animating straight
 * there ran the bar backwards on every level-up. Under reduce-motion it snaps,
 * as the counts do. No timed step ever runs to the value it starts from.
 *
 * Pure, so the timeline is a test.
 */
export interface XpShown {
  level: number;
  fraction: number;
}

export interface XpFillStep {
  to: number;
  ms: number;
  ease: 'in' | 'out';
}

export const XP_FILL_MS = 600;
/** To the end of the old level: about the badge swell's 220 ms peak. */
export const XP_TO_END_MS = 260;
export const XP_REFILL_MS = 460;

export function xpFillSteps(was: XpShown, now: XpShown & { isMax: boolean }, reduced: boolean): XpFillStep[] {
  if (was.level === now.level && was.fraction === now.fraction) return [];
  if (reduced) return [{ to: now.fraction, ms: 0, ease: 'out' }];
  if (now.level > was.level && !now.isMax) {
    const steps: XpFillStep[] = [
      { to: 1, ms: XP_TO_END_MS, ease: 'in' },
      { to: 0, ms: 0, ease: 'out' },
    ];
    // Landing exactly on a level's start: empty is where it ends.
    if (now.fraction > 0) steps.push({ to: now.fraction, ms: XP_REFILL_MS, ease: 'out' });
    return steps;
  }
  return [{ to: now.fraction, ms: XP_FILL_MS, ease: 'out' }];
}
