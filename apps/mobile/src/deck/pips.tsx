import Svg, { G, Path } from 'react-native-svg';
import PATHS from '../../brand/paths.json';
import type { Suit } from '@belot/engine';
import { MADARICA_SUIT, SUIT_COLOUR, type SuitColourRole } from '@belot/i18n';

/**
 * The four mađarice pips, drawn rather than borrowed.
 *
 * Bela is played with the Hungarian-suited deck — žir (acorns), list (leaves),
 * srce (hearts), bundeva (bells) — and unlike the French deck those four carry
 * four distinct colours, which is a real legibility win on a small screen.
 *
 * `PipShape` emits bare SVG children on a 0..100 canvas so it can be composed
 * inside a full card face; `SuitPip` wraps it for standalone use.
 */

/** Traditional mađarice colours, mapped from the shared role names. */
export const PIP_COLOUR: Record<SuitColourRole, { fill: string; dark: string }> = {
  brown: { fill: '#7a4a21', dark: '#4d2c10' }, // žir
  green: { fill: '#2f7d3a', dark: '#1d5325' }, // list
  red: { fill: '#c0202e', dark: '#8a121d' }, // srce
  gold: { fill: '#d9a41c', dark: '#a3760a' }, // bundeva
};

export function suitColour(suit: Suit): { fill: string; dark: string } {
  return PIP_COLOUR[SUIT_COLOUR[suit]];
}

/** The corner index's ink: the suit's own colour, except bundeva's gold, which is too light on cream (its dark reads 4.6:1). */
export function indexColour(suit: Suit): string {
  const role = SUIT_COLOUR[suit];
  return role === 'gold' ? PIP_COLOUR[role].dark : PIP_COLOUR[role].fill;
}

/**
 * Pip artwork on a 0..100 canvas, with no <Svg> wrapper — the paths come from
 * brand/paths.json, which the icon and store-art scripts draw from too, so
 * the mark on the launcher is the very pip on the table. Real Tell-pattern
 * pips are MULTICOLOURED: a gold acorn with a red flush under a green cap, a
 * two-tone leaf, a hawk-bell (Schellen) with its red equator band — the round
 * shape Croatians nicknamed "bundeva", the pumpkin.
 */
interface PipPath {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

const SUIT_ART = PATHS.suits as Record<string, PipPath[]>;

export function PipShape({ suit }: { suit: Suit }) {
  const shapes = SUIT_ART[MADARICA_SUIT[suit]] ?? [];
  return (
    <G>
      {shapes.map((p, i) => (
        <Path key={i} d={p.d} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.strokeWidth} />
      ))}
    </G>
  );
}

/** A pip on its own — used for the trump indicator and suit buttons. */
export function SuitPip({ suit, size = 24 }: { suit: Suit; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <PipShape suit={suit} />
    </Svg>
  );
}
