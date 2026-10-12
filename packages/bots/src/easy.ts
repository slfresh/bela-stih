import type { Action, PublicView } from '@belot/shared-types';
import { isTrump, pointValue, rankPower, trickWinnerIndex } from '@belot/engine';
import { decideBid, preferBela, wouldWin, type PlayCardAction } from './medium';

/**
 * The easy bot: a beginner, not a coin. It used to pick any legal action at
 * random, and offline the player's PARTNER is a bot of the chosen level: a
 * random partner leads aces into nothing and calls trump on a seven, which
 * reads as a broken game rather than an easy one. A beginner calls only on
 * a clearly good hand, leads whatever is worth most, follows with the least
 * it can, and takes a trick with the biggest card it has - the mistakes a
 * first evening of bela is made of, every one of them exploitable.
 */
export function decideEasy(view: PublicView, actions: Action[]): Action {
  const head = actions[0]!.type;
  if (head === 'BID_PASS' || head === 'BID_CALL') return decideBid(view, actions, 13);
  if (head === 'DOUBLE_KONTRA' || head === 'DOUBLE_REKONTRA' || head === 'DOUBLE_PASS') {
    return actions.find((a) => a.type === 'DOUBLE_PASS') ?? actions[0]!;
  }
  if (head === 'DECLARE_SKIP') return actions[0]!;

  const ctx = view.context;
  const plays = preferBela(actions.filter((a): a is PlayCardAction => a.type === 'PLAY_CARD'));
  const trick = view.currentTrick;
  const points = (p: PlayCardAction) => pointValue(p.card, ctx);
  const power = (p: PlayCardAction) => rankPower(p.card, ctx);
  const byCheap = (a: PlayCardAction, b: PlayCardAction) => points(a) - points(b) || power(a) - power(b);

  // Leading: the fattest card, trumps last (a beginner hoards them).
  if (trick.length === 0) {
    const plains = plays.filter((p) => !isTrump(p.card, ctx));
    const pool = plains.length ? plains : plays;
    return pool.slice().sort((a, b) => byCheap(b, a))[0]!;
  }
  // Following: take it with the biggest card that does, even over a partner; else the least.
  const winnerSeat = trick[trickWinnerIndex(trick.map((p) => p.card), ctx)]!.seat;
  const partner = (view.seat + 2) % 4;
  const winners = plays.filter((p) => wouldWin(trick, p.card, ctx));
  if (winners.length && winnerSeat !== partner) return winners.slice().sort((a, b) => power(b) - power(a))[0]!;
  const losers = plays.filter((p) => !wouldWin(trick, p.card, ctx));
  return (losers.length ? losers : plays).slice().sort(byCheap)[0]!;
}
