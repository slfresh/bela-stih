import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { signal, stroke } from '../theme';

/**
 * The countdown ring around the active seat's avatar — the poker-table way of
 * making time visible.
 *
 * Driven by an ABSOLUTE deadline (epoch ms): backgrounding self-corrects,
 * because on re-render the remaining time is re-derived from the clock rather
 * than resumed from wherever the animation froze. One shared value animates on
 * the UI thread; no per-frame JS.
 *
 * `deadline == null` renders a soft full ring with no countdown promised
 * (offline, nothing auto-plays); with `breathe` it breathes slowly in gold,
 * so a waiting seat reads as waiting rather than as a static badge.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function TurnRing({
  size,
  deadline,
  totalMs = 30_000,
  breathe = false,
}: {
  size: number;
  deadline: number | null;
  totalMs?: number;
  /** Without a deadline: a slow gold breath instead of a static ring. */
  breathe?: boolean;
}) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(deadline === null ? 1 : 0);
  const breath = useSharedValue(1);

  useEffect(() => {
    if (deadline === null && breathe) {
      breath.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(breath);
      breath.value = withTiming(1, { duration: 150 });
    }
    return () => cancelAnimation(breath);
  }, [breath, deadline, breathe]);

  useEffect(() => {
    if (deadline === null) {
      // No countdown: a full ring where one is wanted (breathing), otherwise
      // FREEZE where the arc was. The puck fades this ring out when its seat
      // has acted, and snapping to a full gold arc under that fade flashed
      // on every hand-off.
      cancelAnimation(progress);
      if (breathe) progress.value = 1;
      return;
    }
    const msLeft = Math.max(0, deadline - Date.now());
    progress.value = Math.min(1, msLeft / totalMs);
    // Information, not decoration: the clock draws under reduce-motion too.
    progress.value = withTiming(0, {
      duration: msLeft,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    });
  }, [progress, deadline, totalMs, breathe]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.value),
    opacity: breath.value,
    stroke: interpolateColor(
      progress.value,
      [0, 0.18, 0.45, 1],
      [signal.clockLow, signal.clockMid, signal.clockFull, signal.clockFull],
    ),
  }));

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={stroke.hair}
        strokeWidth={3}
        fill="none"
      />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${c} ${c}`}
        animatedProps={animatedProps}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
