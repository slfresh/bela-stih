import type { ReactNode } from 'react';
import { room } from './cosmetics';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { shellWidth } from './table/useTableMetrics';
import { theme } from './theme';

/**
 * The browser box.
 *
 * A desktop browser is a wide, short window — nothing like the phone the table
 * is drawn for — so the app lives in a centred column. That column used to be a
 * fixed 480px portrait strip, which on a laptop left the table postage-stamp
 * sized between two black margins. It now widens in a landscape window so the
 * three-column table layout gets used, and stays a phone column in a portrait
 * one (a tablet held upright, or a phone browser).
 *
 * Its own component rather than a branch inside `App`, which owns the deep-link
 * and back-handler effects and should not gain a layout concern.
 */
export function WebShell({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  // The same rule `useTableMetrics` measures against, so the fan is always
  // sized for the box it is actually drawn in.
  const maxWidth = shellWidth(width, height);
  return (
    <View style={[styles.desk, { backgroundColor: room().page }]}>
      <View style={[styles.column, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  desk: {
    flex: 1,
    backgroundColor: theme.feltDeep,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  column: { flex: 1, overflow: 'hidden' },
});
