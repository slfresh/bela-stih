import { memo } from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Card, Rank, Suit } from '@belot/engine';
import { cardLang, type DeckStyle } from '../cosmetics';
import { counters } from '../dev/counters';
import { indexColour, PipShape, suitColour } from './pips';
import { cornerIndexLayout, INDEX_PIP_SCALE } from './cornerIndex';
import { SeasonScene } from './scenes';
import { CourtHalf } from './courts';
import { garb } from './palette';
import { Image as RNImage, StyleSheet, Text as RNText, View } from 'react-native';
import { FrenchFace, frenchColour } from './french';
import { SimpleFace } from './simple';
import { vintageSource } from './vintage';

/**
 * A mađarica, drawn on a 100x145 canvas, composed from the Tell-pattern canon
 * (see docs/deck-reference.md):
 *
 *  - Aces carry the FOUR SEASONS: two pips up top (they are historically
 *    deuces), a framed scene, and a localized season banner.
 *  - Courts are double-headed: one half-figure mirrored about the centre rule.
 *    Kings ride; Obers and Unters are named Schiller characters.
 *  - Number cards repeat the pip, lower half inverted, Roman numeral indices —
 *    and the VII of acorns carries the maker's name in a central panel, the
 *    traditional signature spot.
 *
 * Everything is vector; nothing is traced from a copyrighted printing.
 */

const COURTS: Rank[] = ['J', 'Q', 'K'];

/** Pip layouts for VII–X: x column, t 0..1 down the pip field. */
const COL = { L: 30, C: 50, R: 70 } as const;

/**
 * Number cards the Tell-pattern way: pips hug the left and right edges in a
 * mirrored top/bottom arrangement (the lower half printed upside down), the
 * roman numeral sits centred at BOTH ends, and the freed middle corridor
 * carries a small scenic vignette — exactly as on the printed deck.
 *
 * Each entry is the TOP half; the bottom half repeats it inside a 180°
 * rotation. [x, y] on the card canvas; y rows are 25 / 44 / 63.
 */
const L = 21;
const R = 79;
const C = 50;
const HALF_LAYOUTS: Record<string, { top: Array<[number, number]>; bottom: Array<[number, number]> }> = {
  '10': {
    top: [[L, 25], [R, 25], [C, 44], [L, 63], [R, 63]],
    bottom: [[L, 25], [R, 25], [C, 44], [L, 63], [R, 63]],
  },
  '9': {
    top: [[L, 25], [R, 25], [C, 44], [L, 63], [R, 63]],
    bottom: [[L, 25], [R, 25], [L, 63], [R, 63]],
  },
  '8': {
    top: [[L, 25], [R, 25], [L, 63], [R, 63]],
    bottom: [[L, 25], [R, 25], [L, 63], [R, 63]],
  },
  '7': {
    top: [[L, 25], [R, 25], [L, 63], [R, 63]],
    bottom: [[L, 25], [R, 25], [C, 44]],
  },
};

const PIP_SCALE = 0.175;

/**
 * Memoised on (card, width, style). A director tick re-renders the whole
 * table, and before this every one of the twelve faces on it — eight in the
 * fan, four in the trick — rebuilt its SVG tree every time, whether or not
 * anything about it had changed. That was the frame budget on a mid-range
 * Android spent before any animation was added.
 *
 * `style` is an explicit prop rather than a read of module state inside,
 * because a memoised component that reads module state during render would
 * freeze on the old deck when the player changes it in Settings.
 */
export const CardFace = memo(CardFaceImpl, (a, b) =>
  a.card.suit === b.card.suit &&
  a.card.rank === b.card.rank &&
  a.width === b.width &&
  a.style === b.style &&
  a.index === b.index,
);

