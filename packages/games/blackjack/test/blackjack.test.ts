import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Session, canonical, findLeaks, makeRng, type BotLevel } from '@belot/game-core';
import type { Card52 } from '@belot/cards';
import { BLACKJACK, basicStrategy, handValue, type BlackjackAction, type BlackjackState } from '@belot/games-blackjack';

/**
 * Blackjack, pinned: the arithmetic, the strategy, the deal and the dealer
 * by the house rules, every payout, chips conserved after every move, the
 * face-down card hidden until it is turned, and what basic strategy is worth.
 */

let n = 0;
const C = (rank: Card52['rank'], suit: Card52['suit'] = 'spades'): Card52 => ({ id: `${rank}${suit[0]}.${n++}`, rank, suit });

/** A table whose shoe deals `cards` in this order (the shoe is dealt from its end). */
function rigged(seats: number, cards: Card52[], config: Partial<BlackjackState['config']> = {}): BlackjackState {
  const s = BLACKJACK.createMatch({ seats, seed: 1, config });
  const filler = Array.from({ length: 80 }, () => C('5'));
  return BLACKJACK.startRound({ ...s, shoe: [...filler, ...cards.slice().reverse()] });
}
const act = (s: BlackjackState, a: BlackjackAction) => BLACKJACK.apply(s, a);
function betAll(s: BlackjackState, amount = 100): BlackjackState {
  for (let seat = 0; seat < s.seats; seat++) {
    s = act(s, { type: 'BET', seat, amount });
    s = act(s, { type: 'READY', seat });
  }
  return s;
}

describe('hand arithmetic', () => {
  it('aces count 11 until they would bust, then 1', () => {
    expect(handValue([C('A'), C('K')])).toEqual({ total: 21, soft: true });
    expect(handValue([C('A'), C('A'), C('9')])).toEqual({ total: 21, soft: true });
    expect(handValue([C('A'), C('6'), C('9')])).toEqual({ total: 16, soft: false });
    expect(handValue([C('K'), C('Q'), C('5')]).total).toBe(25);
  });
});

describe('basic strategy', () => {
  it('reads the chart', () => {
    expect(basicStrategy([C('T'), C('6')], 10)).toBe('H');
    expect(basicStrategy([C('T'), C('6')], 6)).toBe('S');
    expect(basicStrategy([C('T'), C('2')], 4)).toBe('S');
    expect(basicStrategy([C('T'), C('2')], 3)).toBe('H');
    expect(basicStrategy([C('6'), C('5')], 11)).toBe('D');
    expect(basicStrategy([C('A'), C('7')], 9)).toBe('H');
    expect(basicStrategy([C('A'), C('7')], 7)).toBe('S');
    expect(basicStrategy([C('A'), C('7')], 4)).toBe('Ds');
    expect(basicStrategy([C('8'), C('8')], 11)).toBe('P');
    expect(basicStrategy([C('8'), C('8')], 6, false)).toBe('S');
    expect(basicStrategy([C('T'), C('T')], 6)).toBe('S');
    expect(basicStrategy([C('9'), C('9')], 7)).toBe('S');
  });
});

