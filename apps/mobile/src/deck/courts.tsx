import { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Rank, Suit } from '@belot/engine';
import { PipShape } from './pips';
import { garb } from './palette';

/**
 * The court cards of the Tell pattern: double-headed half-figures, mirrored by
 * CardFace about the centre rule.
 *
 * Canon (IPCS / collector documentation):
 *  - Kings are generic royalty ON HORSEBACK — crown, sceptre, the horse's head
 *    and neck rising through the half-figure.
 *  - Obers (baba) and Unters (dečko) are NAMED characters from Schiller's
 *    Wilhelm Tell, each with a name ribbon. Ober's suit pip sits HIGH beside
 *    the head, Unter's sits LOW by the centre rule — the origin of the
 *    Croatian gornjak/dolnjak nicknames.
 *  - Figures are multicoloured; the suit is carried by the pip, never by
 *    tinting the figure.
 *
 * Every half draws in a 0..100 × 0..72.5 box, built from chunky shapes that
 * survive 46 px cards. Detail beyond a head, a parti-coloured coat, headwear
 * and ONE prop per character is invisible at that size and is deliberately
 * left out.
 */

/** Who is who, per suit. Short traditional names, as printed on ribbons. */
const OBER: Record<Suit, string> = {
  clubs: 'TELL',
  hearts: 'GESSLER',
  diamonds: 'STÜSZI',
  spades: 'RUDENZ',
};
const UNTER: Record<Suit, string> = {
  clubs: 'HARRAS',
  hearts: 'KUONI',
  diamonds: 'REDING',
  spades: 'FÜRST',
};

export function courtName(rank: Rank, suit: Suit): string | null {
  if (rank === 'Q') return OBER[suit];
  if (rank === 'J') return UNTER[suit];
  return null;
}

export function CourtHalf({ rank, suit }: { rank: Rank; suit: Suit }) {
  const name = courtName(rank, suit);
  return (
    <G>
      {rank === 'K' ? <King suit={suit} /> : <Figure rank={rank} suit={suit} />}

      {name && (
        <G>
          <Rect
            x="22"
            y="58.5"
            width="56"
            height="11"
            rx="3"
            fill={garb.cream}
            stroke={garb.ink}
            strokeWidth="0.9"
          />
          <SvgText
            x="50"
            y="66.8"
            fontSize="8"
            fontWeight="bold"
            fill={garb.ink}
            textAnchor="middle"
            letterSpacing="0.5"
          >
            {name}
          </SvgText>
        </G>
      )}

      {/* The pip: Ober high beside the head, Unter low by the centre rule.
          The high position sits inboard of the corner index (an app-only
          element a real deck does not have to dodge). */}
      <G transform={rank === 'J' ? 'translate(7 42) scale(0.15)' : 'translate(24 4) scale(0.15)'}>
        <PipShape suit={suit} />
      </G>
    </G>
  );
}

// ---------------------------------------------------------------------------
// Kings — crowned, mounted, generic
// ---------------------------------------------------------------------------

/** Subtle variety between the four kings: horse colour and coat pairing. */
const KING_STYLE: Record<Suit, { horse: string; coatL: string; coatR: string }> = {
  clubs: { horse: garb.brown, coatL: garb.red, coatR: garb.gold },
  hearts: { horse: garb.cream, coatL: garb.blue, coatR: garb.red },
  diamonds: { horse: garb.gold, coatL: garb.green, coatR: garb.blue },
  spades: { horse: garb.steel, coatL: garb.red, coatR: garb.blue },
};

function King({ suit }: { suit: Suit }) {
  const s = KING_STYLE[suit];
  return (
    // Inset so the horse clears the corner index.
    <G transform="translate(6 3) scale(0.92)">
      {/* horse neck rising from the rule, head turned out to the left */}
      <Path
        d="M14 72 Q14 46 26 36 Q34 30 38 36 L34 44 Q28 50 28 72 Z"
        fill={s.horse}
        stroke={garb.ink}
        strokeWidth="1"
      />
      {/* head */}
      <Path d="M26 36 Q18 38 15 46 Q14 49 18 49 L27 44 Z" fill={s.horse} stroke={garb.ink} strokeWidth="1" />
      <Path d="M27 34 L24 28 L30 32 Z" fill={s.horse} stroke={garb.ink} strokeWidth="0.8" />
      <Circle cx="21" cy="42" r="1.2" fill={garb.ink} />
      <Path d="M18 48 Q24 50 28 47" stroke={garb.redDark} strokeWidth="1.1" fill="none" />
      {/* mane */}
      <Path d="M36 37 Q40 44 34 52 M34 40 Q37 46 32 54" stroke={garb.ink} strokeWidth="1" fill="none" opacity={0.6} />

      {/* the king: parti-coloured coat, sceptre, crowned head */}
      <Path d={`M42 40 H58 L64 58 H50 Z`} fill={s.coatL} />
      <Path d={`M58 40 H74 L82 58 H64 Z`} fill={s.coatR} />
      <Path d="M42 40 H74" stroke={garb.ink} strokeWidth="0.8" opacity={0.5} />
      {/* collar + head */}
      <Path d="M52 38 q6 4 12 0 l1.5 3 q-7.5 4.5 -15 0 z" fill={garb.ink} opacity={0.8} />
      <Circle cx="58" cy="27" r="8.5" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1" />
      {/* crown */}
      <Path
        d="M48 20 V10 l5 4.5 5 -6.5 5 6.5 5 -4.5 V20 Z"
        fill={garb.gold}
        stroke={garb.goldDark}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <Circle cx="53" cy="12" r="1.1" fill={garb.red} />
      <Circle cx="63" cy="12" r="1.1" fill={garb.red} />
      {/* sceptre across the free hand */}
      <Line x1="78" y1="26" x2="70" y2="46" stroke={garb.goldDark} strokeWidth="2.2" />
      <Circle cx="78" cy="24" r="2.6" fill={garb.gold} stroke={garb.goldDark} strokeWidth="0.8" />
      {/* rein from hand to horse head */}
      <Path d="M50 46 Q34 46 20 45" stroke={garb.brownDark} strokeWidth="1" fill="none" opacity={0.8} />
    </G>
  );
}

