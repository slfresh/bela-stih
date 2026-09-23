import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import { garb } from '../deck/palette';
import { ink, theme } from '../theme';

/**
 * The app's glyphs, drawn rather than typed. An emoji or a dingbat renders
 * as whatever font the phone has — a different gear, a different coin, a
 * different tick on every device — and none of them in the deck's colours.
 * Every icon here is a 24-unit drawing in the `garb` palette.
 */

interface IconProps {
  size?: number;
  colour?: string;
}

/** The coin: the same disc that flies to the wallet. */
export function Coin({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={11} fill={garb.gold} stroke={garb.goldDark} strokeWidth={2} />
      <Circle cx={12} cy={12} r={6.5} fill="none" stroke={garb.goldDark} strokeWidth={1.5} opacity={0.6} />
      <Path d="M7 8.5a6.5 6.5 0 0 1 8-2" fill="none" stroke={garb.cream} strokeWidth={1.8} strokeLinecap="round" opacity={0.8} />
    </Svg>
  );
}

export function Gear({ size = 20, colour = ink.hi }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.5l1.6 2.6 3-.6 1 2.9 2.9 1-.6 3 2.6 1.6-2.6 1.6.6 3-2.9 1-1 2.9-3-.6L12 21.5l-1.6-2.6-3 .6-1-2.9-2.9-1 .6-3L1.5 12l2.6-1.6-.6-3 2.9-1 1-2.9 3 .6z"
        fill={colour}
      />
      <Circle cx={12} cy={12} r={3.6} fill={theme.feltDeep} />
    </Svg>
  );
}

/** Points left by default; `direction` turns it. */
export function Chevron({
  size = 24,
  colour = ink.hi,
  direction = 'left',
}: IconProps & { direction?: 'left' | 'right' | 'down' | 'up' }) {
  const rotate = { left: 0, up: 90, right: 180, down: 270 }[direction];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${rotate}deg` }] }}>
      <Polyline points="15,5 8,12 15,19" fill="none" stroke={colour} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Check({ size = 18, colour = theme.okInk }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="4.5,12.5 9.5,17.5 19.5,6.5" fill="none" stroke={colour} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The host of a table. */
export function Crown({ size = 16, colour = garb.gold }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 18l-1-11 5.5 4L12 4l4.5 7L22 7l-1 11z" fill={colour} stroke={garb.goldDark} strokeWidth={1.2} strokeLinejoin="round" />
      <Rect x={3} y={18} width={18} height={3} rx={1} fill={garb.goldDark} />
    </Svg>
  );
}

/** A free seat. */
export function Chair({ size = 20, colour = ink.mid }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 3h12v9H6z" fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M4 12h16v4H4zM6 16v5M18 16v5" fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

/** A bot in a seat. */
export function Robot({ size = 16, colour = ink.mid }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={8} width={16} height={12} rx={3} fill="none" stroke={colour} strokeWidth={2} />
      <Path d="M12 8V4M9 4h6" stroke={colour} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={9} cy={14} r={1.6} fill={colour} />
      <Circle cx={15} cy={14} r={1.6} fill={colour} />
    </Svg>
  );
}

/** The partner's marker: colour is never the only carrier of "us". */
export function Diamond({ size = 10, colour = ink.hi }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2l10 10-10 10L2 12z" fill={colour} />
    </Svg>
  );
}

/** A level gained. */
export function Star({ size = 16, colour = garb.gold }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"
        fill={colour}
        stroke={garb.goldDark}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Close a sheet: two drawn strokes, never a typed cross. */
export function Close({ size = 16, colour = ink.hi }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6L18 18M18 6L6 18" stroke={colour} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Look: an open eye - the last trick, where there is no room for its name. */
export function Eye({ size = 16, colour = ink.hi }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M2.5 12C5.2 7.6 8.4 5.5 12 5.5s6.8 2.1 9.5 6.5c-2.7 4.4-5.9 6.5-9.5 6.5S5.2 16.4 2.5 12z"
        fill="none"
        stroke={colour}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3.3} fill={colour} />
    </Svg>
  );
}

/** Pause: two upright bars, rounded like the rest of the set. */
export function Pause({ size = 16, colour = ink.hi }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5v14M16 5v14" stroke={colour} strokeWidth={3.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Report: a flag on its pole. */
export function Flag({ size = 16, colour = ink.hi }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 21V4" stroke={colour} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M6 4h11l-2.5 4L17 12H6z" fill={colour} />
    </Svg>
  );
}

/** Not yet: a level to reach first. */
export function Lock({ size = 16, colour = ink.hi }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={10} width={14} height={11} rx={2.5} fill={colour} />
      <Path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke={colour} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** A presence dot: connected or not. */
export function Dot({ size = 8, on = true }: { size?: number; on?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill={on ? theme.okInk : 'none'} stroke={on ? theme.okInk : ink.lo} strokeWidth={3} />
    </Svg>
  );
}
