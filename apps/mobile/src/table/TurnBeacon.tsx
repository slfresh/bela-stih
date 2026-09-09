import { StyleSheet } from 'react-native';
import Animated, { type CSSAnimationProperties } from 'react-native-reanimated';
import { signal } from '../theme';

/**
 * "Your turn", as light: a cream glow along the top of the hand that breathes
 * while the table waits on you, and only then.
 *
 * Mounted on the RENDERED turn prop, so it is gone the moment a drain starts
 * (the director suppresses `toAct` on every intermediate view) and is never
 * held on. The breath runs on the UI thread; nothing crosses to JS per
 * frame. Under reduce-motion it holds still at a steady glow.
 */
export function TurnBeacon({ reduced }: { reduced: boolean }) {
  // A CSS animation: declared once, run by the compositor on the web and by
  // the UI thread natively, paused by the platform when the app is hidden —
  // no shared value, no JS per frame, nothing to cancel.
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.halo, reduced ? styles.haloStill : breatheHalo]} />
      <Animated.View pointerEvents="none" style={[styles.line, reduced ? styles.lineStill : breatheLine]} />
    </>
  );
}

const BREATH_MS = 1100;

const breatheLine: CSSAnimationProperties = {
  animationName: { from: { opacity: 0.35 }, to: { opacity: 0.8 } },
  animationDuration: BREATH_MS,
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
  animationTimingFunction: 'ease-in-out',
};

const breatheHalo: CSSAnimationProperties = {
  ...breatheLine,
  animationName: { from: { opacity: 0.35 * 0.35 }, to: { opacity: 0.8 * 0.35 } },
};

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    top: -4,
    left: '8%',
    right: '8%',
    height: 14,
    borderRadius: 999,
    backgroundColor: signal.turn,
  },
  line: {
    position: 'absolute',
    top: 1,
    left: '14%',
    right: '14%',
    height: 4,
    borderRadius: 999,
    backgroundColor: signal.turn,
  },
  // Reduce-motion: a steady glow.
  haloStill: { opacity: 0.6 * 0.35 },
  lineStill: { opacity: 0.6 },
});
