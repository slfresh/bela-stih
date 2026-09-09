import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import type { Sfx } from '../audio';
import { garb } from '../deck/palette';
import { radius, surface, theme } from '../theme';
import { PressScale } from './PressScale';

/**
 * The app's one button. Three tones — plain, strong (the call to action),
 * bela (the one gold button on the table) — a compact size for the landscape
 * rails, and the press feel, click and buzz of `PressScale` underneath —
 * plus a down-click on the way in, so a button feels mechanical.
 */
export function Button({
  label,
  onPress,
  tone = 'plain',
  compact = false,
  sound = 'tap',
  style,
  icon,
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
  /** Drawn before the label: the suit pip on a trump-call button. */
  icon?: ReactNode;
}) {
  const toneStyle =
    tone === 'strong' ? styles.strong : tone === 'bela' ? styles.bela : styles.plain;
  return (
    <PressScale
      onPress={onPress}
      sound={sound}
      pressSound={sound === null ? null : 'press'}
      style={[styles.btn, toneStyle, compact && styles.compact, icon !== undefined && styles.withIcon, style]}
    >
      {icon}
      <Text
        style={[styles.text, tone === 'bela' && styles.textBela, compact && styles.textCompact]}
        numberOfLines={compact ? 2 : undefined}
      >
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
  plain: { backgroundColor: surface.chip },
  strong: { backgroundColor: theme.wood, borderColor: theme.accent },
  bela: { backgroundColor: theme.accent, borderColor: theme.accent },
  compact: { paddingHorizontal: 8, paddingVertical: 7 },
  withIcon: { flexDirection: 'row', gap: 6 },
  text: { color: theme.text, fontSize: 14, fontWeight: '600' },
  // Cream on gold is 1.9:1; the deck's ink on gold is 6.7:1.
  textBela: { color: garb.ink },
  textCompact: { fontSize: 11, textAlign: 'center' },
});
