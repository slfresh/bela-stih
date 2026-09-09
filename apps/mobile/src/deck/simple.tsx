import { G, Text as SvgText } from 'react-native-svg';
import type { Card, Rank } from '@belot/engine';
import { cardLang } from '../cosmetics';
import { PipShape, suitColour } from './pips';

/**
 * The big-and-simple face: one large mađarica pip, one large rank, corner
 * indices at both ends — nothing else. Keeps the deck's four-colour suits
 * (instant suit reading) while dropping every ornament. For players who want
 * the quickest possible read, or just bigger type.
 */

/** Plain-language rank: arabic numbers; the court letters as the app's locale spells them (K/D/B/A in Croatian). */
function simpleRank(rank: Rank): string {
  return rank === 'A' || rank === 'K' || rank === 'Q' || rank === 'J' ? cardLang().rankShort(rank) : rank;
}

function CornerIndex({ card }: { card: Card }) {
  const { fill } = suitColour(card.suit);
  const label = simpleRank(card.rank);
  const size = label.length > 1 ? 13 : 16;
  return (
    <G>
      <SvgText x="13" y={size + 2} fontSize={size} fontWeight="bold" fill={fill} textAnchor="middle">
        {label}
      </SvgText>
      <G transform={`translate(7.5 ${size + 5}) scale(0.11)`}>
        <PipShape suit={card.suit} />
      </G>
    </G>
  );
}

export function SimpleFace({ card }: { card: Card }) {
  const { fill } = suitColour(card.suit);
  const label = simpleRank(card.rank);
  return (
    <G>
      <CornerIndex card={card} />
      <G transform="rotate(180 50 72.5)">
        <CornerIndex card={card} />
      </G>
      <SvgText
        x="50"
        y="62"
        fontSize={label.length > 1 ? 34 : 40}
        fontWeight="bold"
        fill={fill}
        textAnchor="middle"
      >
        {label}
      </SvgText>
      <G transform="translate(31 76) scale(0.38)">
        <PipShape suit={card.suit} />
      </G>
    </G>
  );
}
