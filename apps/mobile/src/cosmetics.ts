import type { PlayerProfile } from '@belot/progression';
import { shade } from './colour';

/**
 * The player's currently selected cosmetics, as presentation-only module
 * state.
 *
 * Card backs render in places that have no natural path to the profile —
 * flight sprites, deal sprites — so threading the selection through props
 * would touch a dozen call sites for a value that only changes in the shop.
 * `App` calls `setCosmetics` whenever the profile changes; game screens mount
 * after that, so a stale read is impossible in practice and cosmetic-only if
 * it ever happened.
 */

/**
 * A felt cosmetic is a whole room: the baize and its light, the wooden rim
 * and its two edges, and the page behind the table — so choosing walnut
 * recolours every panel and sheet, not just the oval in the middle.
 */
export interface RoomStyle {
  /** The baize itself, and the same baize lit at the centre and shaded at the rim. */
  felt: string;
  feltLight: string;
  feltDeep: string;
  /** The wooden rim, its lit top edge and its shaded underside. */
  rim: string;
  rimLight: string;
  rimDark: string;
  /** The page the table sits on; every screen's ground. */
  page: string;
}

function makeRoom(felt: string, rim: string, page: string): RoomStyle {
  return {
    felt,
    feltLight: shade(felt, 0.08),
    feltDeep: shade(felt, -0.16),
    rim,
    rimLight: shade(rim, 0.22),
    rimDark: shade(rim, -0.38),
    page,
  };
}

export const ROOMS: Record<string, RoomStyle> = {
  green: makeRoom('#123a2b', '#3a2a1d', '#0d2a1f'),
  walnut: makeRoom('#4a331e', '#2c1c0e', '#1c120a'),
  // Midnight keeps a dark-walnut rim: a blue rim on a blue page read as one flat disc.
  midnight: makeRoom('#16283f', '#2c1c0e', '#0b1522'),
};

export function roomStyle(id: string): RoomStyle {
  return ROOMS[id] ?? ROOMS.green!;
}

/** The felt and rim alone, for a swatch. */
export interface FeltStyle {
  felt: string;
  rim: string;
}

export const FELTS: Record<string, FeltStyle> = Object.fromEntries(
  Object.entries(ROOMS).map(([id, r]) => [id, { felt: r.felt, rim: r.rim }]),
);

export function feltStyle(id: string): FeltStyle {
  return FELTS[id] ?? FELTS.green!;
}

/** The card-face styles the player can choose between, free of charge. */
export type DeckStyle = 'madarice' | 'starinske' | 'francuske' | 'simple';

let current = {
  cardBack: 'classic',
  felt: 'green',
  avatar: 'djed',
  deckStyle: 'madarice' as DeckStyle,
};

export function setCosmetics(p: PlayerProfile): void {
  current = {
    ...current,
    cardBack: p.selectedCardBack,
    felt: p.selectedFelt,
    avatar: p.selectedAvatar,
  };
}

/** Face style comes from Settings, not the profile — same module, same rules. */
export function setDeckStyle(style: DeckStyle): void {
  current = { ...current, deckStyle: style };
}

export function cosmetics(): Readonly<typeof current> {
  return current;
}

/** The room the player has chosen, read during render like the rest of the cosmetics. */
export function room(): RoomStyle {
  return roomStyle(current.felt);
}
