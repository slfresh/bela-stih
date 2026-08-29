import { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import type { Suit } from '@belot/engine';
import { garb } from './palette';

/**
 * The four seasons — the scenes on the aces of a real Tell-pattern deck.
 *
 * Canon (IPCS pattern sheet): srce=Spring (a girl with flowers), bundeva=Summer
 * (a weary reaper with a scythe), list=Autumn (grape pressing at a vat),
 * žir=Winter (two men in fur hats by a campfire).
 *
 * Cards render 46–58 px wide, so every scene is built from chunky silhouettes —
 * a figure is a skirt, a torso, a head and one prop, nothing finer. Each scene
 * draws inside a 0..100 × 0..70 box; CardFace frames and places it.
 */

export function SeasonScene({ suit }: { suit: Suit }) {
  switch (suit) {
    case 'hearts':
      return <Spring />;
    case 'diamonds':
      return <Summer />;
    case 'spades':
      return <Autumn />;
    case 'clubs':
      return <Winter />;
  }
}

/** Spring — a girl holding a bunch of flowers under a blossoming sprig. */
function Spring() {
  return (
    <G>
      {/* meadow */}
      <Rect x="0" y="58" width="100" height="12" fill={garb.green} opacity={0.55} />
      {/* blossom sprig, upper right */}
      <Path d="M70 26 Q82 14 94 12" stroke={garb.brown} strokeWidth="2.2" fill="none" />
      <Circle cx="80" cy="18" r="3.4" fill="#e8a6b8" />
      <Circle cx="88" cy="13" r="3" fill="#e8a6b8" />
      <Circle cx="74" cy="23" r="2.7" fill="#e8a6b8" />
      {/* girl: skirt, bodice, head, hair */}
      <Path d="M30 62 L38 36 H50 L58 62 Z" fill={garb.red} />
      <Rect x="38" y="26" width="12" height="12" rx="2" fill={garb.blue} />
      <Circle cx="44" cy="19" r="7.2" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1" />
      <Path d="M37 16 Q44 9 51 16 L51 21 Q44 15 37 21 Z" fill={garb.brown} />
      {/* arm out to the bouquet */}
      <Path d="M50 30 Q60 28 66 34" stroke={garb.blue} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      {/* bouquet: stems and three blooms */}
      <Line x1="66" y1="34" x2="64" y2="46" stroke={garb.green} strokeWidth="1.8" />
      <Line x1="68" y1="35" x2="70" y2="46" stroke={garb.green} strokeWidth="1.8" />
      <Circle cx="64" cy="31" r="3.6" fill={garb.gold} />
      <Circle cx="70" cy="33" r="3.6" fill={garb.red} />
      <Circle cx="67" cy="27" r="3.3" fill={garb.cream} stroke={garb.skinLine} strokeWidth="0.8" />
      {/* tuft of grass */}
      <Path d="M16 62 q2 -7 4 0 M20 62 q2 -8 4 0" stroke={garb.greenDark} strokeWidth="1.4" fill="none" />
    </G>
  );
}

/** Summer — the weary reaper leaning on his scythe beside the sheaf. */
function Summer() {
  return (
    <G>
      {/* sun */}
      <Circle cx="16" cy="14" r="7" fill={garb.gold} />
      {/* stubble field */}
      <Rect x="0" y="58" width="100" height="12" fill={garb.gold} opacity={0.5} />
      {/* wheat sheaf, right */}
      <Path d="M72 60 L76 36 M78 60 L80 34 M84 60 L84 36 M90 60 L88 38" stroke={garb.goldDark} strokeWidth="2" />
      <Path d="M70 50 H92" stroke={garb.brown} strokeWidth="2.4" />
      {/* reaper: trousers, shirt, head, brimmed hat */}
      <Path d="M34 62 L37 44 H47 L50 62 Z" fill={garb.brown} />
      <Rect x="35" y="30" width="14" height="15" rx="2.5" fill={garb.cream} stroke={garb.skinLine} strokeWidth="0.8" />
      <Circle cx="42" cy="23" r="6.8" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1" />
      <Ellipse cx="42" cy="17.5" rx="10" ry="3" fill={garb.gold} stroke={garb.goldDark} strokeWidth="0.8" />
      <Path d="M37 17 Q42 12 47 17 Z" fill={garb.gold} />
      {/* scythe he leans on: snath + blade */}
      <Line x1="58" y1="18" x2="52" y2="60" stroke={garb.brown} strokeWidth="2.6" />
      <Path d="M58 18 Q72 14 80 22 Q70 20 59 22 Z" fill={garb.steel} stroke={garb.steelDark} strokeWidth="0.8" />
      {/* resting arm to the snath */}
      <Path d="M48 34 Q53 34 55 38" stroke={garb.cream} strokeWidth="4.2" fill="none" strokeLinecap="round" />
    </G>
  );
}

/** Autumn — treading grapes at the vat under the vine. */
function Autumn() {
  return (
    <G>
      {/* vine along the top */}
      <Path d="M6 12 Q30 4 54 12 Q78 20 96 10" stroke={garb.greenDark} strokeWidth="2" fill="none" />
      <Path d="M28 12 q6 -8 12 0 q-6 6 -12 0" fill={garb.green} />
      <Circle cx="70" cy="15" r="3" fill={garb.grape} />
      <Circle cx="75" cy="18" r="3" fill={garb.grape} />
      <Circle cx="72" cy="21" r="3" fill={garb.grape} />
      {/* treader: head + shirt rising from the vat */}
      <Circle cx="50" cy="22" r="6.8" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1" />
      <Path d="M42 40 Q42 28 50 28 Q58 28 58 40 Z" fill={garb.blue} />
      {/* arms braced on the rim */}
      <Path d="M43 32 Q34 36 32 42" stroke={garb.blue} strokeWidth="4.2" fill="none" strokeLinecap="round" />
      <Path d="M57 32 Q66 36 68 42" stroke={garb.blue} strokeWidth="4.2" fill="none" strokeLinecap="round" />
      {/* the vat: staves and hoops */}
      <Path d="M28 40 L32 64 H68 L72 40 Z" fill={garb.brown} />
      <Path d="M28 40 L32 64 H68 L72 40 Z" fill="none" stroke={garb.brownDark} strokeWidth="1.2" />
      <Line x1="30" y1="46" x2="70" y2="46" stroke={garb.brownDark} strokeWidth="1.6" />
      <Line x1="31" y1="57" x2="69" y2="57" stroke={garb.brownDark} strokeWidth="1.6" />
      <Line x1="44" y1="41" x2="45" y2="63" stroke={garb.brownDark} strokeWidth="1" opacity={0.6} />
      <Line x1="56" y1="41" x2="55" y2="63" stroke={garb.brownDark} strokeWidth="1" opacity={0.6} />
    </G>
  );
}

/** Winter — two men in fur hats warming themselves at a campfire. */
function Winter() {
  return (
    <G>
      {/* snow ground */}
      <Rect x="0" y="56" width="100" height="14" fill={garb.snow} />
      {/* bare tree, left */}
      <Path d="M12 58 V30 M12 40 L4 30 M12 36 L20 26 M12 46 L6 42" stroke={garb.brownDark} strokeWidth="2" fill="none" />
      {/* left figure: seated, blue coat, fur hat */}
      <Path d="M26 60 Q26 42 36 42 L38 60 Z" fill={garb.blue} />
      <Circle cx="35" cy="35" r="6" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1" />
      <Path d="M28 33 Q35 25 42 33 L42 36 H28 Z" fill={garb.brown} />
      <Path d="M28 33 Q35 27 42 33" stroke={garb.brownDark} strokeWidth="1.4" fill="none" />
      {/* right figure: seated, red coat, fur hat */}
      <Path d="M74 60 Q74 42 64 42 L62 60 Z" fill={garb.red} />
      <Circle cx="65" cy="35" r="6" fill={garb.skin} stroke={garb.skinLine} strokeWidth="1" />
      <Path d="M58 33 Q65 25 72 33 L72 36 H58 Z" fill={garb.brown} />
      {/* hands reaching to the fire */}
      <Path d="M38 48 Q44 48 46 51" stroke={garb.blue} strokeWidth="3.6" fill="none" strokeLinecap="round" />
      <Path d="M62 48 Q56 48 54 51" stroke={garb.red} strokeWidth="3.6" fill="none" strokeLinecap="round" />
      {/* campfire: logs + flames */}
      <Line x1="42" y1="60" x2="58" y2="56" stroke={garb.brownDark} strokeWidth="2.6" />
      <Line x1="42" y1="56" x2="58" y2="60" stroke={garb.brownDark} strokeWidth="2.6" />
      <Path d="M46 56 Q45 46 50 42 Q49 50 53 46 Q55 52 50 56 Z" fill={garb.flame} />
      <Path d="M48 55 Q48 49 51 47 Q51 52 53 51 Q53 55 50 56 Z" fill={garb.flameBright} />
    </G>
  );
}
