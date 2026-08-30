import { G, Text as SvgText } from 'react-native-svg';
import type { Card, Rank } from '@belot/engine';
import { PipShape, suitColour } from './pips';

/**
 * The big-and-simple face: one large mađarica pip, one large rank, corner
 * indices at both ends — nothing else. Keeps the deck's four-colour suits
 * (instant suit reading) while dropping every ornament. For players who want
 * the quickest possible read, or just bigger type.
 */

/** Plain-language rank: arabic numbers, K/D/B/A letters. */
const SIMPLE_RANK: Record<Rank, string> = {
  A: 'A',
  K: 'K',
  Q: 'D',
  J: 'B',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
};

function CornerIndex({ card }: { card: Card }) {
  const { fill } = suitColour(card.suit);
  const label = SIMPLE_RANK[card.rank];
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
  const label = SIMPLE_RANK[card.rank];
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
