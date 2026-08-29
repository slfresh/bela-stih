import { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect, Svg } from 'react-native-svg';
import { garb } from './deck/palette';

/**
 * Preset player avatars — twelve kitchen-table characters, drawn in the same
 * naive flat style as the deck: chunky shapes, the shared garb palette, no
 * gradients, detail that survives a 46 px puck. Faces stay simple (skin disc,
 * dot eyes) with one or two distinguishing marks each — a moustache, a
 * headscarf, a pencil behind the ear.
 *
 * Each portrait is a full-bleed background disc in its own muted colour with a
 * bust (shoulders + head) on top, clipped to the circle so it sits cleanly on
 * a round puck.
 */

export const AVATAR_IDS: readonly string[] = [
  'djed',
  'baka',
  'brko',
  'snasa',
  'student',
  'teta',
  'sofer',
  'majstor',
  'gazda',
  'profesorica',
  'ribar',
  'kapetan',
];

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Shoulders, neck and a bare head at (50, 40). Overlays draw on top. */
function Bust({ coat, coatR }: { coat: string; coatR?: string }) {
  return (
    <G>
      <Path d="M10 102 Q13 66 34 61 L50 61 L50 102 Z" fill={coat} />
      <Path d="M50 61 L66 61 Q87 66 90 102 L50 102 Z" fill={coatR ?? coat} />
      {coatR ? (
        <Line x1="50" y1="62" x2="50" y2="100" stroke={garb.ink} strokeWidth="0.8" opacity={0.4} />
      ) : null}
      <Rect x="43" y="50" width="14" height="14" fill={garb.skin} />
      <Circle cx="50" cy="40" r="16" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1.2" />
    </G>
  );
}

function Eyes({ y = 39 }: { y?: number }) {
  return (
    <G>
      <Circle cx="43.5" cy={y} r="1.8" fill={garb.ink} />
      <Circle cx="56.5" cy={y} r="1.8" fill={garb.ink} />
    </G>
  );
}

function Smile() {
  return <Path d="M46 50.5 Q50 53.5 54 50.5" stroke={garb.redDark} strokeWidth="1.2" fill="none" />;
}

// ---------------------------------------------------------------------------
// The twelve portraits
// ---------------------------------------------------------------------------

interface PortraitSpec {
  /** Muted full-bleed background disc, distinct per character. */
  bg: string;
  paint: () => React.JSX.Element;
}

