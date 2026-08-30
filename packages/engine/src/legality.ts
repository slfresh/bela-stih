import type { Card, PlayContext, Seat, TrickPlay } from '@belot/shared-types';
import { isTrump, rankPower } from './power';

/**
 * The legal-play predicate chain — continental Croatian (Slavonian) bela,
 * per hr.wikipedia "Belot", belaklub.com and the UHDDR tournament rulebook:
 *
 *   1. follow the led suit if able — and IBER: you must beat the highest card
 *      of the led suit currently in the trick if you can ("pravilo ibera"),
 *      EXCEPT when the trick has already been cut by a trump (then any card
 *      of the led suit does; you cannot win anyway). When trump is led the
 *      same rule reads: must over-trump if able, else any trump.
 *   2. void in the led suit: you MUST play a trump ("mora se rezati") — even
 *      when your partner currently holds the trick (the partner exemption is
 *      French belote, not bela). If the trick already contains a trump you
 *      must OVER-trump if able; holding only lower trumps you still must
 *      throw one (podrezivanje).
 *   3. holding neither the led suit nor a trump: anything goes.
 *
 * The one house-rule knob kept from the old chain, `forcedOvertrumpOverPartner`,
 * now defaults to TRUE (the native rule). Setting it false restores the
 * French-lineage "partner drži štih" exemption for tables that want it.
 */

export interface LegalityInput {
  hand: Card[];
  trick: TrickPlay[]; // in play order; trick[0] is the leader
  mySeat: Seat;
  ctx: PlayContext;
  forcedOvertrumpOverPartner: boolean;
}

function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export function legalPlays(input: LegalityInput): Card[] {
  const { hand, trick, ctx, mySeat, forcedOvertrumpOverPartner } = input;

  // Leader may play anything.
  if (trick.length === 0) return hand.slice();

  const ledSuit = trick[0]!.card.suit;
  const cardsOfLed = hand.filter((c) => c.suit === ledSuit);
  const trumpLed = isTrump(trick[0]!.card, ctx);

  const trumpsInTrick = trick.filter((p) => isTrump(p.card, ctx));
  const highestTrumpInTrick =
    trumpsInTrick.length > 0
      ? Math.max(...trumpsInTrick.map((p) => rankPower(p.card, ctx)))
      : -Infinity;

  // Partner-exemption support (house rule only; off by default).
  const winnerSeatOfTrick = (): Seat => {
    let best = 0;
    for (let i = 1; i < trick.length; i++) {
      const a = trick[i]!.card;
      const b = trick[best]!.card;
      const aTrump = isTrump(a, ctx);
      const bTrump = isTrump(b, ctx);
      if (aTrump !== bTrump) {
        if (aTrump) best = i;
      } else if (aTrump) {
        if (rankPower(a, ctx) > rankPower(b, ctx)) best = i;
      } else if (a.suit === ledSuit && b.suit === ledSuit) {
        if (rankPower(a, ctx) > rankPower(b, ctx)) best = i;
      } else if (a.suit === ledSuit) best = i;
    }
    return trick[best]!.seat;
  };
  const partnerWinning = winnerSeatOfTrick() === partnerOf(mySeat);

  // --- 1. Must follow led suit if able ---
  if (cardsOfLed.length > 0) {
    if (trumpLed) {
      // Trump led: iber within trump — must over-trump if able.
      if (partnerWinning && !forcedOvertrumpOverPartner) return cardsOfLed;
      const higher = cardsOfLed.filter((c) => rankPower(c, ctx) > highestTrumpInTrick);
      return higher.length > 0 ? higher : cardsOfLed;
    }
    // Plain suit led, and the trick was already cut by a trump: iber is
    // suspended — any card of the led suit ("ne mora poštovati iber ...
    // upravo zato što je igrač prethodno bacio adut").
    if (trumpsInTrick.length > 0) return cardsOfLed;
    // Plain suit led, no cut yet: iber — beat the highest led-suit card if able.
    if (partnerWinning && !forcedOvertrumpOverPartner) return cardsOfLed;
    const highestLed = Math.max(
      ...trick.filter((p) => p.card.suit === ledSuit).map((p) => rankPower(p.card, ctx)),
    );
    const beating = cardsOfLed.filter((c) => rankPower(c, ctx) > highestLed);
    return beating.length > 0 ? beating : cardsOfLed;
  }

  // --- 2. Void in the led suit: must trump ("mora se rezati") ---
  const myTrumps = hand.filter((c) => isTrump(c, ctx));

  if (partnerWinning && !forcedOvertrumpOverPartner) {
    // House-rule exemption (French lineage): free discard over a winning partner.
    return hand.slice();
  }

  if (myTrumps.length > 0) {
    if (trumpsInTrick.length > 0) {
      // Trick already trumped: over-trump if able, else forced undertrump —
      // a trump must be thrown either way.
      const higher = myTrumps.filter((c) => rankPower(c, ctx) > highestTrumpInTrick);
      return higher.length > 0 ? higher : myTrumps;
    }
    // No trump in the trick yet: any trump cuts.
    return myTrumps;
  }

  // --- 3. Neither led suit nor trump: anything goes ---
  return hand.slice();
}