function CardFaceImpl({
  card,
  width,
  style,
  index = true,
}: {
  card: Card;
  width: number;
  style: DeckStyle;
  /** The corner index: on by default; the gallery may show the bare printing. */
  index?: boolean;
}) {
  counters.cardFace++;
  const height = width * 1.45;

  // The vintage deck is photographic: a real printed card, rounded and framed
  // — the index is a small cream chip laid over the corner, the photo untouched.
  if (style === 'starinske') {
    const image = (
      <RNImage
        source={vintageSource(card)}
        style={{
          width,
          height,
          borderRadius: width * 0.09,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'rgba(0,0,0,0.35)',
        }}
        resizeMode="cover"
      />
    );
    if (!index) return image;
    const chip = Math.max(14, Math.round(width * 0.22));
    return (
      <View style={{ width, height }}>
        {image}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: Math.round(width * 0.05),
            top: Math.round(width * 0.05),
            height: chip,
            minWidth: chip,
            paddingHorizontal: 3,
            borderRadius: chip / 3,
            backgroundColor: garb.cream,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText style={{ color: indexColour(card.suit), fontSize: Math.round(chip * 0.7), fontWeight: '800' }}>
            {cardLang().rankShort(card.rank)}
          </RNText>
        </View>
      </View>
    );
  }

  const frame = style === 'francuske' ? frenchColour(card.suit) : suitColour(card.suit).fill;

  return (
    <Svg width={width} height={height} viewBox="0 0 100 145">
      {/* stock and a double rule, the way a printed card is bordered */}
      <Rect x="0" y="0" width="100" height="145" rx="9" fill={garb.cream} />
      <Rect
        x="0.75" y="0.75" width="98.5" height="143.5" rx="8.5"
        fill="none" stroke="rgba(0,0,0,0.30)" strokeWidth="1.5"
      />
      <Rect
        x="4.5" y="4.5" width="91" height="136" rx="6"
        fill="none" stroke={frame} strokeWidth="0.9" opacity={0.45}
      />

      {style === 'francuske' ? (
        <FrenchFace card={card} />
      ) : style === 'simple' ? (
        <SimpleFace card={card} />
      ) : card.rank === 'A' ? (
        <Ace suit={card.suit} colour={suitColour(card.suit).fill} />
      ) : COURTS.includes(card.rank) ? (
        <Court rank={card.rank} suit={card.suit} />
      ) : (
        <Pips rank={card.rank} suit={card.suit} />
      )}
      {/* the corner index, at both ends, on the mađarice only: the other faces carry their own */}
      {index && style === 'madarice' && (
        <>
          <CornerIndex card={card} />
          <G transform="rotate(180 50 72.5)">
            <CornerIndex card={card} />
          </G>
        </>
      )}
    </Svg>
  );
}

/**
 * The rank in the corner — and on courts and aces the pip too, since their
 * own pips sit inboard or low. Number cards show the numeral alone: their
 * pips are the suit, and the top-left one starts where a corner pip would.
 */
function CornerIndex({ card }: { card: Card }) {
  const withPip = card.rank === 'A' || COURTS.includes(card.rank);
  const l = cornerIndexLayout(cardLang().rankShort(card.rank), withPip);
  const ink = indexColour(card.suit);
  return (
    <G>
      <SvgText x={l.x} y={l.y} fontSize={l.fontSize} fontWeight="bold" fill={ink} textAnchor="middle">
        {l.label}
      </SvgText>
      {l.pip && (
        <G transform={`translate(${l.pip.x} ${l.pip.y}) scale(${INDEX_PIP_SCALE})`}>
          <PipShape suit={card.suit} />
        </G>
      )}
    </G>
  );
}

/** Number cards: mirrored edge pips, centred numerals, and the vignette. */
function Pips({ rank, suit }: { rank: Rank; suit: Suit }) {
  const layout = HALF_LAYOUTS[rank];
  if (!layout) return null;
  const half = (100 * PIP_SCALE) / 2;
  const makerPanel = rank === '7' && suit === 'clubs';
  const numeral = cardLang().rankShort(rank);
  const { fill } = suitColour(suit);

  const pipAt = ([x, y]: [number, number], i: number) => (
    <G key={i} transform={`translate(${x - half} ${y - half}) scale(${PIP_SCALE})`}>
      <PipShape suit={suit} />
    </G>
  );

  return (
    <G>
      {/* the numeral, centred at both ends as on the printed cards */}
      <SvgText x="50" y="17.5" fontSize="12" fontWeight="bold" fill={fill} textAnchor="middle">
        {numeral}
      </SvgText>
      {layout.top.map(pipAt)}
      <G transform="rotate(180 50 72.5)">
        <SvgText x="50" y="17.5" fontSize="12" fontWeight="bold" fill={fill} textAnchor="middle">
          {numeral}
        </SvgText>
        {layout.bottom.map(pipAt)}
      </G>

      {/* the middle corridor: maker's panel on the VII of acorns, a small
          scenic vignette everywhere else — the pattern's little pictures */}
      {makerPanel ? (
        <G>
          <Rect x="26" y="66" width="48" height="13" rx="2.5"
            fill={garb.cream} stroke={garb.brownDark} strokeWidth="1" />
          <SvgText x="50" y="75" fontSize="7.5" fontWeight="bold" fill={garb.brownDark}
            textAnchor="middle" letterSpacing="0.8">
            BELA ŠTIH
          </SvgText>
        </G>
      ) : (
        <RankVignette suit={suit} />
      )}
    </G>
  );
}

/**
 * The little picture between the pips, one motif per suit: a horseman for
 * hearts, the mower for bells, a riverside for leaves, a leaping stag for
 * acorns. Flat silhouettes in the deck's garb colours, on a 30×21 box
 * centred at (50, 72.5).
 */
