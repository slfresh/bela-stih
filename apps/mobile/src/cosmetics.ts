import type { PlayerProfile } from '@belot/progression';

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

export interface FeltStyle {
  /** The baize itself. */
  felt: string;
  /** The wooden rim around it. */
  rim: string;
}

export const FELTS: Record<string, FeltStyle> = {
  green: { felt: '#123a2b', rim: '#3a2a1d' },
  walnut: { felt: '#4a331e', rim: '#2c1c0e' },
  midnight: { felt: '#16283f', rim: '#20303f' },
};

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
