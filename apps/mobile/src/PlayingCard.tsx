import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Card } from '@belot/engine';
import type { DeckStyle } from './cosmetics';
import { CardBackFace, CardFace } from './deck';
import { radius, theme } from './theme';

/**
 * A card in the layout. The artwork itself lives in `./deck`; this only handles
 * sizing and the two states the table needs — playable, or not playable now.
 *
 * Memoised on its props, and the deck style is one of them: the parent reads
 * `cosmetics()` at its own render and passes it down, so a change in Settings
 * reaches a memoised card as a changed prop rather than being swallowed.
 */

const WIDTHS = { sm: 30, md: 46, lg: 58 } as const;
export type CardSize = keyof typeof WIDTHS;

export const PlayingCard = memo(
  function PlayingCard({
    card,
    size = 'md',
    width,
    deckStyle,
    dimmed = false,
    highlight = false,
    selected = false,
  }: {
    card: Card;
    size?: CardSize;
    /** Exact width, for the hand — it sizes itself to the screen. Wins over `size`. */
    width?: number;
    deckStyle: DeckStyle;
    dimmed?: boolean;
    highlight?: boolean;
    /** Armed by a first tap, waiting for the confirming second one. */
    selected?: boolean;
  }) {
    return (
      <View style={[highlight && styles.highlight, selected && styles.selected, dimmed && styles.dimmed]}>
        <CardFace card={card} width={width ?? WIDTHS[size]} style={deckStyle} />
      </View>
    );
  },
  (a, b) =>
    a.card.suit === b.card.suit &&
    a.card.rank === b.card.rank &&
    a.size === b.size &&
    a.width === b.width &&
    a.deckStyle === b.deckStyle &&
    a.dimmed === b.dimmed &&
    a.highlight === b.highlight &&
    a.selected === b.selected,
);

const styles = StyleSheet.create({
  highlight: {
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: theme.accent,
    margin: -2,
  },
  selected: {
    borderRadius: radius.card,
    borderWidth: 3,
    borderColor: theme.ok,
    margin: -3,
  },
  dimmed: { opacity: 0.4 },
});
