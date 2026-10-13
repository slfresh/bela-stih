import type { Card, PublicView, Seat, TrickPlay } from '@belot/shared-types';
import { DEFAULT_CONFIG } from '@belot/shared-types';
import { legalPlays, pointValue, teamOf, trickWinnerIndex } from '@belot/engine';
import { decidePlay, type PlayCardAction } from './medium';

/**
 * A look ahead for the hard bot: the rest of the deal played out, many
 * times, from hands dealt at random to the other three out of the cards
 * still unseen - never breaking what the deal has shown (a seat known void
 * in a suit gets none of it, one that followed low gets nothing higher).
 * Each candidate card is scored by the mean of what the deal then settles
 * at, contract and all: a caller that falls short loses everything, so a
 * card that costs the contract is seen for what it costs.
 *
 * The play-out uses the bots' own cheap trick logic on plain arrays, not
 * the engine's applyAction (which copies the whole state each step): a
 * full deal costs well under a millisecond, and a decision a few.
 */

type Ctx = PublicView['context'];

/** What is known of the other hands, from hard.ts's reading of the deal. */
export interface Constraints {
  /** Cards the other three hold between them. */
  unseen: readonly Card[];
  /** mayHold(seat, card): nothing seen so far rules this card out of that hand. */
  mayHold: (seat: Seat, card: Card) => boolean;
}

/** How many deals are played out per candidate - fewer when there are many, so a decision stays a few milliseconds. */
export const ROLLOUTS = 16;
export const ROLLOUT_BUDGET = 64;
export function rolloutsFor(candidates: number): number {
  return Math.max(6, Math.min(ROLLOUTS, Math.floor(ROLLOUT_BUDGET / candidates)));
}

/** Deal the unseen cards to the other three seats, honouring the counts and the constraints. */
export function sampleHands(view: PublicView, k: Constraints, rng: () => number): Card[][] {
  const me = view.seat;
  const hands: Card[][] = [[], [], [], []];
  hands[me] = view.hand.slice();
  const pool = k.unseen.slice();
  // Fisher-Yates on the pool, then each card to a seat that may hold it and still needs one.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const others = [0, 1, 2, 3].filter((s) => s !== me) as Seat[];
  // The most constrained cards first, so a card only one seat may take is not left for the wrong one.
  const room = (c: Card) => others.filter((s) => k.mayHold(s, c)).length;
  pool.sort((a, b) => room(a) - room(b));
  for (const c of pool) {
    const open = others.filter((s) => hands[s]!.length < view.handCounts[s]);
    const fit = open.filter((s) => k.mayHold(s, c));
    const choice = fit.length ? fit : open;
    if (choice.length === 0) break;
    hands[choice[Math.floor(rng() * choice.length)]!]!.push(c);
  }
  return hands;
}

/** The deal's points so far, by team: tricks taken, declarations shown, bela called. */
export function pointsSoFar(view: PublicView): [number, number] {
  const pts: [number, number] = [0, 0];
  const p = view.dealProgress;
  if (p) {
    pts[0] += p.cardPoints[0] + p.declarationPoints[0];
    pts[1] += p.cardPoints[1] + p.declarationPoints[1];
  } else {
    for (const d of view.revealedDeclarations) pts[teamOf(d.seat)] += d.value;
  }
  if (view.belaAnnouncedBy !== null) pts[teamOf(view.belaAnnouncedBy)] += 20;
  return pts;
}

/**
 * Play the deal out from here with `first` as my card, every seat playing
 * medium's way, and settle it: my team's points minus theirs.
 */
export function playOut(view: PublicView, hands: Card[][], first: Card, rng: () => number): number {
  const ctx = view.context;
  const me = view.seat;
  const mine = teamOf(me);
  const pts: [number, number] = pointsSoFar(view);
  const tricksWon: [number, number] = view.dealProgress ? [...view.dealProgress.tricksWon] : [0, 0];
  const hand = hands.map((h) => h.slice());
  let trick: TrickPlay[] = view.currentTrick.slice();
  let turn: Seat = me;
  let card: Card | null = first;
  let left = hand.reduce((n, h) => n + h.length, 0);
  void rng;

  while (left > 0) {
    const seat = turn;
    if (card === null) {
      const legal = legalPlays({ hand: hand[seat]!, trick, mySeat: seat, ctx, forcedOvertrumpOverPartner: true });
      if (legal.length === 1) card = legal[0]!;
      else {
        const plays: PlayCardAction[] = legal.map((c) => ({ type: 'PLAY_CARD', seat, card: c }));
        card = (decidePlay({ seat, context: ctx, currentTrick: trick } as PublicView, plays) as PlayCardAction).card;
      }
    }
    const h = hand[seat]!;
    const at = h.findIndex((c) => c.suit === card!.suit && c.rank === card!.rank);
    if (at < 0) throw new Error('rollout played a card not in hand');
    h.splice(at, 1);
    left--;
    trick.push({ seat, card });
    card = null;
    if (trick.length === 4) {
      const winner = trick[trickWinnerIndex(trick.map((p) => p.card), ctx)]!.seat;
      const team = teamOf(winner);
      pts[team] += trick.reduce((n, p) => n + pointValue(p.card, ctx), 0);
      tricksWon[team] += 1;
      if (left === 0) pts[team] += DEFAULT_CONFIG.lastTrickBonus;
      trick = [];
      turn = winner;
    } else {
      turn = ((seat + 1) % 4) as Seat;
    }
  }
  for (const t of [0, 1] as const) if (tricksWon[t] === 8) pts[t] += DEFAULT_CONFIG.valatBonus;

  // The contract: the caller must be strictly ahead, or the table goes to the defenders.
  const caller = view.callerSeat !== null ? teamOf(view.callerSeat) : null;
  if (caller !== null && pts[caller] <= pts[1 - caller]) {
    const all = pts[0] + pts[1];
    pts[caller] = 0;
    pts[1 - caller] = all;
  }
  return pts[mine] - pts[1 - mine];
}

/** The candidate with the best mean settlement over ROLLOUTS deals; ties keep the earlier (preferred) one. */
export function bestByRollout(
  view: PublicView,
  k: Constraints,
  candidates: readonly PlayCardAction[],
  rng: () => number,
  /** Points added to each candidate's mean: what the play-outs cannot see (the bela 20, the partner's conventions). */
  bonus?: readonly number[],
): PlayCardAction {
  if (candidates.length < 2) return candidates[0]!;
  const n = rolloutsFor(candidates.length);
  const totals = candidates.map((_, c) => (bonus?.[c] ?? 0) * n);
  for (let i = 0; i < n; i++) {
    const hands = sampleHands(view, k, rng);
    for (let c = 0; c < candidates.length; c++) totals[c] += playOut(view, hands, candidates[c]!.card, rng);
  }
  let best = 0;
  for (let c = 1; c < candidates.length; c++) if (totals[c]! > totals[best]!) best = c;
  return candidates[best]!;
}
