import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
}));

import * as Haptics from 'expo-haptics';
import { PATTERNS, pattern, setHapticsEnabled } from '../src/haptics';

/** The vocabulary: short, few steps, and behind one gate. */
describe('the haptic patterns', () => {
  it('are all at most 300 ms and a handful of steps, starting now', () => {
    for (const [name, steps] of Object.entries(PATTERNS)) {
      expect(steps.length, name).toBeGreaterThan(0);
      expect(steps.length, name).toBeLessThanOrEqual(4);
      expect(steps[0]!.at, name).toBe(0);
      for (const s of steps) expect(s.at, name).toBeLessThanOrEqual(300);
    }
  });

  it('escalate from the five-second clock to the two-second one', () => {
    expect(PATTERNS.clock2.length).toBeGreaterThan(PATTERNS.clock5.length);
  });

  it('are silent when Settings says so', () => {
    setHapticsEnabled(false);
    pattern('matchWon');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    pattern('dealMade');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });
});
