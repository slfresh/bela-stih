import { describe, expect, it } from 'vitest';
import { REVEAL_MS, timingsFor } from '../src/anim/director';
import {
  REVEAL_BAR_FADE_MS,
  REVEAL_EXIT_MS,
  REVEAL_EXIT_SLACK_MS,
  REVEAL_OUT_MS,
  revealExitAt,
  revealExitDelay,
  revealPhase,
} from '../src/table/revealTiming';

/**
 * The reveal comes DOWN at REVEAL_MS — and inside it: the exit starts early
 * enough that the row is empty when it unmounts, a tap runs the same exit
 * sooner, and no motion policy stretches the hold.
 */
describe('the reveal timeline', () => {
  it('starts leaving REVEAL_EXIT_MS before the end and is gone exactly at REVEAL_MS', () => {
    expect(revealPhase(0, null)).toBe('showing');
    expect(revealPhase(REVEAL_MS - REVEAL_EXIT_MS - 1, null)).toBe('showing');
    expect(revealPhase(REVEAL_MS - REVEAL_EXIT_MS, null)).toBe('leaving');
    expect(revealPhase(REVEAL_MS - 1, null)).toBe('leaving');
    expect(revealPhase(REVEAL_MS, null)).toBe('gone');
  });

  it('a tap runs the same exit early, never later', () => {
    expect(revealPhase(1200, 1200)).toBe('leaving');
    expect(revealPhase(1200 + REVEAL_EXIT_MS - 1, 1200)).toBe('leaving');
    expect(revealPhase(1200 + REVEAL_EXIT_MS, 1200)).toBe('gone');
    // A tap in the last 300 ms changes nothing: the exit is already due.
    expect(revealExitAt(REVEAL_MS - 100)).toBe(REVEAL_MS - REVEAL_EXIT_MS);
    expect(revealPhase(REVEAL_MS, REVEAL_MS - 100)).toBe('gone');
  });

  it('holds for the full REVEAL_MS under every motion policy', () => {
    expect(timingsFor('full').declarationsRevealed.dur).toBe(REVEAL_MS);
    expect(timingsFor('reduced').declarationsRevealed.dur).toBe(REVEAL_MS);
    expect(REVEAL_EXIT_MS).toBeLessThan(REVEAL_MS);
  });
});

describe('the reveal leaves inside its window', () => {
  it('every card is home, and the bar faded, before the row unmounts, however many are shown', () => {
    const lands = REVEAL_EXIT_MS - REVEAL_EXIT_SLACK_MS;
    const late: string[] = [];
    for (let n = 1; n <= 32; n++) {
      for (let i = 0; i < n; i++) {
        const d = revealExitDelay(i, n);
        if (d < 0 || d + REVEAL_OUT_MS > lands) late.push(`card ${i} of ${n}: ${d + REVEAL_OUT_MS} ms`);
      }
    }
    expect(late).toEqual([]);
    // A carre keeps its 20 ms stagger.
    expect(revealExitDelay(3, 4)).toBe(60);
    expect(REVEAL_BAR_FADE_MS).toBeLessThanOrEqual(lands);
  });
});
