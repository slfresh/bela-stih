import type { Card52 } from '@belot/cards';

/**
 * Punto banco's drawing rules — the tableau. Nobody chooses anything: the
 * cards are dealt and drawn exactly as below, which is why the game is a
 * betting window followed by a deal the engine plays by itself.
 */

/** Ace 1, two to nine face value, ten and the courts 0. */
export function pointOf(c: Card52): number {
  if (c.rank === 'A') return 1;
  if (c.rank === 'T' || c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return 0;
  return Number(c.rank);
}

/** A hand's total: the last digit of the sum. */
export function total(cards: Card52[]): number {
  return cards.reduce((s, c) => s + pointOf(c), 0) % 10;
}

export type Outcome = 'player' | 'banker' | 'tie';

export interface Coup {
  player: Card52[];
  banker: Card52[];
  playerTotal: number;
  bankerTotal: number;
  outcome: Outcome;
  /** Either side was dealt 8 or 9 in its first two cards: nobody draws. */
  natural: boolean;
  /** The order the cards came out, for the table to deal them the same way. */
  order: ('player' | 'banker')[];
}

/** Does the banker draw, given its total and the player's third card (null: the player stood)? */
export function bankerDraws(bankerTotal: number, playerThird: Card52 | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  const t = pointOf(playerThird);
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return t !== 8;
    case 4:
      return t >= 2 && t <= 7;
    case 5:
      return t >= 4 && t <= 7;
    case 6:
      return t === 6 || t === 7;
    default:
      return false;
  }
}

/** Play a coup from the top of the shoe (taken from the END of `shoe`, which is mutated). */
export function playCoup(shoe: Card52[]): Coup {
  const take = () => {
    const c = shoe.pop();
    if (!c) throw new Error('the shoe ran out mid-coup');
    return c;
  };
  const player = [take()];
  const banker = [take()];
  player.push(take());
  banker.push(take());
  const order: ('player' | 'banker')[] = ['player', 'banker', 'player', 'banker'];
  const natural = total(player) >= 8 || total(banker) >= 8;
  if (!natural) {
    let third: Card52 | null = null;
    if (total(player) <= 5) {
      third = take();
      player.push(third);
      order.push('player');
    }
    if (bankerDraws(total(banker), third)) {
      banker.push(take());
      order.push('banker');
    }
  }
  const pt = total(player);
  const bt = total(banker);
  return { player, banker, playerTotal: pt, bankerTotal: bt, outcome: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie', natural, order };
}
