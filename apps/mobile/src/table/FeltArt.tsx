import { memo, useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { RoomStyle } from '../cosmetics';
import { signal, stroke } from '../theme';

/**
 * The table, drawn: a wooden rim with a lit top edge and a shaded underside,
 * the baize lit from above its centre and falling off towards the rim, a
 * hairline bevel where the two meet, and a faint grain in the cloth.
 *
 * It sits absolutely under everything in the felt element, sized from the
 * felt's measured box, so it never touches the layout that positions the
 * trick cross — the felt's border, padding and margin stay what they were,
 * merely transparent. Memoised on its inputs: a director tick must not
 * redraw a gradient.
 *
 * `lit` swaps the bevel for the turn signal: the whole table says "you".
 *
 * `inset`: a frame with a border positions an absolute child at its padding
 * box (Yoga and the browser alike), so the art inside the table's 6 px rim
 * drew 6 px right and down of the frame until it was pulled back by it.
 */

/** The rim's width in the felt's own layout: `styles.felt` borderWidth. */
export const RIM_W = 6;

let seq = 0;

export const FeltArt = memo(function FeltArt({
  width,
  height,
  room,
  lit = false,
  // The web gets the gradients without the grain (a pattern fill per frame is
  // what a browser's compositor is worst at); phones draw the cloth.
  grain = Platform.OS !== 'web',
  rim = RIM_W,
  inset = 0,
}: {
  width: number;
  height: number;
  room: RoomStyle;
  lit?: boolean;
  grain?: boolean;
  rim?: number;
  /** The frame's border width, when the art sits inside a bordered view. */
  inset?: number;
}) {
  // Gradient ids are document-global on the web: three swatches in the shop
  // must not share one.
  const id = useMemo(() => `felt${++seq}`, []);
  if (width <= 0 || height <= 0) return null;
  const r = Math.min(width, height) / 2;
  const inner = { x: rim, y: rim, w: width - 2 * rim, h: height - 2 * rim, r: Math.max(0, r - rim) };
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={inset ? { position: 'absolute', top: -inset, left: -inset, width, height } : StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={room.rimLight} />
          <Stop offset="0.5" stopColor={room.rim} />
          <Stop offset="1" stopColor={room.rimDark} />
        </LinearGradient>
        <LinearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke.lit} />
          <Stop offset="0.6" stopColor={stroke.lit} stopOpacity={0} />
          <Stop offset="1" stopColor={stroke.shade} />
        </LinearGradient>
        <RadialGradient id={`${id}-baize`} cx="50%" cy="42%" rx="62%" ry="62%">
          <Stop offset="0" stopColor={room.feltLight} />
          <Stop offset="0.55" stopColor={room.felt} />
          <Stop offset="1" stopColor={room.feltDeep} />
        </RadialGradient>
        <Pattern id={`${id}-grain`} width="7" height="7" patternUnits="userSpaceOnUse">
          <Circle cx="1.5" cy="1.5" r="0.8" fill={stroke.shade} opacity={0.35} />
          <Circle cx="5" cy="4.5" r="0.7" fill={stroke.lit} opacity={0.18} />
        </Pattern>
      </Defs>
      {/* the rim */}
      <Rect x={0} y={0} width={width} height={height} rx={r} ry={r} fill={`url(#${id}-rim)`} />
      {/* its lit top and shaded underside */}
      <Rect
        x={0.75}
        y={0.75}
        width={width - 1.5}
        height={height - 1.5}
        rx={r - 0.75}
        ry={r - 0.75}
        fill="none"
        stroke={`url(#${id}-edge)`}
        strokeWidth={1.5}
      />
      {/* the baize */}
      <Rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx={inner.r} ry={inner.r} fill={`url(#${id}-baize)`} />
      {grain && (
        <Rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx={inner.r} ry={inner.r} fill={`url(#${id}-grain)`} />
      )}
      {/* the shade the rim casts on the cloth */}
      <Rect
        x={inner.x + 0.75}
        y={inner.y + 0.75}
        width={inner.w - 1.5}
        height={inner.h - 1.5}
        rx={inner.r - 0.75}
        ry={inner.r - 0.75}
        fill="none"
        stroke={stroke.shade}
        strokeWidth={1.5}
        opacity={0.55}
      />
      {/* the bevel — or the turn light */}
      <Rect
        x={inner.x + 2}
        y={inner.y + 2}
        width={inner.w - 4}
        height={inner.h - 4}
        rx={inner.r - 2}
        ry={inner.r - 2}
        fill="none"
        stroke={lit ? signal.turn : stroke.hair}
        strokeWidth={lit ? 1.5 : 1}
        opacity={lit ? 0.85 : 0.6}
      />
    </Svg>
  );
});