// ---------------------------------------------------------------------------
// Named figures — one silhouette, one prop each
// ---------------------------------------------------------------------------

interface FigureSpec {
  coatL: string;
  coatR: string;
  head: (key: string) => React.JSX.Element;
  prop: (key: string) => React.JSX.Element;
}

/** Shared head at (50, 26). */
const head = (extra?: React.JSX.Element) => (
  <G key="head">
    <Circle cx="50" cy="26" r="8.5" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1" />
    {extra}
  </G>
);

const SPECS: Record<string, FigureSpec> = {
  // --- Obers (baba) ---
  TELL: {
    coatL: garb.green,
    coatR: garb.red,
    head: (k) => (
      <G key={k}>
        {/* archer's cap with the famous feather */}
        <Path d="M41 21 Q50 12 59 21 L59 24 H41 Z" fill={garb.green} stroke={garb.greenDark} strokeWidth="0.8" />
        <Path d="M57 20 Q64 10 68 8 Q66 16 61 21 Z" fill={garb.gold} stroke={garb.goldDark} strokeWidth="0.7" />
      </G>
    ),
    prop: (k) => (
      // the crossbow, held vertical
      <G key={k}>
        <Line x1="76" y1="18" x2="76" y2="52" stroke={garb.brown} strokeWidth="2.6" />
        <Path d="M64 26 Q76 16 88 26" stroke={garb.steel} strokeWidth="2.2" fill="none" />
        <Line x1="64" y1="26" x2="88" y2="26" stroke={garb.steelDark} strokeWidth="0.9" />
      </G>
    ),
  },
  GESSLER: {
    coatL: garb.red,
    coatR: garb.blue,
    head: (k) => (
      <G key={k}>
        {/* the tyrant's tall hat — the hat of the story */}
        <Rect x="43" y="6" width="14" height="13" fill={garb.brownDark} />
        <Ellipse cx="50" cy="19.5" rx="11" ry="2.6" fill={garb.brownDark} />
        <Rect x="43" y="15" width="14" height="2.4" fill={garb.red} />
      </G>
    ),
    prop: (k) => (
      // governor's staff
      <G key={k}>
        <Line x1="77" y1="16" x2="77" y2="54" stroke={garb.brownDark} strokeWidth="2.4" />
        <Circle cx="77" cy="14" r="2.8" fill={garb.gold} stroke={garb.goldDark} strokeWidth="0.8" />
      </G>
    ),
  },
  STÜSZI: {
    coatL: garb.gold,
    coatR: garb.green,
    head: (k) => (
      <G key={k}>
        <Path d="M41 21 Q50 12 59 21 L59 24 H41 Z" fill={garb.brown} stroke={garb.brownDark} strokeWidth="0.8" />
        <Path d="M56 19 Q61 11 65 10 Q63 16 59 20 Z" fill={garb.green} stroke={garb.greenDark} strokeWidth="0.7" />
      </G>
    ),
    prop: (k) => (
      // hunting horn on its chest strap
      <G key={k}>
        <Path d="M42 38 Q58 34 70 44" stroke={garb.brownDark} strokeWidth="1.4" fill="none" />
        <Path d="M64 42 Q76 40 78 50 Q68 52 62 47 Z" fill={garb.gold} stroke={garb.goldDark} strokeWidth="1" />
      </G>
    ),
  },
  RUDENZ: {
    coatL: garb.blue,
    coatR: garb.red,
    head: (k) => (
      <G key={k}>
        {/* young noble: bare head, thin gold circlet */}
        <Path d="M42 20 Q50 13 58 20" stroke={garb.gold} strokeWidth="2" fill="none" />
        <Path d="M42 22 Q50 15 58 22 L58 19 Q50 12 42 19 Z" fill={garb.brown} opacity={0.9} />
      </G>
    ),
    prop: (k) => (
      // sword worn at the side, hilt up
      <G key={k}>
        <Line x1="74" y1="30" x2="80" y2="52" stroke={garb.steel} strokeWidth="2.4" />
        <Line x1="70" y1="33" x2="79" y2="30" stroke={garb.goldDark} strokeWidth="2" />
        <Circle cx="73" cy="27" r="1.8" fill={garb.gold} />
      </G>
    ),
  },

  // --- Unters (dečko) ---
  HARRAS: {
    coatL: garb.red,
    coatR: garb.blue,
    head: (k) => (
      <G key={k}>
        {/* soldier's rounded helmet */}
        <Path d="M41 22 Q41 11 50 11 Q59 11 59 22 Z" fill={garb.steel} stroke={garb.steelDark} strokeWidth="1" />
        <Line x1="50" y1="11" x2="50" y2="7" stroke={garb.steelDark} strokeWidth="1.6" />
      </G>
    ),
    prop: (k) => (
      // halberd
      <G key={k}>
        <Line x1="78" y1="10" x2="78" y2="54" stroke={garb.brown} strokeWidth="2.4" />
        <Path d="M78 12 Q88 14 86 24 Q80 22 78 20 Z" fill={garb.steel} stroke={garb.steelDark} strokeWidth="0.9" />
        <Path d="M78 10 L78 4" stroke={garb.steelDark} strokeWidth="1.8" />
      </G>
    ),
  },
  KUONI: {
    coatL: garb.brown,
    coatR: garb.green,
    head: (k) => (
      <G key={k}>
        {/* soft herdsman's hat */}
        <Path d="M40 20 Q50 10 60 20 Q55 17 50 17 Q45 17 40 20 Z" fill={garb.green} stroke={garb.greenDark} strokeWidth="0.8" />
        <Ellipse cx="50" cy="20" rx="11" ry="2.4" fill={garb.green} stroke={garb.greenDark} strokeWidth="0.8" />
      </G>
    ),
    prop: (k) => (
      // shepherd's crook
      <G key={k}>
        <Line x1="77" y1="20" x2="77" y2="54" stroke={garb.brown} strokeWidth="2.4" />
        <Path d="M77 20 Q77 12 71 13 Q68 14 70 18" stroke={garb.brown} strokeWidth="2.4" fill="none" />
      </G>
    ),
  },
  REDING: {
    coatL: garb.blue,
    coatR: garb.gold,
    head: (k) => (
      <G key={k}>
        {/* grey-haired, bare-headed — the oath-taker of the Rütli */}
        <Path d="M41 23 Q41 13 50 13 Q59 13 59 23 L59 20 Q50 15 41 20 Z" fill={garb.steel} />
      </G>
    ),
    prop: (k) => (
      // sword raised for the oath
      <G key={k}>
        <Line x1="68" y1="40" x2="84" y2="12" stroke={garb.steel} strokeWidth="2.6" />
        <Line x1="66" y1="36" x2="74" y2="41" stroke={garb.goldDark} strokeWidth="2" />
        <Circle cx="67" cy="43" r="1.8" fill={garb.gold} />
      </G>
    ),
  },
  FÜRST: {
    coatL: garb.brownDark,
    coatR: garb.blue,
    head: (k) => (
      <G key={k}>
        {/* the white-bearded elder */}
        <Path d="M42 28 Q42 40 50 40 Q58 40 58 28 Q54 32 50 32 Q46 32 42 28 Z" fill={garb.cream} stroke={garb.skinLine} strokeWidth="0.7" />
        <Path d="M42 21 Q50 14 58 21 L58 18 Q50 12 42 18 Z" fill={garb.cream} stroke={garb.skinLine} strokeWidth="0.7" />
      </G>
    ),
    prop: (k) => (
      // the federation scroll
      <G key={k}>
        <Rect x="68" y="38" width="16" height="9" rx="1.5" fill={garb.cream} stroke={garb.skinLine} strokeWidth="0.9" />
        <Line x1="70" y1="41" x2="82" y2="41" stroke={garb.skinLine} strokeWidth="0.8" />
        <Line x1="70" y1="44" x2="79" y2="44" stroke={garb.skinLine} strokeWidth="0.8" />
      </G>
    ),
  },
};

function Figure({ rank, suit }: { rank: Rank; suit: Suit }) {
  const spec = SPECS[(rank === 'Q' ? OBER : UNTER)[suit]]!;
  return (
    <G>
      {/* parti-coloured coat with a centre seam — the Tell-figure signature */}
      <Path d="M38 38 H50 L52 58 H32 Z" fill={spec.coatL} />
      <Path d="M50 38 H62 L68 58 H52 Z" fill={spec.coatR} />
      <Path d="M38 38 H62" stroke={garb.ink} strokeWidth="0.8" opacity={0.5} />
      <Line x1="50" y1="38" x2="51" y2="58" stroke={garb.ink} strokeWidth="0.7" opacity={0.45} />
      {/* collar */}
      <Path d="M44 36 q6 4 12 0 l1.5 3 q-7.5 4.5 -15 0 z" fill={garb.ink} opacity={0.75} />
      {head()}
      {spec.head('hw')}
      {spec.prop('prop')}
    </G>
  );
}
