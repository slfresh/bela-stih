import { useEffect } from 'react';
import { AppState, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
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
  const o = useSharedValue(0);

  useEffect(() => {
    const breathe = () => {
      o.value = withTiming(0.35, { duration: 220 }, (done) => {
        if (done && !reduced) {
          o.value = withRepeat(
            withSequence(
              withTiming(0.8, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
              withTiming(0.35, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            false,
          );
        }
      });
    };
    if (reduced) o.value = withTiming(0.6, { duration: 220 });
    else breathe();

    // A loop in a backgrounded app is wasted battery; stop it and pick it up
    // again on return.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        if (reduced) o.value = 0.6;
        else breathe();
      } else {
        cancelAnimation(o);
        o.value = 0.5;
      }
    });
    return () => {
      sub.remove();
      cancelAnimation(o);
    };
  }, [o, reduced]);

  const halo = useAnimatedStyle(() => ({ opacity: o.value * 0.35 }));
  const line = useAnimatedStyle(() => ({ opacity: o.value }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.halo, halo]} />
      <Animated.View pointerEvents="none" style={[styles.line, line]} />
    </>
  );
}

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
});
