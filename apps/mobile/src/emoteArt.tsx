import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg';
import { garb } from './deck/palette';
import { EMOTE_FACES } from './emoteIds';

/**
 * The six quick emotes, drawn in the avatars' own style — a cream disc, ink
 * eyes, a red-dark mouth, the odd tear or hand — instead of the phone's emoji
 * font, which put a glossy yellow face next to an illustrated grandfather.
 * Same 100-unit canvas as the portraits. The wire ids are untouched; an id
 * without a face here simply shows its text.
 */

const FACE: Record<string, () => React.JSX.Element> = {
  smile: () => (
    <G>
      <Eyes />
      <Path d="M36 58 Q50 72 64 58" stroke={garb.redDark} strokeWidth="4" fill="none" strokeLinecap="round" />
    </G>
  ),
  laugh: () => (
    <G>
      {/* eyes shut with laughter */}
      <Path d="M35 42 Q41 36 47 42" stroke={garb.ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <Path d="M53 42 Q59 36 65 42" stroke={garb.ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <Path d="M32 56 Q50 82 68 56 Z" fill={garb.redDark} />
      <Path d="M40 60 Q50 66 60 60" fill={garb.cream} />
    </G>
  ),
  wow: () => (
    <G>
      <Circle cx="41" cy="41" r="4.5" fill={garb.ink} />
      <Circle cx="59" cy="41" r="4.5" fill={garb.ink} />
      {/* brows up */}
      <Path d="M34 30 Q41 26 48 30" stroke={garb.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Path d="M52 30 Q59 26 66 30" stroke={garb.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Ellipse cx="50" cy="64" rx="8" ry="10" fill={garb.redDark} />
    </G>
  ),
  cry: () => (
    <G>
      <Eyes />
      {/* brows down, a tear, the mouth turned */}
      <Path d="M34 33 Q41 30 47 34" stroke={garb.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Path d="M53 34 Q59 30 66 33" stroke={garb.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Path d="M36 66 Q50 54 64 66" stroke={garb.redDark} strokeWidth="4" fill="none" strokeLinecap="round" />
      <Path d="M62 48 Q68 58 62 62 Q56 58 62 48 Z" fill={garb.blue} />
    </G>
  ),
  clap: () => (
    <G>
      {/* two hands meeting, a few spark lines */}
      <Path d="M30 52 Q28 40 36 38 L48 50 L44 72 Q34 70 30 52 Z" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1.5" />
      <Path d="M70 52 Q72 40 64 38 L52 50 L56 72 Q66 70 70 52 Z" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1.5" />
      <Line x1="50" y1="26" x2="50" y2="34" stroke={garb.gold} strokeWidth="3" strokeLinecap="round" />
      <Line x1="38" y1="28" x2="42" y2="34" stroke={garb.gold} strokeWidth="3" strokeLinecap="round" />
      <Line x1="62" y1="28" x2="58" y2="34" stroke={garb.gold} strokeWidth="3" strokeLinecap="round" />
    </G>
  ),
  think: () => (
    <G>
      <Eyes />
      {/* one brow up, a straight mouth, a hand to the chin */}
      <Path d="M34 33 Q41 29 48 32" stroke={garb.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Line x1="40" y1="60" x2="58" y2="60" stroke={garb.redDark} strokeWidth="4" strokeLinecap="round" />
      <Path d="M56 68 Q66 64 70 72 Q68 80 60 80 Q54 78 56 68 Z" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1.5" />
    </G>
  ),
};

function Eyes() {
  return (
    <G>
      <Circle cx="41" cy="42" r="3.6" fill={garb.ink} />
      <Circle cx="59" cy="42" r="3.6" fill={garb.ink} />
    </G>
  );
}

export { hasEmoteFace } from './emoteIds';

/** Every id the predicate promises has a drawing — checked once at load. */
for (const id of EMOTE_FACES) {
  if (!FACE[id]) throw new Error(`emote ${id} has no face`);
}

/** A face on a cream disc, or null for an id with no drawing (the phrases). */
export function EmoteFace({ id, size }: { id: string; size: number }) {
  const paint = FACE[id];
  if (!paint) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="48" fill={garb.cream} stroke={garb.skinLine} strokeWidth="2" />
      {paint()}
    </Svg>
  );
}
