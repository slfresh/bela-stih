import type { Card, PlayContext, Seat, TrickPlay } from '@belot/shared-types';
import { isTrump, rankPower } from './power';
import { trickWinnerIndex } from './compare';

/**
 * The legal-play predicate chain — the heart of "fair" Belot. Ordered:
 *   1. follow suit (always mandatory if able)
 *      1a. if TRUMP was led: must over-trump ("rise") if able, unless partner already winning
 *   2. cannot follow:
 *      2a. partner already winning  -> free discard           (config: forcedOvertrumpOverPartner)
 *      2b. opponent winning with a trump -> must over-trump; else discard non-trump;
 *          else (only trumps left) forced undertrump
 *      2c. opponent winning with non-trump -> must cut (any trump); else discard anything
 *
 * Implemented for SUIT contracts (the only v1 contract). ALL_TRUMPS / NO_TRUMPS
 * reuse the same follow-suit path but their over-trump-within-suit nuance is
 * Phase 4 and intentionally not wired here.
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

  // Current winner so far.
  const winnerLocal = trickWinnerIndex(
    trick.map((p) => p.card),
    ctx,
  );
  const winnerSeat = trick[winnerLocal]!.seat;
  const partnerWinning = winnerSeat === partnerOf(mySeat);

  const trumpsInTrick = trick.filter((p) => isTrump(p.card, ctx));
  const highestTrumpInTrick =
    trumpsInTrick.length > 0
      ? Math.max(...trumpsInTrick.map((p) => rankPower(p.card, ctx)))
      : -Infinity;

  // --- 1. Must follow led suit if able ---
  if (cardsOfLed.length > 0) {
    if (trumpLed) {
      // Trump was led: must rise (over-trump) if able, unless partner is winning
      // and we are not forcing over-partner play.
      if (partnerWinning && !forcedOvertrumpOverPartner) return cardsOfLed;
      const higher = cardsOfLed.filter((c) => rankPower(c, ctx) > highestTrumpInTrick);
      return higher.length > 0 ? higher : cardsOfLed;
    }
    // Non-trump led: just follow suit (no rise obligation within a plain suit).
    return cardsOfLed;
  }

  // --- 2. Cannot follow suit ---
  const myTrumps = hand.filter((c) => isTrump(c, ctx));

  // 2a. partner winning -> free discard (the ex-Yu default)
  if (partnerWinning && !forcedOvertrumpOverPartner) {
    return hand.slice();
  }

  // opponent winning (or we are forced to act over a winning partner)
  if (trumpsInTrick.length > 0) {
    // 2b. a trump is currently winning -> must over-trump if possible
    const higher = myTrumps.filter((c) => rankPower(c, ctx) > highestTrumpInTrick);
    if (higher.length > 0) return higher;
    // can't over-trump: discard a non-trump if we have one (no forced undertrump)
    if (myTrumps.length < hand.length) return hand.filter((c) => !isTrump(c, ctx));
    // only trumps left -> forced undertrump
    return myTrumps;
  }

  // 2c. opponent winning with a non-trump, no trump played yet -> must cut if able
  if (myTrumps.length > 0) return myTrumps;
  return hand.slice();
}
