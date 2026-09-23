import { useEffect, useRef, type ReactNode } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useMotionHere } from '../anim/MotionHere';

/**
 * A refused tap, said with a shake - the way a card the rules forbid already
 * shakes in the hand. `n` counts refusals and each new count shakes once:
 * a seen-guard, so a re-render or a remount never replays one. Still under
 * reduced motion, where the haptic and the words say it.
 *
 * The shake is this view's own transform, so the pressable inside keeps its
 * press scale: two animated transforms on one view would overwrite each other.
 */
export function Shake({
  n,
  style,
  pointerEvents,
  children,
}: {
  n: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: ViewProps['pointerEvents'];
  children: ReactNode;
}) {
  const x = useSharedValue(0);
  const seen = useRef(n);
  const still = useMotionHere() === 'reduced';
  useEffect(() => {
    if (seen.current === n) return;
    seen.current = n;
    if (n === 0 || still) return;
    x.value = withSequence(
      withTiming(-6, { duration: 45 }),
      withTiming(6, { duration: 90 }),
      withTiming(-3, { duration: 70 }),
      withTiming(0, { duration: 55 }),
    );
  }, [x, n, still]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View style={[style, anim]} pointerEvents={pointerEvents}>
      {children}
    </Animated.View>
  );
}
