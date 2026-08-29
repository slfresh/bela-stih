import type { Card, PlayContext, Suit } from '@belot/shared-types';
import { isTrump, rankPower } from './power';

/**
 * Trick resolution. Uses ONLY the trick-winning power (never the natural /
 * sequence order). A trump always beats a non-trump; among same-category cards
 * only those of the led suit (or trumps) can win.
 */

/**
 * Does `challenger` beat `current` as the trick stands, given the led suit?
 * `current` is assumed to be the best card so far.
 */
export function beats(challenger: Card, current: Card, ledSuit: Suit, ctx: PlayContext): boolean {
  const cT = isTrump(challenger, ctx);
  const curT = isTrump(current, ctx);

  if (cT && !curT) return true;
  if (!cT && curT) return false;
  if (cT && curT) return rankPower(challenger, ctx) > rankPower(current, ctx);

  // both non-trump: only a card of the led suit can be in contention
  const cFollows = challenger.suit === ledSuit;
  const curFollows = current.suit === ledSuit;
  if (cFollows && !curFollows) return true;
  if (!cFollows && curFollows) return false;
  if (!cFollows && !curFollows) return false; // neither relevant: keep the earlier card
  return rankPower(challenger, ctx) > rankPower(current, ctx);
}

/** Index (into `plays`, where plays[0] is the leader) of the winning card. */
export function trickWinnerIndex(plays: Card[], ctx: PlayContext): number {
  if (plays.length === 0) throw new Error('empty trick');
  const ledSuit = plays[0]!.suit;
  let best = 0;
  for (let i = 1; i < plays.length; i++) {
    if (beats(plays[i]!, plays[best]!, ledSuit, ctx)) best = i;
  }
  return best;
}