describe('a round', () => {
  it('a blackjack pays 3:2 at once', () => {
    // Seat 0: A, K. Dealer: 9 up, 7 down.
    let s = rigged(1, [C('A'), C('9'), C('K'), C('7')]);
    s = betAll(s, 100);
    expect(s.phase).toBe('ROUND_OVER');
    expect(s.stacks[0]).toBe(1000 + 150);
    expect(s.hands[0]![0]!.result).toBe('blackjack');
  });

  it('a dealer blackjack under an ace ends the round before anyone plays', () => {
    let s = rigged(2, [C('T'), C('9'), C('A'), C('7'), C('8'), C('K')]);
    s = betAll(s, 100);
    expect(s.phase).toBe('ROUND_OVER');
    expect(s.stacks).toEqual([900, 900]);
  });

  it('the dealer stands on soft 17, or hits it when the table says so', () => {
    // Seat 0: T, 8 (18). Dealer: A up, 6 down (soft 17), then a 3 waiting.
    const cards = () => [C('T'), C('A'), C('8'), C('6'), C('3')];
    let s17 = betAll(rigged(1, cards()));
    s17 = act(s17, { type: 'STAND', seat: 0 });
    expect(handValue(s17.dealer).total).toBe(17);
    expect(s17.hands[0]![0]!.result).toBe('win');
    let h17 = betAll(rigged(1, cards(), { dealerHitsSoft17: true }));
    h17 = act(h17, { type: 'STAND', seat: 0 });
    expect(handValue(h17.dealer).total).toBe(20);
    expect(h17.hands[0]![0]!.result).toBe('lose');
  });

  it('double takes one card for twice the bet; a bust loses at once', () => {
    // Seat 0: 6, 5 → doubles into a T (21). Dealer: T up, 7 down.
    let s = betAll(rigged(1, [C('6'), C('T'), C('5'), C('7'), C('T')]));
    expect(BLACKJACK.legalActions(s, 0).map((a) => a.type)).toContain('DOUBLE');
    s = act(s, { type: 'DOUBLE', seat: 0 });
    expect(s.phase).toBe('ROUND_OVER');
    expect(s.stacks[0]).toBe(1000 + 200);
    // Seat 0: T, 6 hits a K: bust.
    let b = betAll(rigged(1, [C('T'), C('9'), C('6'), C('7'), C('K')]));
    b = act(b, { type: 'HIT', seat: 0 });
    expect(b.hands[0]![0]!.result).toBe('lose');
    expect(b.stacks[0]).toBe(900);
  });

  it('a split makes two hands of the same bet; split aces take one card each', () => {
    let s = betAll(rigged(1, [C('8'), C('T'), C('8', 'hearts'), C('7'), C('3'), C('T')]));
    expect(BLACKJACK.legalActions(s, 0).map((a) => a.type)).toContain('SPLIT');
    s = act(s, { type: 'SPLIT', seat: 0 });
    expect(s.hands[0]!.length).toBe(2);
    expect(s.stacks[0]).toBe(800);
    expect(s.turn).toEqual({ seat: 0, hand: 0 });
    // Dealer 9 + 8: stands on 17.
    let a = betAll(rigged(1, [C('A'), C('9'), C('A', 'hearts'), C('8'), C('K'), C('Q')]));
    a = act(a, { type: 'SPLIT', seat: 0 });
    expect(a.phase).toBe('ROUND_OVER');
    // Two 21s from split aces are wins, not blackjacks.
    expect(a.hands[0]!.map((h) => h.result)).toEqual(['win', 'win']);
    expect(a.stacks[0]).toBe(1000 + 200);
  });

  it('refuses a bet under the minimum standing, and a move out of turn', () => {
    let s = rigged(2, [C('T'), C('9'), C('6'), C('7'), C('8'), C('K')], { minBet: 25 });
    s = act(s, { type: 'BET', seat: 0, amount: 10 });
    expect(() => act(s, { type: 'READY', seat: 0 })).toThrow(/minimum bet/);
    expect(BLACKJACK.normalize(s, 0, { type: 'HIT', seat: 0 })).toBeNull();
    expect(BLACKJACK.normalize(s, 0, { type: 'BET', seat: 0, amount: 25, extra: 1 })).toEqual({ type: 'BET', seat: 0, amount: 25 });
    expect(BLACKJACK.normalize(s, 0, { type: 'BET', seat: 0, amount: '25' })).toBeNull();
  });
});

function chips(s: BlackjackState): number {
  return (
    s.stacks.reduce((a, b) => a + b, 0) +
    s.bets.reduce((a, b) => a + b, 0) +
    s.hands.reduce((a, hs) => a + hs.reduce((x, h) => x + (h.result === null ? h.bet : 0), 0), 0) +
    s.house
  );
}

