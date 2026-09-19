import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { GIFT_IDS, type GiftId } from '@belot/progression';
import { garb } from './deck/palette';
import { hasGiftArt } from './giftIds';

/**
 * The table gifts — a fixed catalogue of fifteen things you would send across
 * a kafana table: a coffee, a round of rakija, a burek, a rose, a crown for
 * the night's winner. Drawn, not emoji, so a gift beside a player matches the
 * illustrated portraits instead of the phone's glossy font; the same 100-unit
 * canvas and flat garb palette as the avatars and the emotes.
 *
 * Each drawing has to survive two sizes and two grounds: a 14–22 dp badge
 * beside an avatar and a 48–56 dp picker cell, on the cream disc or straight
 * on the dark felt. So: one chunky silhouette per gift inside roughly
 * x 18–82 / y 14–86, a 3-unit-or-heavier dark outline around anything light,
 * and only the detail that still reads at badge size.
 */

const ART: Record<GiftId, () => React.JSX.Element> = {
  /** A blue fildžan on its saucer, dark coffee to the brim, steam rising. */
  kava: () => (
    <G>
      <Steam x={42} />
      <Steam x={57} />
      <Ellipse cx="50" cy="72" rx="30" ry="7" fill={garb.snow} stroke={garb.ink} strokeWidth="3.5" />
      <Path d="M28 44 H72 Q71 64 60 72 H40 Q29 64 28 44 Z" fill={garb.blue} stroke={garb.ink} strokeWidth="3.5" strokeLinejoin="round" />
      <Path d="M31 55 Q50 60 69 55" stroke={garb.snow} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Ellipse cx="50" cy="44" rx="22" ry="5" fill={garb.brownDark} stroke={garb.ink} strokeWidth="3.5" />
    </G>
  ),

  /** A glass of tea with a handle, the bag's tag hanging over the rim. */
  caj: () => (
    <G>
      {/* glass handle: a dark ring with a clear core */}
      <Path d="M64 46 Q78 46 78 57 Q78 68 62 68" stroke={garb.steelDark} strokeWidth="9" fill="none" />
      <Path d="M64 46 Q78 46 78 57 Q78 68 62 68" stroke={garb.snow} strokeWidth="3" fill="none" />
      <Glass d="M30 34 H68 L65 78 Q64 82 60 82 H38 Q34 82 33 78 Z">
        <Path d="M30.8 46 H67.2 L65 78 Q64 82 60 82 H38 Q34 82 33 78 Z" fill={garb.flame} />
      </Glass>
      {/* the string, over the rim, and the tag outside */}
      <Path d="M48 62 Q44 42 36 34 Q29 30 27 50" stroke={garb.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Rect x="21" y="49" width="12" height="13" rx="2" fill={garb.redDark} stroke={garb.ink} strokeWidth="3" />
    </G>
  ),

  /** A tall glass of lemonade, a lemon wheel on the rim, a red straw. */
  limunada: () => (
    <G>
      <Glass d="M34 22 H66 L62 82 Q61 85 58 85 H42 Q39 85 38 82 Z">
        <Path d="M34.7 34 H65.3 L62 82 Q61 85 58 85 H42 Q39 85 38 82 Z" fill={garb.gold} />
        <Path d="M48 72 L42 26 L34 16" stroke={garb.red} strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Glass>
      {/* lemon wheel hooked on the rim */}
      <Circle cx="66" cy="26" r="11" fill={garb.gold} stroke={garb.ink} strokeWidth="3" />
      <Circle cx="66" cy="26" r="6.5" fill={garb.cream} />
      <Line x1="66" y1="19.5" x2="66" y2="32.5" stroke={garb.gold} strokeWidth="3" />
      <Line x1="59.5" y1="26" x2="72.5" y2="26" stroke={garb.gold} strokeWidth="3" />
    </G>
  ),

  /** A small tulip glass of clear rakija, and the plum it came from. */
  rakija: () => (
    <G>
      <Glass d="M30 30 Q25 39 26 46 Q28 57 38 64 L38 71 Q31 73 29 79 H53 Q51 73 44 71 L44 64 Q54 57 56 46 Q57 39 52 30 Z">
        {/* clear rakija: only its surface shows */}
        <Path d="M27 43 Q41 48 55 43" stroke={garb.steel} strokeWidth="3" fill="none" strokeLinecap="round" />
      </Glass>
      {/* the plum, stalk and leaf */}
      <Path d="M67 52 Q68 44 74 40" stroke={garb.brownDark} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <Path d="M68 47 Q74 36 82 40 Q76 50 68 47 Z" fill={garb.green} stroke={garb.greenDark} strokeWidth="3" strokeLinejoin="round" />
      <Ellipse cx="66" cy="65" rx="13" ry="14" fill={garb.grape} stroke={garb.ink} strokeWidth="3.5" />
      <Path d="M66 52 Q60 64 64 78" stroke={garb.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
    </G>
  ),

  /** A glass beer mug, foam over the top and down the side. */
  pivo: () => (
    <G>
      <Path
        d="M62 42 H72 Q80 42 80 50 V64 Q80 72 72 72 H62 Z M62 50 H69 Q72 50 72 53 V61 Q72 64 69 64 H62 Z"
        fill={garb.snow}
        fillRule="evenodd"
        stroke={garb.ink}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <Rect x="24" y="32" width="40" height="52" rx="4" fill={garb.gold} stroke={garb.ink} strokeWidth="3.5" />
      <Line x1="36" y1="54" x2="36" y2="74" stroke={garb.flameBright} strokeWidth="3" strokeLinecap="round" />
      <Line x1="52" y1="48" x2="52" y2="74" stroke={garb.flameBright} strokeWidth="3" strokeLinecap="round" />
      <Path
        d="M22 38 Q18 28 27 26 Q29 17 39 19 Q45 12 54 17 Q64 14 66 24 Q72 29 67 37 Q64 41 58 39 Q54 43 48 39 L40 40 L40 50 Q40 55 35 55 Q30 55 30 50 L30 41 Q25 42 22 38 Z"
        fill={garb.cream}
        stroke={garb.ink}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
    </G>
  ),

  /** A stemmed glass of gemišt — white wine and soda, a few bubbles. */
  gemist: () => (
    <G>
      <Line x1="50" y1="56" x2="50" y2="78" stroke={garb.steelDark} strokeWidth="5" />
      <Ellipse cx="50" cy="80" rx="17" ry="4.5" fill={garb.snow} stroke={garb.steelDark} strokeWidth="3.5" />
      <Glass d="M30 18 H70 Q72 44 60 54 Q55 58 50 58 Q45 58 40 54 Q28 44 30 18 Z">
        <Path d="M30.4 32 H69.6 Q70 46 60 54 Q55 58 50 58 Q45 58 40 54 Q30 46 30.4 32 Z" fill={garb.gold} />
        <Circle cx="43" cy="46" r="2.5" fill={garb.snow} />
        <Circle cx="54" cy="39" r="2.5" fill={garb.snow} />
        <Circle cx="58" cy="49" r="2.5" fill={garb.snow} />
      </Glass>
    </G>
  ),

  /** A round coiled burek from above, baked brown in spots. */
  burek: () => (
    <G>
      <Circle cx="50" cy="50" r="31" fill={garb.gold} stroke={garb.brownDark} strokeWidth="3.5" />
      {/* the coil: half-turns about two centres five apart, ten between rings */}
      <Path
        d="M50 50 A5 5 0 0 1 60 50 A10 10 0 0 1 40 50 A15 15 0 0 1 70 50 A20 20 0 0 1 30 50 Q29 34 40 27"
        stroke={garb.brown}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <Ellipse cx="62" cy="31" rx="3" ry="2.2" fill={garb.brown} />
      <Ellipse cx="74" cy="58" rx="2.4" ry="3" fill={garb.brown} />
      <Ellipse cx="36" cy="70" rx="3" ry="2.2" fill={garb.brown} />
    </G>
  ),

  /** A slice of layer cake with a cherry on top. */
  kolac: () => (
    <G>
      <Path d="M20 54 L80 46 V74 L20 82 Z" fill={garb.brown} stroke={garb.ink} strokeWidth="3.5" strokeLinejoin="round" />
      <Path d="M20 66 L80 58 V63 L20 71 Z" fill={garb.cream} />
      <Path d="M20 54 L64 34 L80 46 Z" fill={garb.cream} stroke={garb.ink} strokeWidth="3.5" strokeLinejoin="round" />
      <Path d="M58 33 Q58 24 65 19" stroke={garb.brownDark} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Circle cx="57" cy="38" r="7" fill={garb.red} stroke={garb.ink} strokeWidth="3" />
    </G>
  ),

  /** An ice-cream cone, one red scoop on one brown. */
  sladoled: () => (
    <G>
      <Path d="M34 50 H66 L50 84 Z" fill={garb.gold} stroke={garb.ink} strokeWidth="3.5" strokeLinejoin="round" />
      {/* the waffle: two lines each way, parallel to the cone's sides */}
      <Line x1="44" y1="50" x2="55" y2="73.4" stroke={garb.brown} strokeWidth="3" />
      <Line x1="54" y1="50" x2="60" y2="62.8" stroke={garb.brown} strokeWidth="3" />
      <Line x1="56" y1="50" x2="45" y2="73.4" stroke={garb.brown} strokeWidth="3" />
      <Line x1="46" y1="50" x2="40" y2="62.8" stroke={garb.brown} strokeWidth="3" />
      <Path
        d="M32 50 Q30 34 50 32 Q70 34 68 50 Q64 55 60 51 Q56 56 50 51 Q44 56 40 51 Q36 55 32 50 Z"
        fill={garb.brown}
        stroke={garb.ink}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <Path d="M36 36 Q34 17 50 16 Q66 17 64 36 Q58 40 50 37 Q42 40 36 36 Z" fill={garb.red} stroke={garb.ink} strokeWidth="3.5" strokeLinejoin="round" />
    </G>
  ),

  /** A box of tissues, one pulled up ready — for the losing side. */
  maramice: () => (
    <G>
      <Path d="M20 50 L28 40 H72 L80 50 Z" fill={garb.blueDark} stroke={garb.ink} strokeWidth="3.5" strokeLinejoin="round" />
      <Ellipse cx="50" cy="45" rx="14" ry="2.5" fill={garb.ink} />
      <Path d="M38 46 Q34 34 40 24 Q44 30 48 20 Q54 28 59 22 Q66 32 62 46 Z" fill={garb.snow} stroke={garb.ink} strokeWidth="3" strokeLinejoin="round" />
      <Rect x="20" y="50" width="60" height="32" rx="2" fill={garb.blue} stroke={garb.ink} strokeWidth="3.5" />
      <Path d="M27 68 Q35 62 43 68 Q50 74 57 68 Q65 62 73 68" stroke={garb.snow} strokeWidth="3" fill="none" strokeLinecap="round" />
    </G>
  ),

  /** A red rose on a green stem, one leaf. */
  ruza: () => (
    <G>
      <Path d="M50 50 Q47 68 51 84" stroke={garb.greenDark} strokeWidth="5" fill="none" strokeLinecap="round" />
      <Path d="M50 71 Q58 57 72 61 Q64 75 50 71 Z" fill={garb.green} stroke={garb.greenDark} strokeWidth="3" strokeLinejoin="round" />
      {/* the head: petals cupped round a spiral bud */}
      <Path
        d="M31 34 Q30 20 41 19 Q46 14 50 18 Q54 14 59 19 Q70 20 69 34 Q68 52 50 54 Q32 52 31 34 Z"
        fill={garb.red}
        stroke={garb.redDark}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* one spiral, unwinding to the rim — asymmetric, so it never reads as a face */}
      <Path
        d="M51 31 Q56 31 56 35 Q56 40 50 40 Q43 40 43 33 Q43 25 51 25 Q63 25 63 37 Q63 49 50 50"
        stroke={garb.redDark}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </G>
  ),

  /** A four-leaf clover. */
  djetelina: () => (
    <G>
      <Path d="M50 44 Q54 66 62 84" stroke={garb.greenDark} strokeWidth="5" fill="none" strokeLinecap="round" />
      <CloverLeaf turn={0} />
      <CloverLeaf turn={90} />
      <CloverLeaf turn={180} />
      <CloverLeaf turn={270} />
    </G>
  ),

  /** A steel horseshoe, open end up so the luck stays in. */
  potkova: () => (
    <G>
      <Path
        d="M26 20 Q18 36 21 52 A29 29 0 0 0 79 52 Q82 36 74 20 H62 Q64 36 63 52 A13 13 0 0 1 37 52 Q36 36 38 20 Z"
        fill={garb.steel}
        stroke={garb.steelDark}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <NailHole x={29} y={32} />
      <NailHole x={29} y={46} />
      <NailHole x={33} y={63} />
      <NailHole x={71} y={32} />
      <NailHole x={71} y={46} />
      <NailHole x={67} y={63} />
    </G>
  ),

  /** A two-handled trophy cup on a brown plinth. */
  pehar: () => (
    <G>
      <TrophyHandle d="M33 26 Q20 24 22 36 Q24 46 38 48" />
      <TrophyHandle d="M67 26 Q80 24 78 36 Q76 46 62 48" />
      <Rect x="46" y="54" width="8" height="12" fill={garb.gold} stroke={garb.ink} strokeWidth="3" />
      <Path d="M30 20 H70 Q70 48 50 57 Q30 48 30 20 Z" fill={garb.gold} />
      <Path d="M61 20 H70 Q70 48 50 57 Q64 44 61 20 Z" fill={garb.goldDark} />
      <Path d="M30 20 H70 Q70 48 50 57 Q30 48 30 20 Z" fill="none" stroke={garb.ink} strokeWidth="3.5" strokeLinejoin="round" />
      <Path d="M38 70 Q38 64 50 64 Q62 64 62 70 Z" fill={garb.gold} stroke={garb.ink} strokeWidth="3" strokeLinejoin="round" />
      <Rect x="32" y="70" width="36" height="13" rx="2" fill={garb.brown} stroke={garb.ink} strokeWidth="3.5" />
    </G>
  ),

  /** A three-pointed gold crown, red and blue stones on the band. */
  kruna: () => (
    <G>
      <Path d="M25 70 L24 35 L38 50 L50 28 L62 50 L76 35 L75 70 Z" fill={garb.gold} stroke={garb.ink} strokeWidth="3.5" strokeLinejoin="round" />
      <Circle cx="24" cy="31" r="4" fill={garb.gold} stroke={garb.ink} strokeWidth="3" />
      <Circle cx="50" cy="24.5" r="4" fill={garb.gold} stroke={garb.ink} strokeWidth="3" />
      <Circle cx="76" cy="31" r="4" fill={garb.gold} stroke={garb.ink} strokeWidth="3" />
      <Rect x="23" y="62" width="54" height="15" rx="2" fill={garb.goldDark} stroke={garb.ink} strokeWidth="3.5" />
      <Circle cx="35" cy="69.5" r="4" fill={garb.blue} />
      <Circle cx="50" cy="69.5" r="4.5" fill={garb.red} />
      <Circle cx="65" cy="69.5" r="4" fill={garb.blue} />
    </G>
  ),
};

/**
 * A clear glass: its snow body, whatever is poured into it, then the outline
 * over both — a dark steel edge, so the glass still shows on the cream disc.
 */
function Glass({ d, children }: { d: string; children: React.ReactNode }) {
  return (
    <G>
      <Path d={d} fill={garb.snow} />
      {children}
      <Path d={d} fill="none" stroke={garb.steelDark} strokeWidth="3.5" strokeLinejoin="round" />
    </G>
  );
}

/** A trophy handle: an ink stroke under a gold one, so the loop reads outlined. */
function TrophyHandle({ d }: { d: string }) {
  return (
    <G>
      <Path d={d} stroke={garb.ink} strokeWidth="9" fill="none" strokeLinecap="round" />
      <Path d={d} stroke={garb.gold} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </G>
  );
}

/** One steam curl rising from the cup, its foot at (x, 38). */
function Steam({ x }: { x: number }) {
  return (
    <Path
      d={`M${x} 38 Q${x - 6} 32 ${x} 27 Q${x + 6} 22 ${x + 1} 16`}
      stroke={garb.steel}
      strokeWidth="3.5"
      fill="none"
      strokeLinecap="round"
    />
  );
}

/** One heart-shaped clover leaf, its point at the centre (50, 44), turned by `turn` degrees. */
function CloverLeaf({ turn }: { turn: number }) {
  return (
    <G transform={`rotate(${turn} 50 44)`}>
      <Path
        d="M50 44 C45 39 34 36 35 27 C36 20 45 19 50 25 C55 19 64 20 65 27 C66 36 55 39 50 44 Z"
        fill={garb.greenLight}
        stroke={garb.greenDark}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <Line x1="50" y1="40" x2="50" y2="30" stroke={garb.green} strokeWidth="3" strokeLinecap="round" />
    </G>
  );
}

/** A nail hole punched through the horseshoe. */
function NailHole({ x, y }: { x: number; y: number }) {
  return <Circle cx={x} cy={y} r="2.4" fill={garb.ink} />;
}

export { hasGiftArt } from './giftIds';

/** Every catalogue id has a drawing — checked once at load. */
for (const id of GIFT_IDS) {
  if (!ART[id]) throw new Error(`gift ${id} has no drawing`);
}

/**
 * A gift's drawing — on the emotes' cream disc when `disc` — or null for an id
 * that is not in the catalogue.
 */
export function GiftArt({ id, size, disc = false }: { id: string; size: number; disc?: boolean }) {
  if (!hasGiftArt(id)) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {disc ? <Circle cx="50" cy="50" r="48" fill={garb.cream} stroke={garb.skinLine} strokeWidth="2" /> : null}
      {ART[id]()}
    </Svg>
  );
}
