import type { Action, Card, PublicView, Seat, Suit, TrickPlay } from '@belot/shared-types';
import { SUITS } from '@belot/shared-types';
import { detectDeclarations, isTrump, pointValue, trickWinnerIndex } from '@belot/engine';

/**
 * Bots, expressed as ONE pure decision function over a (hidden-hand-safe)
 * PublicView. The same function drives:
 *   - the offline single-player opponents, and
 *   - the online disconnect-fill / turn-timeout auto-play on the server.
 *
 * MVP tiers are rule-based. A stronger ISMCTS "hard" tier slots in behind the
 * same signature later without touching any caller.
 */

export type BotLevel = 'easy' | 'medium';

type PlayCardAction = Extract<Action, { type: 'PLAY_CARD' }>;
type BidCallAction = Extract<Action, { type: 'BID_CALL' }>;

export function decideAction(view: PublicView, rng: () => number, level: BotLevel = 'medium'): Action {
  const actions = view.legalActions;
  if (actions.length === 0) throw new Error('bot asked to act with no legal actions');
  if (actions.length === 1) return actions[0]!;

  // Answering "ima zvanja?" comes before the difficulty split: a bot never
  // overlooks its zvanja at any level. Staying silent only pays if you can
  // exploit the information you withheld, which a rule-based opponent cannot,
  // and announcing is the only way the points can ever score.
  //
  // The bot MARKS, like everyone else. It works the combination out from its own
  // hand rather than being handed it — which is what hard mode asks of a human,
  // and the only way the engine's marking check can apply to a bot at all.
  const claim = actions.find((a) => a.type === 'DECLARE_ANNOUNCE');
  if (claim) {
    const spotted = detectDeclarations(view.hand, view.seat);
    if (spotted.length === 0) {
      // Nothing there after all — in blind mode the offer is made to every seat
      // precisely so that answering does not reveal whether you hold anything.
      return actions.find((a) => a.type === 'DECLARE_SKIP') ?? claim;
    }
    // Mark the best one; the engine credits the whole holding off a valid mark.
    const best = spotted.reduce((a, b) => (b.value > a.value ? b : a));
    return { type: 'DECLARE_ANNOUNCE', seat: view.seat, cards: best.cards };
  }

  if (level === 'easy') return pick(actions, rng);

  const head = actions[0]!.type;
  if (head === 'BID_PASS' || head === 'BID_CALL') return decideBid(view, actions);
  if (head === 'DOUBLE_KONTRA' || head === 'DOUBLE_REKONTRA' || head === 'DOUBLE_PASS') {
    // conservative: never double in v1
    return actions.find((a) => a.type === 'DOUBLE_PASS') ?? actions[0]!;
  }
  if (head === 'DECLARE_SKIP') return actions[0]!; // nothing to declare
  return decidePlay(
    view,
    preferBela(actions.filter((a): a is PlayCardAction => a.type === 'PLAY_CARD')),
  );
}

/**
 * Collapse the "play it" / "play it and call bela" pairs down to one option each,
 * always keeping the call. Silence only pays if you can exploit the information
 * you withheld, which a rule-based opponent cannot; calling is the only way the
 * 20 can ever score. Collapsing here keeps the card-choice logic below unchanged.
 */
function preferBela(plays: PlayCardAction[]): PlayCardAction[] {
  const byCard = new Map<string, PlayCardAction>();
  for (const p of plays) {
    const key = `${p.card.rank}${p.card.suit}`;
    const kept = byCard.get(key);
    if (!kept || (p.announceBela === true && kept.announceBela !== true)) byCard.set(key, p);
  }
  return [...byCard.values()];
}

// --- bidding -----------------------------------------------------------------

function bidScore(hand: Card[], trump: Suit): number {
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

function decideBid(view: PublicView, actions: Action[]): Action {
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

  // 11, not 9. Measured over paired call-vs-pass forks from the same deal, the
  // 9-10 band was net NEGATIVE — those hands are worth more passed than called,
  // and they were 43% of all voluntary calls. The curve peaks at 11-12.
  if (canPass && bestScore < 11) return { type: 'BID_PASS', seat: view.seat };
  return calls.find((c) => c.suit === bestSuit) ?? calls[0]!;
}

// --- play --------------------------------------------------------------------

function decidePlay(view: PublicView, plays: PlayCardAction[]): Action {
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

function wouldWin(trick: TrickPlay[], card: Card, ctx: PublicView['context']): boolean {
  const cards = trick.map((p) => p.card).concat(card);
  return trickWinnerIndex(cards, ctx) === cards.length - 1;
}

// --- utils -------------------------------------------------------------------

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}
