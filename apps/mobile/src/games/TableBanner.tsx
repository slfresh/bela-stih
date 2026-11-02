import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '../theme';

/**
 * A strip under a table's header for what only an online table says: the
 * room's clock on my move, the countdown to the next round, a rematch vote.
 * The online table hands its content down; the tables draw the strip in
 * their own layout, so it pushes the table down rather than lying over the
 * others' names, and it keeps its height whether or not it has anything to
 * say, so the table does not jump each time the turn comes round.
 *
 * Offline nothing provides it, and the tables look exactly as they did.
 */
const Banner = createContext<ReactNode | undefined>(undefined);

export const TableBannerProvider = Banner.Provider;

/** The strip, in a table's header: nothing at all when the table is offline. */
export function TableBanner() {
  const content = useContext(Banner);
  if (content === undefined) return null;
  return <View style={styles.strip}>{content}</View>;
}

/** The strip's own height: one line of text and the clock's bar under it. */
export const BANNER_HEIGHT = 34;

const styles = StyleSheet.create({
  strip: {
    minHeight: BANNER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: 2,
  },
});
