import { GIFT_IDS, type GiftId } from '@belot/progression';

/** The gifts that have a drawing (src/giftArt.tsx) — all of them. */
export const GIFT_ART_IDS: readonly GiftId[] = GIFT_IDS;

export function hasGiftArt(id: string): id is GiftId {
  return (GIFT_ART_IDS as readonly string[]).includes(id);
}
