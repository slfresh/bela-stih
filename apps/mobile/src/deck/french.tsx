import { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import type { Card, Rank, Suit } from '@belot/engine';
import { garb } from './palette';
import { font } from '../theme';

/**
 * The French-suited face: ♠ ♥ ♦ ♣, corner indices at both ends, classic pip
 * arrangements with the lower half inverted, and letter-crowned courts. All
 * drawn here — nothing traced. Suit mapping follows the engine's internal
 * names one-to-one (spades→♠, hearts→♥, diamonds→♦, clubs→♣).
 */

const RED = '#b3202e';
const INK = '#22262d';

export function frenchColour(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? RED : INK;
}

/** Rank text as printed on Croatian French-suited decks: A K D B 10..7. */
const FRENCH_RANK: Record<Rank, string> = {
  A: 'A',
  K: 'K',
  Q: 'D',
  J: 'B',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
};

/** Suit mark on a 0..100 canvas, single colour. */
export function FrenchPip({ suit }: { suit: Suit }) {
  const fill = frenchColour(suit);
  switch (suit) {
    case 'hearts':
      return (
        <Path
          d="M50 88C22 66 10 47 10 32 10 17 21 8 33 8c8 0 14 4 17 11 3-7 9-11 17-11 12 0 23 9 23 24 0 15-12 34-40 56z"
          fill={fill}
        />
      );
    case 'diamonds':
      return <Path d="M50 4 L86 50 L50 96 L14 50 Z" fill={fill} />;
    case 'spades':
      return (
        <G>
          <Path
            d="M50 6C28 28 12 44 12 58c0 12 9 20 20 20 7 0 12-3 15-8-1 8-4 14-9 18h24c-5-4-8-10-9-18 3 5 8 8 15 8 11 0 20-8 20-20C88 44 72 28 50 6z"
            fill={fill}
          />
        </G>
      );
    case 'clubs':
      return (
        <G>
          <Circle cx="50" cy="26" r="19" fill={fill} />
          <Circle cx="31" cy="54" r="19" fill={fill} />
          <Circle cx="69" cy="54" r="19" fill={fill} />
          <Path d="M46 50h8l6 40H40z" fill={fill} />
        </G>
      );
  }
}

function CornerIndex({ card }: { card: Card }) {
  const colour = frenchColour(card.suit);
  const label = FRENCH_RANK[card.rank];
  const size = label.length > 1 ? 14 : 17;
  return (
    <G>
      <SvgText x="13" y={size + 2} fontSize={size} fontFamily={font.bold} fill={colour} textAnchor="middle">
        {label}
      </SvgText>
      <G transform={`translate(7 ${size + 5}) scale(0.12)`}>
        <FrenchPip suit={card.suit} />
      </G>
    </G>
  );
}

/**
 * Classic pip arrangements, TOP half only; the bottom half mirrors through a
 * 180° rotation about the card centre (72.5). C-row pips at y 72.5 sit on the
 * fold and are emitted once.
 */
const L = 33;
const R = 67;
const C = 50;
const FRENCH_LAYOUTS: Record<string, { top: Array<[number, number]>; middle: Array<[number, number]> }> = {
  '10': { top: [[L, 30], [R, 30], [C, 46], [L, 62], [R, 62]], middle: [] },
  '9': { top: [[L, 30], [R, 30], [L, 62], [R, 62]], middle: [[C, 72.5]] },
  '8': { top: [[L, 30], [R, 30], [L, 62], [R, 62]], middle: [] },
  '7': { top: [[L, 30], [R, 30], [C, 46], [L, 62], [R, 62]], middle: [] },
};

function Pips({ card }: { card: Card }) {
  const layout = FRENCH_LAYOUTS[card.rank];
  if (!layout) return null;
  const scale = 0.17;
  const half = (100 * scale) / 2;
  const pipAt = ([x, y]: [number, number], i: number) => (
    <G key={i} transform={`translate(${x - half} ${y - half}) scale(${scale})`}>
      <FrenchPip suit={card.suit} />
    </G>
  );
  // The 7 is asymmetric on real decks: 5 up top, 2 below.
  const bottom: Array<[number, number]> =
    card.rank === '7' ? [[L, 30], [R, 30]] : layout.top;
  return (
    <G>
      {layout.top.map(pipAt)}
      {layout.middle.map(pipAt)}
      <G transform="rotate(180 50 72.5)">{bottom.map(pipAt)}</G>
    </G>
  );
}

/** Courts: a mirrored letter panel with a dignity mark per rank. */
function Court({ card }: { card: Card }) {
  const colour = frenchColour(card.suit);
  const mark =
    card.rank === 'K' ? (
      // crown
      <Path d="M35 33 L41 23 L47 31 L50 20 L53 31 L59 23 L65 33 L63 39 H37 Z" fill={garb.gold} />
    ) : card.rank === 'Q' ? (
      // coronet with three rounded points
      <Path
        d="M37 33 Q41 22 45 30 Q48 18 52 30 Q57 22 63 33 L61 39 H39 Z"
        fill={garb.gold}
      />
    ) : (
      // the unter's cap, feather trailing
      <G>
        <Path d="M38 33 Q50 21 62 33 L62 39 H38 Z" fill={garb.green} />
        <Path d="M58 30 Q66 18 72 16" stroke={garb.greenDark} strokeWidth="2.4" fill="none" />
      </G>
    );
  const half = (
    <G>
      {mark}
      <SvgText x="50" y="65" fontSize="26" fontFamily={font.bold} fill={colour} textAnchor="middle">
        {FRENCH_RANK[card.rank]}
      </SvgText>
    </G>
  );
  return (
    <G>
      {half}
      <G transform="rotate(180 50 72.5)">{half}</G>
      <Path d="M22 72.5 H78" stroke={colour} strokeWidth="0.8" opacity={0.5} />
    </G>
  );
}

/** The full French face, minus stock and border (the shell draws those). */
export function FrenchFace({ card }: { card: Card }) {
  return (
    <G>
      <CornerIndex card={card} />
      <G transform="rotate(180 50 72.5)">
        <CornerIndex card={card} />
      </G>
      {card.rank === 'A' ? (
        <G transform="translate(30 52.5) scale(0.4)">
          <FrenchPip suit={card.suit} />
        </G>
      ) : card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' ? (
        <Court card={card} />
      ) : (
        <Pips card={card} />
      )}
    </G>
  );
}

export { FRENCH_RANK };
