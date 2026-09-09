import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { playSfx, type Sfx } from '../audio';
import { pattern, type Pattern } from '../haptics';

/**
 * A pressable that feels pressed: it gives a little under the finger (scale
 * 0.97, opacity 0.88) and springs back on release, on the UI thread. Every
 * tappable thing in the app that is not a card sits on this, so a press
 * reads the same everywhere — and clicks and buzzes the same way, from one
 * place, instead of each call site remembering to.
 *
 * `sound` / `haptic` are null for a press whose own feedback follows at once
 * (claiming coins plays its own cascade).
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressScale({
  children,
  style,
  sound = 'tap',
  haptic = 'tap',
  pressSound = null,
  scaleTo = 0.97,
  onPress,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  sound?: Sfx | null;
  haptic?: Pattern | null;
  /** The down-click, for a button that should feel mechanical; the release still makes `sound`. */
  pressSound?: Sfx | null;
  /** How far it gives: 0.97 for a button, a touch less for a big tile. */
  scaleTo?: number;
}) {
  const s = useSharedValue(1);
  const o = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: o.value }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        s.value = withTiming(scaleTo, { duration: 80 });
        o.value = withTiming(0.88, { duration: 80 });
        if (pressSound) playSfx(pressSound);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 14, stiffness: 260, mass: 0.7 });
        o.value = withTiming(1, { duration: 120 });
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (sound) playSfx(sound);
        if (haptic) pattern(haptic);
        onPress?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
