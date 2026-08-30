import type { Action, Card, PublicView, Seat, Suit, TrickPlay } from '@belot/shared-types';
import { SUITS } from '@belot/shared-types';
import { isTrump, pointValue, trickWinnerIndex } from '@belot/engine';

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

  // Blind (hard) mode offers a voluntary claim ALONGSIDE the cards. A bot never
  // overlooks its zvanja — it claims first, at every level, then plays.
  const blindClaim = actions.find((a) => a.type === 'DECLARE_ANNOUNCE');
  if (blindClaim && actions.some((a) => a.type === 'PLAY_CARD')) return blindClaim;

  if (level === 'easy') return pick(actions, rng);

  const head = actions[0]!.type;
  if (head === 'BID_PASS' || head === 'BID_CALL') return decideBid(view, actions);
  if (head === 'DOUBLE_KONTRA' || head === 'DOUBLE_REKONTRA' || head === 'DOUBLE_PASS') {
    // conservative: never double in v1
    return actions.find((a) => a.type === 'DOUBLE_PASS') ?? actions[0]!;
  }
  if (head === 'DECLARE_ANNOUNCE' || head === 'DECLARE_SKIP') {
    // Always speak up. Staying silent only pays if you can exploit the
    // information you withheld, which a rule-based opponent cannot; announcing
    // is the only way the points can ever score.
    return actions.find((a) => a.type === 'DECLARE_ANNOUNCE') ?? actions[0]!;
  }
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

  if (canPass && bestScore < 9) return { type: 'BID_PASS', seat: view.seat };
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
    return plays.slice().sort(lowToHigh).at(-1)!;
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
