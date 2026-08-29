import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Card, Rank, Suit } from '@belot/engine';
import { Lang } from '@belot/i18n';
import { cosmetics } from '../cosmetics';
import { PipShape, suitColour } from './pips';
import { SeasonScene } from './scenes';
import { CourtHalf } from './courts';
import { garb } from './palette';

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

const lang = new Lang('hr');

const COURTS: Rank[] = ['J', 'Q', 'K'];

/** Pip layouts for VII–X: x column, t 0..1 down the pip field. */
const COL = { L: 30, C: 50, R: 70 } as const;

const LAYOUTS: Record<string, Array<[number, number]>> = {
  '7': [
    [COL.L, 0], [COL.R, 0], [COL.C, 0.17], [COL.L, 0.34], [COL.R, 0.34], [COL.L, 1], [COL.R, 1],
  ],
  '8': [
    [COL.L, 0], [COL.R, 0], [COL.L, 0.333], [COL.R, 0.333],
    [COL.L, 0.667], [COL.R, 0.667], [COL.L, 1], [COL.R, 1],
  ],
  '9': [
    [COL.L, 0], [COL.R, 0], [COL.L, 0.3], [COL.R, 0.3], [COL.C, 0.5],
    [COL.L, 0.7], [COL.R, 0.7], [COL.L, 1], [COL.R, 1],
  ],
  '10': [
    [COL.L, 0], [COL.R, 0], [COL.C, 0.15], [COL.L, 0.3], [COL.R, 0.3],
    [COL.L, 0.7], [COL.R, 0.7], [COL.C, 0.85], [COL.L, 1], [COL.R, 1],
  ],
};

// The pip field starts below the corner index and stops above its mirror.
const PIP_TOP = 33;
const PIP_BOTTOM = 114;
const PIP_SCALE = 0.175;

export function CardFace({ card, width }: { card: Card; width: number }) {
  const height = width * 1.45;
  const { fill } = suitColour(card.suit);
  const rank = lang.rankShort(card.rank);

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
        fill="none" stroke={fill} strokeWidth="0.9" opacity={0.45}
      />

      {/* Index top-left, and repeated bottom-right rotated 180° — as printed on
          the real cards, so the card reads from either end. */}
      <CornerIndex rank={rank} suit={card.suit} colour={fill} />
      <G transform="rotate(180 50 72.5)">
        <CornerIndex rank={rank} suit={card.suit} colour={fill} />
      </G>

      {card.rank === 'A' ? (
        <Ace suit={card.suit} colour={fill} />
      ) : COURTS.includes(card.rank) ? (
        <Court rank={card.rank} suit={card.suit} />
      ) : (
        <Pips rank={card.rank} suit={card.suit} />
      )}
    </Svg>
  );
}

/** The rank, plus a small pip beneath it, tight into the top-left corner. */
function CornerIndex({ rank, suit, colour }: { rank: string; suit: Suit; colour: string }) {
  const size = rank.length >= 4 ? 13 : rank.length === 3 ? 15 : 19;
  return (
    <G>
      <SvgText x="13" y={size + 3} fontSize={size} fontWeight="bold" fill={colour} textAnchor="middle">
        {rank}
      </SvgText>
      <G transform={`translate(8 ${size + 5}) scale(0.10)`}>
        <PipShape suit={suit} />
      </G>
    </G>
  );
}

/** Number cards: the pip repeated, lower half printed inverted. */
function Pips({ rank, suit }: { rank: Rank; suit: Suit }) {
  const layout = LAYOUTS[rank];
  if (!layout) return null;
  const span = PIP_BOTTOM - PIP_TOP;
  const half = (100 * PIP_SCALE) / 2;
  const makerPanel = rank === '7' && suit === 'clubs';

  return (
    <G>
      {layout.map(([x, t], i) => {
        const y = PIP_TOP + t * span;
        const flip = y > 72.5;
        return (
          <G
            key={i}
            transform={
              `translate(${x - half} ${y - half}) scale(${PIP_SCALE})` +
              (flip ? ' rotate(180 50 50)' : '')
            }
          >
            <PipShape suit={suit} />
          </G>
        );
      })}

      {/* The traditional maker's panel, on the VII of acorns only. */}
      {makerPanel && (
        <G>
          <Rect x="26" y="66" width="48" height="13" rx="2.5"
            fill={garb.cream} stroke={garb.brownDark} strokeWidth="1" />
          <SvgText x="50" y="75" fontSize="7.5" fontWeight="bold" fill={garb.brownDark}
            textAnchor="middle" letterSpacing="0.8">
            BELA ŠTIH
          </SvgText>
        </G>
      )}
    </G>
  );
}

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
        {lang.seasonName(suit).toUpperCase()}
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
 * The back of a card. Three shop designs; when no variant is passed, the
 * player's selected cosmetic applies — that keeps flight and deal sprites in
 * step with the hand without threading the profile everywhere.
 */
export function CardBackFace({ width, variant }: { width: number; variant?: string }) {
  const height = width * 1.45;
  const kind = variant ?? cosmetics().cardBack;
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
