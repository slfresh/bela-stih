import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
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

/** Pip artwork on a 0..100 canvas, with no <Svg> wrapper. */
export function PipShape({ suit }: { suit: Suit }) {
  const { fill } = suitColour(suit);

  switch (MADARICA_SUIT[suit]) {
    case 'hearts':
      return (
        <Path
          d="M50 88C22 66 10 47 10 32 10 17 21 8 33 8c8 0 14 4 17 11 3-7 9-11 17-11 12 0 23 9 23 24 0 15-12 34-40 56z"
          fill={fill}
        />
      );

    case 'acorns':
      // Real Tell-pattern acorns are MULTICOLOURED: a gold body with a red
      // flush on one side, under a deep-green scaled cap.
      return (
        <G>
          <Rect x="46" y="4" width="8" height="16" rx="4" fill="#1d5325" />
          <Path d="M28 44c0 26 9 44 22 44s22-18 22-44z" fill="#d9a41c" />
          <Path d="M50 44v44c13 0 22-18 22-44z" fill="#c0202e" />
          <Path d="M22 44c0-17 12-28 28-28s28 11 28 28z" fill="#2f7d3a" />
          <Path d="M22 44c0-17 12-28 28-28v28z" fill="#1d5325" />
        </G>
      );

    case 'leaves':
      // Two-tone, the lit half yellower — as the printed leaves are.
      return (
        <G>
          <Path
            d="M50 6c26 18 36 42 26 60-7 13-18 20-26 26-8-6-19-13-26-26C14 48 24 24 50 6z"
            fill="#7cae3e"
          />
          <Path d="M50 6c26 18 36 42 26 60-7 13-18 20-26 26z" fill="#2f7d3a" />
          <Path d="M48 30h4v60h-4z" fill="#1d5325" />
        </G>
      );

    case 'bells':
      // A hawk-bell (Schellen): golden sphere, RED equator band, sound-slit —
      // the round shape Croatians nicknamed "bundeva", the pumpkin.
      return (
        <G>
          <Path d="M42 12 Q50 2 58 12" stroke="#4d2c10" strokeWidth="6" fill="none" />
          <Circle cx="50" cy="54" r="37" fill="#d9a41c" />
          <Path d="M14 50 Q50 62 86 50 L86 60 Q50 72 14 60 Z" fill="#c0202e" />
          <Rect x="46.5" y="66" width="7" height="12" fill="#4d2c10" />
          <Circle cx="50" cy="80" r="6" fill="#4d2c10" />
        </G>
      );
  }
}

/** A pip on its own — used for the trump indicator and suit buttons. */
export function SuitPip({ suit, size = 24 }: { suit: Suit; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <PipShape suit={suit} />
    </Svg>
  );
}
