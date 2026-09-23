import { decideAction } from '@belot/bots';
import { isTrump, pointValue, teamOf, trickWinnerIndex, type Action, type Card, type PublicView, type Seat, type Suit } from '@belot/engine';

/**
 * The coach of Učenje: what to do now, and why, in the words a player at the
 * table would use. The advice itself is the bots' own choice for this seat's
 * view (the same hidden-hand-safe decision the offline opponents make); the
 * reason is read from the trick and the hand. Pure, so it is tested without a
 * screen.
 */

export type PlayWhy =
  /** Leading a trump: pulls the others' trumps out. */
  | 'leadTrump'
  /** Leading an ace of a plain suit: likely to take the trick. */
  | 'leadAce'
  /** Leading a plain card worth nothing, keeping the strong ones for later. */
  | 'leadLow'
  /** Any other lead: said, without a reason that would not be true. */
  | 'lead'
  /** This card takes the trick, as it stands. */
  | 'win'
  /** The trick is my pair's, and this card puts points on it. */
  | 'givePoints'
  /** The partner holds the trick, and this card is worth nothing: none wasted. */
  | 'duck'
  /** No card of the led suit: a trump is a must. */
  | 'mustTrump'
  /** The trick cannot be won: a card worth nothing goes. */
  | 'discard'
  /** The rules leave one card. */
  | 'only'
  /** Any other play: said, without a reason that would not be true. */
  | 'play';

export type CoachTip =
  | { kind: 'call'; suit: Suit; forced: boolean; count: number; jack: boolean; nine: boolean }
  | { kind: 'pass' }
  | { kind: 'play'; card: Card; why: PlayWhy; bela: boolean };

/** Who could make štiglja (all eight tricks, +90) as things stand; null when nobody can yet. */
export type StigljaWatch = 'us' | 'them' | null;

/** The advice holds still between renders: the same view gives the same card. */
const steady = () => 0.5;

export function coachTip(view: PublicView, mySeat: Seat, options: readonly Action[]): CoachTip | null {
  if (options.length === 0) return null;
  const head = options[0]!.type;
  const bidding = head === 'BID_CALL' || head === 'BID_PASS';
  const playing = options.some((a) => a.type === 'PLAY_CARD');
  // The zvanja question and doubling have their own prompts.
  if (!bidding && !playing) return null;
  let pick: Action;
  try {
    pick = decideAction({ ...view, legalActions: [...options] }, steady, 'medium');
  } catch {
    return null;
  }

  if (pick.type === 'BID_CALL') {
    const suit = pick.suit;
    const mine = view.hand.filter((c) => c.suit === suit);
    return {
      kind: 'call',
      suit,
      // Everyone passed and it is the dealer's call: muss.
      forced: !options.some((a) => a.type === 'BID_PASS'),
      count: mine.length,
      jack: mine.some((c) => c.rank === 'J'),
      nine: mine.some((c) => c.rank === '9'),
    };
  }
  if (pick.type === 'BID_PASS') return { kind: 'pass' };
  if (pick.type !== 'PLAY_CARD') return null;

  const card = pick.card;
  const ctx = view.context;
  const trick = view.currentTrick;
  const bela = pick.announceBela === true;
  const points = pointValue(card, ctx);
  // One card the rules allow: that is the whole reason - the last lead too,
  // where "keep the strong ones for later" has no later.
  const cards = new Set(options.flatMap((a) => (a.type === 'PLAY_CARD' ? [`${a.card.rank}${a.card.suit}`] : [])));
  if (cards.size === 1) return { kind: 'play', card, why: 'only', bela };
  if (trick.length === 0) {
    const why: PlayWhy = isTrump(card, ctx)
      ? 'leadTrump'
      : card.rank === 'A'
        ? 'leadAce'
        : points === 0
          ? 'leadLow'
          : 'lead';
    return { kind: 'play', card, why, bela };
  }
  const winsNow = trickWinnerIndex([...trick.map((p) => p.card), card], ctx) === trick.length;
  const holder = trick[trickWinnerIndex(trick.map((p) => p.card), ctx)]!.seat;
  const partnerHolds = teamOf(holder) === teamOf(mySeat);
  const led = trick[0]!.card;
  const noneOfLed = !view.hand.some((c) => c.suit === led.suit);
  // The pair's trick: any points on it are given, and only a card worth
  // nothing is "not wasting a strong one" (the bots feed their partner).
  const why: PlayWhy = winsNow
    ? partnerHolds && points > 0
      ? 'givePoints'
      : 'win'
    : partnerHolds
      ? points > 0
        ? 'givePoints'
        : 'duck'
      : noneOfLed && isTrump(card, ctx) && !isTrump(led, ctx)
        ? 'mustTrump'
        : points < 10
          ? 'discard'
          : 'play';
  return { kind: 'play', card, why, bela };
}

/**
 * Štiglja as things stand: from the fourth trick on, one pair holding every
 * trick so far could still take them all - and the other can stop it with one.
 */
export function stigljaWatch(view: PublicView, mySeat: Seat): StigljaWatch {
  const p = view.dealProgress;
  if (!p || p.tricksPlayed < 4 || p.tricksPlayed >= 8) return null;
  const us = teamOf(mySeat);
  if (p.tricksWon[us] === p.tricksPlayed) return 'us';
  if (p.tricksWon[(1 - us) as 0 | 1] === p.tricksPlayed) return 'them';
  return null;
}
