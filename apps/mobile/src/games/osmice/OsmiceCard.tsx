import { memo } from 'react';
import Svg, { G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { Colour, OCard } from '@belot/games-osmice';
import { garb } from '../../deck/palette';
import { font } from '../../theme';

/**
 * An Osmice card, drawn here like every other face in the app.
 *
 * Its own look, on purpose: a cream card with a coloured frame and an
 * eight-sided medallion in the middle — the octagon is the game's name,
 * "eights" — rather than anyone else's oval. Numbers are printed large in the
 * medallion and small in two corners; action cards carry a drawn symbol; the
 * two wilds split the medallion into the four colours.
 */

export const OSMICE_INK: Record<Colour, string> = {
  red: garb.red,
  gold: garb.goldDark,
  green: garb.green,
  blue: garb.blue,
};
const FRAME: Record<Colour, string> = {
  red: garb.red,
  gold: garb.gold,
  green: garb.green,
  blue: garb.blue,
};

/** A regular octagon around (cx, cy). */
function octagon(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

const short = (c: OCard): string =>
  c.value === 'draw2' ? '+2' : c.value === 'wild4' ? '+4' : c.value === 'skip' || c.value === 'reverse' || c.value === 'wild' ? '' : c.value;

function Glyph({ card, ink }: { card: OCard; ink: string }) {
  switch (card.value) {
    case 'skip':
      // Two arrowheads running into a bar: "past you".
      return (
        <G fill={ink}>
          <Polygon points="34,58 50,75 34,92" />
          <Polygon points="48,58 64,75 48,92" />
          <Rect x={65} y={58} width={6} height={34} rx={2} />
        </G>
      );
    case 'reverse':
      // Two arrows passing each other: the direction turns round.
      return (
        <G fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M32 66 H64 M56 58 L64 66 L56 74" />
          <Path d="M68 86 H36 M44 78 L36 86 L44 94" />
        </G>
      );
    case 'wild':
    case 'wild4':
      return null;
    default:
      return (
        <SvgText
          x={50}
          y={card.value === 'draw2' ? 86 : 90}
          fontSize={card.value === 'draw2' ? 30 : 42}
          fontFamily={font.black}
          fill={ink}
          textAnchor="middle"
        >
          {short(card)}
        </SvgText>
      );
  }
}

/** The four colours as wedges of the medallion. */
function WildMedallion({ label }: { label: string }) {
  const order: Colour[] = ['red', 'gold', 'green', 'blue'];
  return (
    <G>
      {order.map((c, i) => {
        const a0 = (Math.PI / 2) * i - Math.PI / 2;
        const a1 = a0 + Math.PI / 2;
        const r = 30;
        const d = `M50 75 L${50 + r * Math.cos(a0)} ${75 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${50 + r * Math.cos(a1)} ${75 + r * Math.sin(a1)} Z`;
        return <Path key={c} d={d} fill={FRAME[c]} />;
      })}
      <Polygon points={octagon(50, 75, 31)} fill="none" stroke={garb.ink} strokeWidth={2} />
      {label ? (
        <SvgText x={50} y={86} fontSize={28} fontFamily={font.black} fill={garb.cream} stroke={garb.ink} strokeWidth={1.2} textAnchor="middle">
          {label}
        </SvgText>
      ) : null}
    </G>
  );
}

function Face({ card }: { card: OCard }) {
  const wild = card.colour === null;
  const frame = wild ? garb.ink : FRAME[card.colour!];
  const ink = wild ? garb.ink : OSMICE_INK[card.colour!];
  const corner = card.value === 'skip' ? '»' : card.value === 'reverse' ? '⇄' : short(card);
  return (
    <>
      <Rect x={1} y={1} width={98} height={148} rx={9} fill={garb.cream} stroke={garb.ink} strokeOpacity={0.35} strokeWidth={1.2} />
      <Rect x={6} y={6} width={88} height={138} rx={6} fill={frame} />
      <Rect x={12} y={12} width={76} height={126} rx={4} fill={garb.cream} />
      {wild ? (
        <WildMedallion label={card.value === 'wild4' ? '+4' : ''} />
      ) : (
        <>
          <Polygon points={octagon(50, 75, 33)} fill={frame} opacity={0.14} />
          <Polygon points={octagon(50, 75, 33)} fill="none" stroke={frame} strokeWidth={3} />
          <Glyph card={card} ink={ink} />
        </>
      )}
      <Corner card={card} ink={ink} label={corner} />
      <G rotation={180} origin="50, 75">
        <Corner card={card} ink={ink} label={corner} />
      </G>
    </>
  );
}

/** The top-left index: the value, or for a plain wild the four colours in a tiny square. */
function Corner({ card, ink, label }: { card: OCard; ink: string; label: string }) {
  if (card.value === 'wild') {
    const order: Colour[] = ['red', 'gold', 'blue', 'green'];
    return (
      <G>
        {order.map((c, i) => (
          <Rect key={c} x={16 + (i % 2) * 7} y={17 + Math.floor(i / 2) * 7} width={7} height={7} fill={FRAME[c]} />
        ))}
      </G>
    );
  }
  return (
    <SvgText x={17} y={30} fontSize={16} fontFamily={font.black} fill={ink}>
      {label}
    </SvgText>
  );
}

function Back() {
  return (
    <>
      <Rect x={1} y={1} width={98} height={148} rx={9} fill={garb.ink} stroke={garb.cream} strokeOpacity={0.4} strokeWidth={1.2} />
      <Rect x={7} y={7} width={86} height={136} rx={6} fill="none" stroke={garb.gold} strokeWidth={1.5} />
      <Polygon points={octagon(50, 75, 28)} fill="none" stroke={garb.gold} strokeWidth={3} />
      <SvgText x={50} y={88} fontSize={36} fontFamily={font.black} fill={garb.gold} textAnchor="middle">
        8
      </SvgText>
    </>
  );
}

/** One card, face up (`card`) or face down (`null`), `width` wide at 2:3. */
export const OsmiceCard = memo(function OsmiceCard({ card, width }: { card: OCard | null; width: number }) {
  return (
    <Svg width={width} height={width * 1.5} viewBox="0 0 100 150">
      {card ? <Face card={card} /> : <Back />}
    </Svg>
  );
});
