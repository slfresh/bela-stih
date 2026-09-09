import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * The light on the baize: a radial wash from a touch lighter at the centre to
 * a shade darker at the rim, so the felt reads as a lit table rather than a
 * flat fill 4% lighter than the page. Sits first inside the felt's inner
 * ellipse, under the plaque and the slots; sized from the felt's measured
 * box, so it never touches the layout that positions the trick cross.
 *
 * Memoised on its inputs — a director tick must not redraw a gradient.
 */
export const FeltGlow = memo(function FeltGlow({
  width,
  height,
  felt,
}: {
  width: number;
  height: number;
  /** The baize colour; the wash is derived from it so every felt cosmetic lights the same way. */
  felt: string;
}) {
  if (width <= 0 || height <= 0) return null;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="baize" cx="50%" cy="46%" rx="58%" ry="58%">
          <Stop offset="0" stopColor={shade(felt, 0.06)} />
          <Stop offset="0.55" stopColor={felt} />
          <Stop offset="1" stopColor={shade(felt, -0.12)} />
        </RadialGradient>
      </Defs>
      {/* The felt's own shape: borderRadius 999 makes it a stadium, so the
          wash fills a stadium too — an ellipse left flat corners showing. */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={Math.min(width, height) / 2}
        ry={Math.min(width, height) / 2}
        fill="url(#baize)"
      />
    </Svg>
  );
});

/** Lighten (positive) or darken (negative) a #rrggbb colour by a fraction. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n) || hex.length !== 7) return hex;
  const ch = (v: number) => {
    const x = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(x)));
  };
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
