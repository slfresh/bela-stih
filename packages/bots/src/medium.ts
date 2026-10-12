import type { Action, Card, PublicView, Seat, Suit, TrickPlay } from '@belot/shared-types';
import { SUITS } from '@belot/shared-types';
import { isTrump, pointValue, trickWinnerIndex } from '@belot/engine';

/**
 * The medium bot: the rule-based tier the arena measures every other one
 * against (README, "arena"). It bids by a fixed hand score, never doubles,
 * and plays each trick on its own - no memory of the ones before, no model
 * of partner or opponents. Kept exactly as it was when it became the
 * baseline: every improvement goes into the hard tier and is measured here.
 */

export type PlayCardAction = Extract<Action, { type: 'PLAY_CARD' }>;
export type BidCallAction = Extract<Action, { type: 'BID_CALL' }>;

/**
 * Collapse the "play it" / "play it and call bela" pairs down to one option each,
 * always keeping the call. Silence only pays if you can exploit the information
 * you withheld, which a rule-based opponent cannot; calling is the only way the
 * 20 can ever score. Collapsing here keeps the card-choice logic below unchanged.
 */
export function preferBela(plays: PlayCardAction[]): PlayCardAction[] {
  const byCard = new Map<string, PlayCardAction>();
  for (const p of plays) {
    const key = `${p.card.rank}${p.card.suit}`;
    const kept = byCard.get(key);
    if (!kept || (p.announceBela === true && kept.announceBela !== true)) byCard.set(key, p);
  }
  return [...byCard.values()];
}

// --- bidding -----------------------------------------------------------------

/** A hand's worth with `trump` called: the trumps by their weight, plus an ace outside. */
export function bidScore(hand: readonly Card[], trump: Suit): number {
  let score = 0;
  for (const c of hand) {
    if (c.suit === trump) {
      score += 1;
      if (c.rank === 'J') score += 6;
      else if (c.rank === '9') score += 4;
      else if (c.rank === 'A') score += 3;
      else if (c.rank === '10') score += 2;
    } else if (c.rank === 'A') {
      score += 1;
    }
  }
  return score;
}

/**
 * Call the best suit when the hand is worth at least `threshold`, else pass.
 *
 * 11, not 9. Measured over paired call-vs-pass forks from the same deal, the
 * 9-10 band was net NEGATIVE — those hands are worth more passed than called,
 * and they were 43% of all voluntary calls. The curve peaks at 11-12.
 */
export function decideBid(view: PublicView, actions: Action[], threshold = 11): Action {
  const calls = actions.filter((a): a is BidCallAction => a.type === 'BID_CALL');
  const canPass = actions.some((a) => a.type === 'BID_PASS');

  let bestSuit: Suit = SUITS[0]!;
  let bestScore = -Infinity;
  for (const suit of SUITS) {
    const sc = bidScore(view.hand, suit);
    if (sc > bestScore) {
      bestScore = sc;
      bestSuit = suit;
    }
  }

  if (canPass && bestScore < threshold) return { type: 'BID_PASS', seat: view.seat };
  return calls.find((c) => c.suit === bestSuit) ?? calls[0]!;
}

// --- play --------------------------------------------------------------------

export function decidePlay(view: PublicView, plays: PlayCardAction[]): Action {
  const ctx = view.context;
  const trick = view.currentTrick;
  const lowToHigh = (a: PlayCardAction, b: PlayCardAction) =>
    pointValue(a.card, ctx) - pointValue(b.card, ctx);

  // leading: cash a plain-suit Ace if we have one, else shed the cheapest plain card
  if (trick.length === 0) {
    const aces = plays.filter((p) => p.card.rank === 'A' && !isTrump(p.card, ctx));
    if (aces.length) return aces[0]!;
    const plains = plays.filter((p) => !isTrump(p.card, ctx)).sort(lowToHigh);
    if (plains.length) return plains[0]!;
    return plays.slice().sort(lowToHigh)[0]!;
  }

  const winnerLocal = trickWinnerIndex(
    trick.map((p) => p.card),
    ctx,
  );
  const winnerSeat = trick[winnerLocal]!.seat;
  const partner = ((view.seat + 2) % 4) as Seat;

  // partner already winning -> feed them the most points
  if (winnerSeat === partner) {
    const fat = plays.slice().sort(lowToHigh);
    // ...unless our own card would TAKE the trick off them. Last to play, a
    // forced overtrump makes every legal card a winner, so "feed the partner"
    // degenerated into throwing the master trump away for nothing. The points
    // stay in the family either way; the tempo does not.
    const last = trick.length === 3;
    if (last) {
      const losers = fat.filter((p) => !wouldWin(trick, p.card, ctx));
      if (losers.length) return losers.at(-1)!;
      // Everything wins: take it with the cheapest card that does.
      return fat[0]!;
    }
    return fat.at(-1)!;
  }

  // opponent winning -> take it as cheaply as possible, otherwise shed cheapest
  const winners = plays.filter((p) => wouldWin(trick, p.card, ctx));
  if (winners.length) return winners.slice().sort(lowToHigh)[0]!;
  return plays.slice().sort(lowToHigh)[0]!;
}

/** Would `card`, played now, take the trick as it stands? */
export function wouldWin(trick: readonly TrickPlay[], card: Card, ctx: PublicView['context']): boolean {
  const cards = trick.map((p) => p.card).concat(card);
  return trickWinnerIndex(cards, ctx) === cards.length - 1;
}
