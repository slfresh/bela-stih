import { StyleSheet, View } from 'react-native';
import type { Card } from '@belot/engine';
import { CardBackFace, CardFace } from './deck';
import { radius, theme } from './theme';

/**
 * A card in the layout. The artwork itself lives in `./deck`; this only handles
 * sizing and the two states the table needs — playable, or not playable now.
 */

const WIDTHS = { sm: 30, md: 46, lg: 58 } as const;
export type CardSize = keyof typeof WIDTHS;

export function PlayingCard({
  card,
  size = 'md',
  width,
  dimmed = false,
  highlight = false,
  selected = false,
}: {
  card: Card;
  size?: CardSize;
  /** Exact width, for the hand — it sizes itself to the screen. Wins over `size`. */
  width?: number;
  dimmed?: boolean;
  highlight?: boolean;
  /** Armed by a first tap, waiting for the confirming second one. */
  selected?: boolean;
}) {
  return (
    <View style={[highlight && styles.highlight, selected && styles.selected, dimmed && styles.dimmed]}>
      <CardFace card={card} width={width ?? WIDTHS[size]} />
    </View>
  );
}

/** A face-down card, for seats whose hands we are not allowed to see. */
export function CardBack({ size = 'sm' }: { size?: CardSize }) {
  return <CardBackFace width={WIDTHS[size]} />;
}

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
