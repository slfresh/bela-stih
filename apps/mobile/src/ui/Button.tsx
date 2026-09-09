import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import type { Sfx } from '../audio';
import { radius, theme } from '../theme';
import { PressScale } from './PressScale';

/**
 * The app's one button. Three tones — plain, strong (the call to action),
 * bela (the one gold button on the table) — a compact size for the landscape
 * rails, and the press feel, click and buzz of `PressScale` underneath.
 */
export function Button({
  label,
  onPress,
  tone = 'plain',
  compact = false,
  sound = 'tap',
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'strong' | 'bela';
  /** Landscape rail size: caption type, tighter padding, a label wraps at most once. */
  compact?: boolean;
  /**
   * The click. Every button makes it, and makes it itself, so no caller wraps
   * its handler in a second one. `null` for a press whose own sound follows
   * at once (claiming coins).
   */
  sound?: Sfx | null;
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyle =
    tone === 'strong' ? styles.strong : tone === 'bela' ? styles.bela : styles.plain;
  return (
    <PressScale
      onPress={onPress}
      sound={sound}
      style={[styles.btn, toneStyle, compact && styles.compact, style]}
    >
      <Text style={[styles.text, compact && styles.textCompact]} numberOfLines={compact ? 2 : undefined}>
        {label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: { backgroundColor: 'rgba(255,255,255,0.07)' },
  strong: { backgroundColor: theme.wood, borderColor: theme.accent },
  bela: { backgroundColor: theme.accent, borderColor: theme.accent },
  compact: { paddingHorizontal: 8, paddingVertical: 7 },
  text: { color: theme.text, fontSize: 14, fontWeight: '600' },
  textCompact: { fontSize: 11, textAlign: 'center' },
});