describe('a blackjack table', () => {
  it('conserves every chip and hides the face-down card, over random play', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const seats = 1 + (seed % 5);
      const all = Array.from({ length: seats }, (_, i) => i);
      const session = new Session(BLACKJACK, { seats, seed, humanSeats: all, config: { rounds: 25 } });
      const pick = makeRng(seed * 13);
      let guard = 0;
      while (!session.matchOver() && guard++ < 20_000) {
        if (session.roundOver()) session.startNextRound();
        else {
          const actors = session.actors();
          const seat = actors[Math.floor(pick() * actors.length)]!;
          const legal = session.legal(seat);
          const bets = legal.filter((a) => a.type === 'BET');
          const a = bets.length > 0 && session.state.bets[seat] === 0 ? bets[Math.floor(pick() * bets.length)]! : legal[Math.floor(pick() * legal.length)]!;
          session.submit(a);
        }
        if (chips(session.state) !== seats * 1000) throw new Error(`chips not conserved at seed ${seed}`);
        const leaks = findLeaks(BLACKJACK, session.state, seats);
        if (leaks.length > 0) throw new Error(leaks[0]);
      }
      expect(session.matchOver()).toBe(true);
    }
  });

  it('basic strategy loses far less than the easy bot', () => {
    // One table, two seats betting the same flat 10, many rounds: return per unit staked.
    let s = BLACKJACK.createMatch({ seats: 2, seed: 7, config: { rounds: 1_000_000, startingStack: 10_000_000 } });
    const rng = makeRng(3);
    const staked = [0, 0];
    const start = s.stacks.slice();
    for (let round = 0; round < 30_000; round++) {
      s = BLACKJACK.startRound(s);
      for (const seat of [0, 1]) {
        s = BLACKJACK.apply(s, { type: 'BET', seat, amount: 10 });
        s = BLACKJACK.apply(s, { type: 'READY', seat });
      }
      while (s.phase === 'PLAYING') {
        const seat = BLACKJACK.actors(s)[0]!;
        s = BLACKJACK.apply(s, BLACKJACK.bot.decide(BLACKJACK.view(s, seat), rng, seat === 0 ? 'easy' : 'medium'));
      }
      for (const seat of [0, 1]) staked[seat] += s.hands[seat]!.reduce((a, h) => a + h.bet, 0);
    }
    const ret = [0, 1].map((seat) => (s.stacks[seat]! - start[seat]!) / staked[seat]!);
    // Basic strategy under these rules gives the house about half a percent; hitting to 15 gives it several.
    expect(ret[1]!).toBeGreaterThan(-0.025);
    expect(ret[1]!).toBeGreaterThan(ret[0]! + 0.01);
  });

  it('bots at every level play legally to the end of a match', () => {
    for (const level of ['easy', 'medium', 'hard'] as BotLevel[]) {
      const session = new Session(BLACKJACK, { seats: 4, seed: 23, botLevel: level });
      session.playWholeMatch();
      expect(session.matchOver()).toBe(true);
    }
  });

  it('the window clock: out of time means no bet; at the table it means stand', () => {
    const session = new Session(BLACKJACK, { seats: 2, seed: 4, humanSeats: [0, 1] });
    session.submit({ type: 'BET', seat: 0, amount: 25 });
    session.closeWindow();
    expect(session.state.phase === 'PLAYING' || session.roundOver()).toBe(true);
    if (session.state.phase === 'PLAYING') {
      session.closeWindow();
      expect(session.roundOver()).toBe(true);
    }
    expect(session.state.hands[1]!.length).toBe(0); // seat 1 never bet
  });
});

describe('the blackjack golden corpus', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const FILE = join(here, 'golden.json');
  const record = (seats: number, seed: number) => {
    const all = Array.from({ length: seats }, (_, i) => i);
    const session = new Session(BLACKJACK, { seats, seed, humanSeats: all, config: { rounds: 12 } });
    const pick = makeRng(seed + 5);
    const hashes: string[] = [];
    let steps: unknown[] = [session.drainEvents()];
    while (true) {
      if (session.roundOver() || session.matchOver()) {
        hashes.push(createHash('sha256').update(canonical([steps, all.map((s) => session.view(s))])).digest('hex').slice(0, 16));
        steps = [];
        if (session.matchOver()) break;
        session.startNextRound();
        steps.push(session.drainEvents());
        continue;
      }
      const seat = session.actors()[0]!;
      const legal = session.legal(seat);
      const bets = legal.filter((a) => a.type === 'BET');
      const a = bets.length > 0 && session.state.bets[seat] === 0 ? bets[0]! : legal[Math.floor(pick() * legal.length)]!;
      session.submit(a);
      steps.push([a, session.drainEvents()]);
    }
    return hashes;
  };
  it('replays round for round', () => {
    const now = { one: record(1, 1), three: record(3, 2), five: record(5, 3) };
    if (process.env.GOLDEN_UPDATE === '1' || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
    const was = JSON.parse(readFileSync(FILE, 'utf8')) as typeof now;
    for (const k of Object.keys(now) as (keyof typeof now)[]) {
      const first = now[k].findIndex((h, i) => h !== was[k][i]);
      expect(first, `${k}: round ${first + 1} changed`).toBe(-1);
      expect(now[k].length).toBe(was[k].length);
    }
  });
});