function RankVignette({ suit }: { suit: Suit }) {
  return (
    <G transform="translate(35 62)">
      {MADARICA_SUIT_VIGNETTE[suit]}
    </G>
  );
}

const MADARICA_SUIT_VIGNETTE: Record<Suit, React.JSX.Element> = {
  // srce: a horseman at a trot
  hearts: (
    <G>
      <Path d="M2 19 H28" stroke={garb.skinLine} strokeWidth="0.8" />
      <Rect x="8" y="11" width="13" height="4.5" rx="2" fill={garb.brownDark} />
      <Rect x="9.5" y="15" width="1.4" height="4" fill={garb.brownDark} />
      <Rect x="12.5" y="15" width="1.4" height="4" fill={garb.brownDark} />
      <Rect x="16.5" y="15" width="1.4" height="4" fill={garb.brownDark} />
      <Rect x="19.3" y="15" width="1.4" height="4" fill={garb.brownDark} />
      <Path d="M20 12 L23.5 6 L26 7 L22.5 12 Z" fill={garb.brownDark} />
      <Rect x="23.6" y="5" width="4" height="2.6" rx="1.2" fill={garb.brownDark} />
      <Rect x="12.8" y="4.5" width="3.6" height="7" rx="1.6" fill={garb.red} />
      <Circle cx="14.6" cy="3" r="1.9" fill={garb.skin} />
    </G>
  ),
  // bundeva: the mower, scythe over his shoulder
  diamonds: (
    <G>
      <Path d="M2 19 H28" stroke={garb.skinLine} strokeWidth="0.8" />
      <Path d="M12 19l2-9h3l2 9h-2l-1.5-6L14 19z" fill={garb.blue} />
      <Rect x="12.6" y="4.5" width="3.6" height="6" rx="1.4" fill={garb.blue} />
      <Circle cx="14.4" cy="3" r="1.9" fill={garb.skin} />
      <Path d="M9 1l10 6" stroke={garb.brownDark} strokeWidth="1" />
      <Path d="M9 1C6 1 4 3 4 5c2-1 4-2 5-4z" fill={garb.steel} />
    </G>
  ),
  // list: a riverside with a tree
  spades: (
    <G>
      <Path d="M2 14 Q10 9 16 13 T28 13 V19 H2 Z" fill={garb.green} opacity={0.55} />
      <Path d="M2 17 Q8 15.5 15 17 T28 17" stroke={garb.blue} strokeWidth="1.4" fill="none" />
      <Rect x="21" y="7" width="1.8" height="7" fill={garb.brownDark} />
      <Circle cx="22" cy="5.5" r="3.6" fill={garb.greenDark} />
    </G>
  ),
  // žir: a stag mid-leap
  clubs: (
    <G>
      <Path d="M2 19 H28" stroke={garb.skinLine} strokeWidth="0.8" />
      <Path d="M8 16c0-3 4-6 8-6 3 0 6 1 7 3l1 3h-2l-1-2-2 4h-2l1-4-5 1-2 4h-2l1-4c-1 0-2 0-2 1z" fill={garb.brown} />
      <Path d="M22 10l2-4M24 8l2-3M23 9l3-1" stroke={garb.brownDark} strokeWidth="0.9" fill="none" />
      <Circle cx="22.5" cy="11" r="1.6" fill={garb.brown} />
    </G>
  ),
};

/** The ace: two pips (it is historically a deuce), the season scene, a banner. */
function Ace({ suit, colour }: { suit: Suit; colour: string }) {
  return (
    <G>
      {/* the deuce pips, flanking centre-top */}
      <G transform="translate(33.5 8) scale(0.14)">
        <PipShape suit={suit} />
      </G>
      <G transform="translate(52.5 8) scale(0.14)">
        <PipShape suit={suit} />
      </G>

      {/* framed scene */}
      <Rect x="9" y="27" width="82" height="76" rx="3"
        fill="#fbf9f3" stroke={colour} strokeWidth="1.1" />
      <G transform="translate(9 30) scale(0.82)">
        <SeasonScene suit={suit} />
      </G>

      {/* season banner */}
      <Rect x="20" y="108" width="60" height="14" rx="3"
        fill={garb.cream} stroke={garb.ink} strokeWidth="0.9" />
      <SvgText x="50" y="118" fontSize="9" fontWeight="bold" fill={garb.ink}
        textAnchor="middle" letterSpacing="0.4">
        {cardLang().seasonName(suit).toUpperCase()}
      </SvgText>
    </G>
  );
}

