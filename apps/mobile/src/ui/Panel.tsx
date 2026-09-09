import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ink, radius, space, stroke, surface, theme, type } from '../theme';

/**
 * The app's one panel: a sunk plate with a hairline edge, optionally a small
 * label above its content. The home, the shop, the settings and the lobby all
 * sit on it, so a panel reads the same everywhere.
 */
export function Panel({
  label,
  tone = 'plain',
  style,
  children,
}: {
  label?: string;
  /** `accent`: the one panel on a screen that wants the finger — a bonus to claim. */
  tone?: 'plain' | 'accent';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={[styles.panel, tone === 'accent' && styles.accent, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: surface.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: stroke.hair,
    padding: space.lg - 2,
    gap: space.sm + 2,
  },
  accent: { borderColor: theme.accent },
  label: { color: ink.mid, ...type.sub },
});
