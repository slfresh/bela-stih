import { memo } from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Card52 } from '@belot/cards';
import { FrenchPip, frenchColour } from '../../deck/french';
import { garb } from '../../deck/palette';
import { font } from '../../theme';

/**
 * A French-suited card for the casino tables, drawn like every face in the
 * app: the rank and suit in two corners, and one large suit in the middle
 * with the rank over it — big enough to read across a phone at a glance,
 * which is what a table of five hands and a board needs more than pip art.
 * The back is a lattice in the deck's own maroon and gold.
 */

const RANK_TEXT: Record<Card52['rank'], string> = { '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

function Pip({ suit, x, y, size }: { suit: Card52['suit']; x: number; y: number; size: number }) {
  return (
    <G transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})`}>
      <FrenchPip suit={suit} />
    </G>
  );
}

function Face({ card }: { card: Card52 }) {
  const ink = frenchColour(card.suit);
  const r = RANK_TEXT[card.rank];
  const court = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  return (
    <>
      <Rect x={1} y={1} width={98} height={148} rx={9} fill={garb.cream} stroke={garb.ink} strokeOpacity={0.35} strokeWidth={1.2} />
      {court ? <Rect x={22} y={34} width={56} height={82} rx={6} fill="none" stroke={garb.gold} strokeWidth={2} /> : null}
      <SvgText x={50} y={66} fontSize={r.length > 1 ? 30 : 34} fontFamily={font.black} fill={ink} textAnchor="middle">
        {r}
      </SvgText>
      <Pip suit={card.suit} x={50} y={96} size={40} />
      <SvgText x={12} y={24} fontSize={18} fontFamily={font.black} fill={ink} textAnchor="middle">
        {r}
      </SvgText>
      <Pip suit={card.suit} x={12} y={36} size={13} />
      <G rotation={180} origin="50, 75">
        <SvgText x={12} y={24} fontSize={18} fontFamily={font.black} fill={ink} textAnchor="middle">
          {r}
        </SvgText>
        <Pip suit={card.suit} x={12} y={36} size={13} />
      </G>
    </>
  );
}

function Back() {
  const lines: string[] = [];
  for (let i = -150; i < 250; i += 14) lines.push(`M${i} 6 L${i + 138} 144`, `M${i + 138} 6 L${i} 144`);
  return (
    <>
      <Rect x={1} y={1} width={98} height={148} rx={9} fill={garb.redDark} stroke={garb.cream} strokeOpacity={0.4} strokeWidth={1.2} />
      <Defs>
        <ClipPath id="card52-back">
          <Rect x={7} y={7} width={86} height={136} rx={6} />
        </ClipPath>
      </Defs>
      <G opacity={0.35} clipPath="url(#card52-back)">
        <Path d={lines.join(' ')} stroke={garb.gold} strokeWidth={1} />
      </G>
      <Rect x={7} y={7} width={86} height={136} rx={6} fill="none" stroke={garb.gold} strokeWidth={2} />
    </>
  );
}

/** One card, face up (`card`) or face down (`null`), `width` wide at 2:3. */
export const Card52View = memo(function Card52View({ card, width }: { card: Card52 | null; width: number }) {
  return (
    <Svg width={width} height={width * 1.5} viewBox="0 0 100 150">
      {card ? <Face card={card} /> : <Back />}
    </Svg>
  );
});