/** A double-headed court: one half, mirrored about the centre rule. */
function Court({ rank, suit }: { rank: Rank; suit: Suit }) {
  return (
    <G>
      <Line x1="8" y1="72.5" x2="92" y2="72.5" stroke={garb.ink} strokeWidth="1" opacity={0.55} />
      <CourtHalf rank={rank} suit={suit} />
      <G transform="rotate(180 50 72.5)">
        <CourtHalf rank={rank} suit={suit} />
      </G>
    </G>
  );
}

/**
 * The back of a card. Three shop designs. `variant` is always passed by the
 * caller — sprites and the hand read the selected back at their own render,
 * so this memoised component never has to peek at module state and cannot
 * fall out of step with the shop selection.
 */
export const CardBackFace = memo(CardBackFaceImpl);

function CardBackFaceImpl({ width, variant }: { width: number; variant: string }) {
  const height = width * 1.45;
  const kind = variant;
  return (
    <Svg width={width} height={height} viewBox="0 0 100 145">
      {kind === 'oak' ? (
        <OakBack />
      ) : kind === 'lattice' ? (
        <LatticeBack />
      ) : (
        <ClassicBack />
      )}
    </Svg>
  );
}

/** The house crimson weave. */
function ClassicBack() {
  return (
    <>
      <Rect x="0" y="0" width="100" height="145" rx="9" fill="#6b2230" />
      <G stroke="rgba(255,255,255,0.13)" strokeWidth="1.2">
        {Array.from({ length: 13 }).map((_, k) => (
          <Path key={`a${k}`} d={`M${-36 + k * 11} 138 L${8 + k * 11} 7`} />
        ))}
        {Array.from({ length: 13 }).map((_, k) => (
          <Path key={`b${k}`} d={`M${-36 + k * 11} 7 L${8 + k * 11} 138`} />
        ))}
      </G>
      {/* crop stroke first, thin frame LAST, or the crop paints the frame out */}
      <Rect
        x="5" y="5" width="90" height="135" rx="6"
        fill="none" stroke="#6b2230" strokeWidth="9"
      />
      <Rect
        x="5" y="5" width="90" height="135" rx="6"
        fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5"
      />
    </>
  );
}

/** Deep green with a gold diamond grid. */
function LatticeBack() {
  return (
    <>
      <Rect x="0" y="0" width="100" height="145" rx="9" fill="#1d4a33" />
      <G stroke="rgba(217,164,28,0.28)" strokeWidth="1">
        {Array.from({ length: 9 }).map((_, i) => (
          <Path key={`a${i}`} d={`M${-60 + i * 22} 138 L${6 + i * 22} 7`} />
        ))}
        {Array.from({ length: 9 }).map((_, i) => (
          <Path key={`b${i}`} d={`M${-60 + i * 22} 7 L${6 + i * 22} 138`} />
        ))}
      </G>
      {/* dots sit exactly on the lattice crossings */}
      <G fill={garb.gold} opacity={0.75}>
        {[28, 50, 72].map((x) => (
          <Circle key={`t${x}`} cx={x} cy={50.7} r={1.8} />
        ))}
        {[17, 39, 61, 83].map((x) => (
          <Circle key={`m${x}`} cx={x} cy={72.5} r={1.8} />
        ))}
        {[28, 50, 72].map((x) => (
          <Circle key={`u${x}`} cx={x} cy={94.3} r={1.8} />
        ))}
      </G>
      {/* crop stroke first, thin frame LAST, or the crop paints the frame out */}
      <Rect
        x="5" y="5" width="90" height="135" rx="6"
        fill="none" stroke="#1d4a33" strokeWidth="9"
      />
      <Rect
        x="5" y="5" width="90" height="135" rx="6"
        fill="none" stroke="rgba(217,164,28,0.5)" strokeWidth="1.5"
      />
    </>
  );
}

/** Oak brown with the acorn — the suit Croatians named the deck for. */
function OakBack() {
  return (
    <>
      <Rect x="0" y="0" width="100" height="145" rx="9" fill={garb.brownDark} />
      <Rect
        x="8" y="8" width="84" height="129" rx="5"
        fill="none" stroke="rgba(217,164,28,0.55)" strokeWidth="1.5"
      />
      <Rect
        x="12" y="12" width="76" height="121" rx="4"
        fill="none" stroke="rgba(217,164,28,0.25)" strokeWidth="1"
      />
      {/* parchment medallion so the brown acorn actually shows */}
      <Circle cx="50" cy="72.5" r="26" fill={garb.cream} />
      <Circle cx="50" cy="72.5" r="26" fill="none" stroke={garb.gold} strokeWidth="1.5" opacity={0.8} />
      <G transform="translate(33 55) scale(0.35)">
        <PipShape suit="clubs" />
      </G>
    </>
  );
}
