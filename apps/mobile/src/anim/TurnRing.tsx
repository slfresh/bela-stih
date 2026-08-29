import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../theme';

/**
 * The countdown ring around the active seat's avatar — the poker-table way of
 * making time visible.
 *
 * Driven by an ABSOLUTE deadline (epoch ms): backgrounding self-corrects,
 * because on re-render the remaining time is re-derived from the clock rather
 * than resumed from wherever the animation froze. One shared value animates on
 * the UI thread; no per-frame JS.
 *
 * `deadline == null` renders a static soft ring (offline "your move" pulse
 * territory — nothing auto-plays there, so no countdown is promised).
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function TurnRing({
  size,
  deadline,
  totalMs = 30_000,
}: {
  size: number;
  deadline: number | null;
  totalMs?: number;
}) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(deadline === null ? 1 : 0);

  useEffect(() => {
    if (deadline === null) {
      progress.value = 1;
      return;
    }
    const msLeft = Math.max(0, deadline - Date.now());
    progress.value = Math.min(1, msLeft / totalMs);
    progress.value = withTiming(0, { duration: msLeft, easing: Easing.linear });
  }, [progress, deadline, totalMs]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.value),
    stroke: interpolateColor(
      progress.value,
      [0, 0.18, 0.45, 1],
      ['#d63c2a', '#e2711d', theme.accent, theme.accent],
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
        stroke="rgba(255,255,255,0.14)"
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