const PORTRAITS: Record<string, PortraitSpec> = {
  /** Grandpa: white walrus moustache, tweed flat cap. */
  djed: {
    bg: '#a9b6a1',
    paint: () => (
      <G>
        <Bust coat={garb.brown} />
        <Eyes />
        {/* white tufts over the ears */}
        <Path d="M33 38 Q31 46 35 50 Q37 44 36 39 Z" fill={garb.snow} />
        <Path d="M67 38 Q69 46 65 50 Q63 44 64 39 Z" fill={garb.snow} />
        {/* flat cap */}
        <Path d="M33 30 Q36 18 50 17 Q64 18 67 30 Z" fill={garb.brownDark} />
        <Rect x="31" y="28.5" width="38" height="4" rx="2" fill={garb.brownDark} />
        {/* walrus moustache */}
        <Path d="M37 45 Q50 40 63 45 Q62 53 54 50 Q50 48 46 50 Q38 53 37 45 Z" fill={garb.snow} />
      </G>
    ),
  },

  /** Grandma: red headscarf tied under the chin. */
  baka: {
    bg: '#cdb79f',
    paint: () => (
      <G>
        <Bust coat={garb.grape} />
        <Eyes />
        <Smile />
        {/* scarf hood */}
        <Path d="M31 48 Q29 21 50 20 Q71 21 69 48 Q68 31 50 30 Q32 31 31 48 Z" fill={garb.red} />
        <Circle cx="41" cy="26" r="1.1" fill={garb.snow} opacity={0.9} />
        <Circle cx="57" cy="25" r="1.1" fill={garb.snow} opacity={0.9} />
        {/* side flaps down to the jaw */}
        <Path d="M31 44 Q31 56 41 62 L44 57 Q35 52 34 42 Z" fill={garb.red} />
        <Path d="M69 44 Q69 56 59 62 L56 57 Q65 52 66 42 Z" fill={garb.red} />
        {/* knot under the chin */}
        <Path d="M46 58 L54 58 L50 66 Z" fill={garb.red} stroke={garb.redDark} strokeWidth="0.8" />
      </G>
    ),
  },

  /** The moustache himself: huge black handlebar, green hat. */
  brko: {
    bg: '#c2a3a0',
    paint: () => (
      <G>
        <Bust coat={garb.red} />
        <Eyes />
        {/* green hat with brim */}
        <Path d="M35 27 Q38 15 50 14 Q62 15 65 27 Z" fill={garb.green} stroke={garb.greenDark} strokeWidth="0.8" />
        <Rect x="29" y="26" width="42" height="4.5" rx="2.2" fill={garb.green} stroke={garb.greenDark} strokeWidth="0.8" />
        {/* the moustache, tips turned up */}
        <Path d="M34 46 Q50 39 66 46 Q65 53 55 50 Q50 47 45 50 Q35 53 34 46 Z" fill={garb.ink} />
        <Path d="M34 46 Q30.5 44 31 40.5" stroke={garb.ink} strokeWidth="2.2" fill="none" />
        <Path d="M66 46 Q69.5 44 69 40.5" stroke={garb.ink} strokeWidth="2.2" fill="none" />
      </G>
    ),
  },

  /** Young woman, red flower over her ear. */
  snasa: {
    bg: '#d8b8c2',
    paint: () => (
      <G>
        <Bust coat={garb.green} />
        {/* hair falling to the shoulders */}
        <Path d="M32 36 Q30 58 36 66 L43 64 Q37 52 38 38 Z" fill={garb.brownDark} />
        <Path d="M68 36 Q70 58 64 66 L57 64 Q63 52 62 38 Z" fill={garb.brownDark} />
        <Path d="M32 42 Q31 21 50 20 Q69 21 68 42 Q66 29 50 28 Q34 29 32 42 Z" fill={garb.brownDark} />
        <Eyes />
        <Smile />
        {/* red flower over the ear */}
        <G>
          <Circle cx="65.5" cy="31" r="2.2" fill={garb.red} />
          <Circle cx="68.3" cy="33" r="2.2" fill={garb.red} />
          <Circle cx="67.3" cy="36.4" r="2.2" fill={garb.red} />
          <Circle cx="63.7" cy="36.4" r="2.2" fill={garb.red} />
          <Circle cx="62.7" cy="33" r="2.2" fill={garb.red} />
          <Circle cx="65.5" cy="34" r="1.6" fill={garb.gold} />
        </G>
      </G>
    ),
  },

  /** Student: round glasses under an orange beanie. */
  student: {
    bg: '#9fb4c7',
    paint: () => (
      <G>
        <Bust coat={garb.grape} />
        <Eyes y={39.5} />
        {/* beanie with pom-pom */}
        <Circle cx="50" cy="14.5" r="3" fill={garb.flameBright} />
        <Path d="M34 30 Q34 15 50 15 Q66 15 66 30 Z" fill={garb.flame} />
        <Rect x="33" y="27" width="34" height="5.5" rx="2.5" fill={garb.flameBright} />
        {/* round glasses */}
        <Circle cx="43.5" cy="39.5" r="5.2" fill="none" stroke={garb.ink} strokeWidth="1.6" />
        <Circle cx="56.5" cy="39.5" r="5.2" fill="none" stroke={garb.ink} strokeWidth="1.6" />
        <Line x1="48.7" y1="39.5" x2="51.3" y2="39.5" stroke={garb.ink} strokeWidth="1.6" />
      </G>
    ),
  },

  /** Auntie: curly auburn hair, gold earrings. */
  teta: {
    bg: '#c9c39a',
    paint: () => (
      <G>
        <Bust coat={garb.blue} />
        {/* curls framing the face */}
        <Circle cx="36" cy="28" r="6" fill={garb.flame} />
        <Circle cx="46" cy="23" r="6.5" fill={garb.flame} />
        <Circle cx="57" cy="23" r="6.5" fill={garb.flame} />
        <Circle cx="65" cy="28" r="6" fill={garb.flame} />
        <Circle cx="33" cy="37" r="5.5" fill={garb.flame} />
        <Circle cx="67" cy="37" r="5.5" fill={garb.flame} />
        <Circle cx="33" cy="46" r="5" fill={garb.flame} />
        <Circle cx="67" cy="46" r="5" fill={garb.flame} />
        <Eyes />
        <Smile />
        {/* gold earrings */}
        <Circle cx="33.5" cy="54" r="2.4" fill={garb.gold} stroke={garb.goldDark} strokeWidth="0.8" />
        <Circle cx="66.5" cy="54" r="2.4" fill={garb.gold} stroke={garb.goldDark} strokeWidth="0.8" />
      </G>
    ),
  },

  /** Driver: grey peaked cap, stubbled jaw. */
  sofer: {
    bg: '#b3b0a8',
    paint: () => (
      <G>
        <Bust coat={garb.blueDark} />
        {/* stubble shading on the jaw */}
        <Path d="M36 44 Q37 55 50 55.5 Q63 55 64 44 Q60 51 50 51 Q40 51 36 44 Z" fill={garb.skinLine} opacity={0.5} />
        <Eyes />
        {/* driver's cap */}
        <Path d="M33 29 Q36 17 50 16 Q64 17 67 29 Z" fill={garb.steelDark} />
        <Rect x="32" y="27.5" width="36" height="4" rx="2" fill={garb.steelDark} />
        <Path d="M36 31.5 Q50 37 64 31.5 L64 33.5 Q50 39 36 33.5 Z" fill={garb.ink} />
      </G>
    ),
  },

  /** Craftsman: pencil behind the ear, rolled sweater collar. */
  majstor: {
    bg: '#c9a978',
    paint: () => (
      <G>
        <Bust coat={garb.blue} />
        <Ellipse cx="50" cy="61" rx="17" ry="6" fill={garb.steel} stroke={garb.steelDark} strokeWidth="1" />
        {/* the pencil, tucked so the hair holds it */}
        <Line x1="65.5" y1="29" x2="69.5" y2="43" stroke={garb.goldDark} strokeWidth="2.4" />
        <Path d="M69 42.5 L70.8 47.5 L66.9 44.2 Z" fill={garb.ink} />
        {/* short brown hair */}
        <Path d="M34 34 Q35 20 50 19 Q65 20 66 34 Q62 25 50 25 Q38 25 34 34 Z" fill={garb.brown} />
        <Eyes />
      </G>
    ),
  },

  /** The boss: slick black hair, waistcoat, a glint of watch-chain. */
  gazda: {
    bg: '#a99bb8',
    paint: () => (
      <G>
        <Bust coat={garb.ink} />
        {/* shirt and red waistcoat */}
        <Path d="M45 61 L50 71 L55 61 Z" fill={garb.snow} />
        <Path d="M40 62 L47 66 L47 100 L36 100 Q36 75 40 62 Z" fill={garb.red} />
        <Path d="M60 62 L53 66 L53 100 L64 100 Q64 75 60 62 Z" fill={garb.red} />
        {/* watch-chain hint */}
        <Path d="M47 84 Q53 90 60 84" stroke={garb.gold} strokeWidth="1.6" fill="none" />
        <Circle cx="60" cy="84" r="2" fill={garb.gold} stroke={garb.goldDark} strokeWidth="0.7" />
        {/* slick hair with a sheen */}
        <Path d="M34 39 Q33 21 50 20 Q67 21 66 39 Q66 27 50 26 Q34 27 34 39 Z" fill={garb.ink} />
        <Path d="M38 27 Q46 22.5 58 23.5" stroke={garb.steel} strokeWidth="1" fill="none" opacity={0.7} />
        <Eyes />
      </G>
    ),
  },

  /** Professor: grey bun, rectangular glasses. */
  profesorica: {
    bg: '#9dbfb6',
    paint: () => (
      <G>
        <Bust coat={garb.grape} />
        <Path d="M44 61 L50 67 L56 61 Z" fill={garb.snow} />
        {/* bun and grey hair */}
        <Circle cx="50" cy="17" r="6" fill={garb.steel} stroke={garb.steelDark} strokeWidth="0.8" />
        <Path d="M33 42 Q32 21 50 20 Q68 21 67 42 Q65 28 50 27 Q35 28 33 42 Z" fill={garb.steel} />
        {/* rectangular glasses */}
        <Rect x="37.5" y="36" width="11" height="7.5" rx="1.2" fill="none" stroke={garb.ink} strokeWidth="1.5" />
        <Rect x="51.5" y="36" width="11" height="7.5" rx="1.2" fill="none" stroke={garb.ink} strokeWidth="1.5" />
        <Line x1="48.5" y1="39" x2="51.5" y2="39" stroke={garb.ink} strokeWidth="1.5" />
        <Eyes y={39.8} />
      </G>
    ),
  },

  /** Fisherman: blue cap, white stubble, turtleneck. */
  ribar: {
    bg: '#8ea6b8',
    paint: () => (
      <G>
        <Bust coat={garb.blue} />
        {/* turtleneck collar */}
        <Rect x="41" y="51" width="18" height="10" rx="3" fill={garb.blue} stroke={garb.blueDark} strokeWidth="1" />
        {/* white stubble */}
        <Path d="M35 43 Q36 55 50 56 Q64 55 65 43 Q60 50.5 50 50.5 Q40 50.5 35 43 Z" fill={garb.snow} opacity={0.85} />
        <Eyes />
        {/* fisherman's cap */}
        <Path d="M33 28 Q36 16 50 15 Q64 16 67 28 Z" fill={garb.blueDark} />
        <Rect x="32" y="26.5" width="36" height="4.5" rx="2" fill={garb.blueDark} stroke={garb.ink} strokeWidth="0.6" />
        <Path d="M38 31 Q50 35.5 62 31 L62 33 Q50 37.5 38 33 Z" fill={garb.ink} />
      </G>
    ),
  },

  /** Captain: peaked cap with gold band, full white beard. */
  kapetan: {
    bg: '#8b93a8',
    paint: () => (
      <G>
        <Bust coat={garb.blueDark} />
        {/* double-breasted gold buttons */}
        <Circle cx="43" cy="72" r="1.5" fill={garb.gold} />
        <Circle cx="57" cy="72" r="1.5" fill={garb.gold} />
        <Circle cx="43" cy="81" r="1.5" fill={garb.gold} />
        <Circle cx="57" cy="81" r="1.5" fill={garb.gold} />
        {/* full white beard and moustache */}
        <Path d="M33 40 Q33 62 50 63 Q67 62 67 40 Q62 50 50 50 Q38 50 33 40 Z" fill={garb.snow} stroke={garb.steel} strokeWidth="0.7" />
        <Path d="M42 45.5 Q50 42.5 58 45.5 Q54 48.5 50 47 Q46 48.5 42 45.5 Z" fill={garb.cream} />
        <Eyes />
        {/* peaked cap, gold band, dark visor */}
        <Path d="M32 26 Q36 15 50 14 Q64 15 68 26 Z" fill={garb.snow} stroke={garb.steel} strokeWidth="0.8" />
        <Rect x="31" y="25" width="38" height="5" rx="2" fill={garb.gold} stroke={garb.goldDark} strokeWidth="0.8" />
        <Circle cx="50" cy="27.5" r="1.3" fill={garb.goldDark} />
        <Path d="M37 31 Q50 36 63 31 L63 33.5 Q50 38.5 37 33.5 Z" fill={garb.ink} />
      </G>
    ),
  },
};

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/** True when `id` names one of the preset portraits. */
export function hasAvatar(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PORTRAITS, id);
}

/**
 * A circular preset portrait, or null for an unknown id (the caller falls
 * back to an initial letter).
 */
export function Avatar({ id, size }: { id: string; size: number }) {
  const spec: PortraitSpec | undefined = PORTRAITS[id];
  if (!spec) return null;
  const clipId = `avatar-clip-${id}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx="50" cy="50" r="50" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Circle cx="50" cy="50" r="50" fill={spec.bg} />
        {spec.paint()}
      </G>
    </Svg>
  );
}
