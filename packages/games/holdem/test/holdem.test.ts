import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Session, canonical, findLeaks, makeRng, type BotLevel } from '@belot/game-core';
import { makeDeck52, type Card52 } from '@belot/cards';
import {
  HOLDEM,
  bestFive,
  buildPots,
  categoryOf,
  chipsInPlay,
  evaluate,
  type HoldemAction,
  type HoldemState,
  type Player,
} from '@belot/games-holdem';

/**
 * Hold'em, pinned: the evaluator against every five-card hand there is, the
 * betting rules a home game gets wrong, side pots, chips conserved and hole
 * cards hidden after every move, bots, and a golden corpus.
 */

const deck = makeDeck52();
const H = (ids: string): Card52[] => ids.split(' ').map((id) => deck.find((c) => c.id === id)!);

describe('the evaluator', () => {
  it('ranks the categories and their kickers', () => {
    const order = [
      'As Kd 9h 7c 3s 2d 4h', // high card
      '9s 9d Kh 7c 3s 2d 4h', // pair
      '9s 9d 7h 7c 3s 2d 4h', // two pair
      '9s 9d 9h 7c 3s 2d Kh', // trips
      'As 2d 3h 4c 5s 9d Kh', // wheel
      '6s 2d 3h 4c 5s 9d Kh', // six-high straight
      'Ts Jd Qh Kc As 2d 3h', // broadway
      '2h 7h 9h Jh Kh As 3d', // flush
      '9s 9d 9h 7c 7s 2d Kh', // full house
      '9s 9d 9h 9c 3s 2d Kh', // quads
      '5h 6h 7h 8h 9h 2d Ks', // straight flush
    ];
    const scores = order.map((h) => evaluate(H(h)));
    for (let i = 1; i < scores.length; i++) expect(scores[i]!, order[i]).toBeGreaterThan(scores[i - 1]!);
    expect(categoryOf(scores[4]!)).toBe('straight');
    expect(categoryOf(scores[10]!)).toBe('straightFlush');
    // Kickers decide; the board can play for both.
    expect(evaluate(H('As Ad Kh 7c 3s 2d 4h'))).toBeGreaterThan(evaluate(H('As Ad Qh 7c 3s 2d 4h')));
    expect(evaluate(H('2c 3c Ts Js Qs Ks As'))).toBe(evaluate(H('4d 5d Ts Js Qs Ks As')));
    expect(bestFive(H('9s 9d 9h 7c 7s 2d Kh')).map((c) => c.rank).sort().join('')).toBe('77999');
  });

  it('counts every five-card hand exactly as the textbook does', () => {
    const counts: Record<string, number> = {};
    const n = deck.length;
    const five: Card52[] = new Array(5);
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) {
              five[0] = deck[a]!;
              five[1] = deck[b]!;
              five[2] = deck[c]!;
              five[3] = deck[d]!;
              five[4] = deck[e]!;
              const k = categoryOf(evaluate(five));
              counts[k] = (counts[k] ?? 0) + 1;
            }
    expect(counts).toEqual({
      straightFlush: 40,
      quads: 624,
      fullHouse: 3744,
      flush: 5108,
      straight: 10200,
      trips: 54912,
      twoPair: 123552,
      pair: 1098240,
      highCard: 1302540,
    });
  }, 120_000);
});

/** A hand-built table: every seat's stack, the button, and seat 0 to act preflop as the engine decides. */
function table(stacks: number[], button = 0): HoldemState {
  return HOLDEM.startRound(HOLDEM.createMatch({ seats: stacks.length, seed: 3, stacks, dealer: button, config: { blindsUpEvery: 0 } }));
}
const act = (s: HoldemState, a: HoldemAction) => HOLDEM.apply(s, a);

describe('the betting rules', () => {
  it('heads up, the button posts the small blind and acts first before the flop, last after it', () => {
    const s = table([1000, 1000], 0);
    expect(s.button).toBe(0);
    expect(s.players[0]!.bet).toBe(10);
    expect(s.players[1]!.bet).toBe(20);
    expect(s.toAct).toBe(0);
    const flop = act(act(s, { type: 'CALL', seat: 0 }), { type: 'CHECK', seat: 1 });
    expect(flop.phase).toBe('FLOP');
    expect(flop.toAct).toBe(1);
  });

  it('three-handed, the seat after the big blind opens, and the big blind gets its option', () => {
    let s = table([1000, 1000, 1000], 0);
    expect([s.players[1]!.bet, s.players[2]!.bet]).toEqual([10, 20]);
    expect(s.toAct).toBe(0);
    s = act(s, { type: 'CALL', seat: 0 });
    s = act(s, { type: 'CALL', seat: 1 });
    expect(s.phase).toBe('PREFLOP');
    expect(s.toAct).toBe(2);
    expect(HOLDEM.legalActions(s, 2).map((a) => a.type)).toEqual(['CHECK', 'RAISE', 'RAISE']);
  });

  it('a raise must be at least the last full raise', () => {
    let s = table([1000, 1000, 1000], 0);
    s = act(s, { type: 'RAISE', seat: 0, to: 60 }); // raised by 40
    expect(HOLDEM.legalActions(s, 1).find((a) => a.type === 'RAISE')).toEqual({ type: 'RAISE', seat: 1, to: 100 });
    expect(() => act(s, { type: 'RAISE', seat: 1, to: 90 })).toThrow(/between 100 and 1000/);
    expect(HOLDEM.normalize(s, 1, { type: 'RAISE', seat: 1, to: 250 })).toEqual({ type: 'RAISE', seat: 1, to: 250 });
    expect(HOLDEM.normalize(s, 1, { type: 'RAISE', seat: 1, to: 250.5 })).toBeNull();
    expect(HOLDEM.normalize(s, 1, { type: 'RAISE', seat: 1, to: 5000 })).toBeNull();
  });

  it('a short all-in does not reopen the betting for whoever already acted', () => {
    // Seat 0 opens to 100; seat 1 (120 behind in all) goes all in, raising only 20.
    let s = table([1000, 130, 1000], 2);
    // Button 2: seat 0 small blind, seat 1 big blind, seat 2 opens.
    s = act(s, { type: 'RAISE', seat: 2, to: 100 });
    s = act(s, { type: 'CALL', seat: 0 });
    s = act(s, { type: 'RAISE', seat: 1, to: 130 });
    expect(s.players[1]!.status).toBe('allIn');
    // Seats 2 and 0 both acted already: call or fold only.
    expect(s.toAct).toBe(2);
    expect(HOLDEM.legalActions(s, 2).map((a) => a.type)).toEqual(['FOLD', 'CALL']);
  });

  it('builds a main pot and side pots from what each player put in', () => {
    const p = (committed: number, status: Player['status'] = 'allIn'): Player => ({ stack: 0, status, bet: 0, committed, hole: [] });
    const pots = buildPots([p(100), p(300, 'active'), p(300, 'active'), p(50, 'folded')]);
    expect(pots).toEqual([
      { amount: 350, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
    ]);
  });

  it('everyone else folding wins the pot without a showdown', () => {
    let s = table([1000, 1000, 1000], 0);
    s = act(s, { type: 'FOLD', seat: 0 });
    s = act(s, { type: 'FOLD', seat: 1 });
    expect(s.phase).toBe('HAND_OVER');
    expect(s.players.map((p) => p.stack)).toEqual([1000, 990, 1010]);
    expect(s.lastResult!.shown).toEqual([]);
  });
});

describe('the review fixes', () => {
  const legal = (s: HoldemState, seat: number) => HOLDEM.legalActions(s, seat).map((a) => a.type);
  const bets = (s: HoldemState) => s.players.map((p) => p.bet);

  it('a big blind all in for less than the small blind does not make the small blind call it', () => {
    // Heads up, the button (seat 0) posts 10 and the big blind has only 5.
    const s = HOLDEM.startRound(HOLDEM.createMatch({ seats: 2, seed: 1, stacks: [1000, 5], dealer: 0, config: { blindsUpEvery: 0 } }));
    // Nothing to decide: the 5 nobody covered goes back and the board runs out.
    const back = s.log.find((e) => e.kind === 'returned');
    expect(back).toEqual({ kind: 'returned', seat: 0, amount: 5 });
    expect(s.phase === 'HAND_OVER' || s.phase === 'MATCH_OVER').toBe(true);
    expect(s.lastResult!.pots.reduce((a, p) => a + p.amount, 0)).toBe(10);
    expect(s.lastResult!.returned).toEqual([{ seat: 0, amount: 5 }]);
    // Whoever won, nobody won or lost more than the 5 the big blind risked.
    expect(s.lastResult!.net.map(Math.abs)).toEqual([5, 5]);
    expect(chipsInPlay(s)).toBe(1005);
  });

  it('three-handed, a short big blind still leaves the full big blind to match, and the folds give the rest back', () => {
    // Button 0, small blind 1 (10), big blind 2 all in for 5. Two players can
    // still act, so the button faces the full 20 and a raise goes to 40.
    let s = table([1000, 1000, 5], 0);
    expect(s.currentBet).toBe(20);
    expect(s.toAct).toBe(0);
    expect(HOLDEM.legalActions(s, 0).find((a) => a.type === 'RAISE')).toEqual({ type: 'RAISE', seat: 0, to: 40 });
    s = act(s, { type: 'FOLD', seat: 0 });
    // Left alone against 5, the small blind has matched everything: it is not
    // asked to complete or fold, and the 5 above the big blind goes back.
    expect(s.phase === 'HAND_OVER' || s.phase === 'MATCH_OVER').toBe(true);
    expect(s.lastResult!.returned).toEqual([{ seat: 1, amount: 5 }]);
    expect(s.lastResult!.net[2]!).toBeLessThanOrEqual(5);
    expect(s.lastResult!.net.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('a short big blind does not make limping cheaper: everyone after it calls the full big blind', () => {
    // Four seats, button 0, small blind 1, big blind 2 all in for 5, UTG 3.
    let s = table([1000, 1000, 5, 1000], 0);
    expect(s.players[2]!.bet).toBe(5);
    expect(s.currentBet).toBe(20);
    expect(s.toAct).toBe(3);
    expect(HOLDEM.legalActions(s, 3).find((a) => a.type === 'RAISE')).toEqual({ type: 'RAISE', seat: 3, to: 40 });
    s = act(s, { type: 'CALL', seat: 3 });
    expect(s.players[3]!.bet).toBe(20);
    // The button may raise only to a full raise over the big blind.
    expect(HOLDEM.legalActions(s, 0).find((a) => a.type === 'RAISE')).toEqual({ type: 'RAISE', seat: 0, to: 40 });
    s = act(s, { type: 'CALL', seat: 0 });
    // The small blind must complete; it may not check its 10.
    expect(legal(s, 1)).toEqual(['FOLD', 'CALL', 'RAISE', 'RAISE']);
    s = act(s, { type: 'CALL', seat: 1 });
    expect(s.phase).toBe('FLOP');
    // A main pot the big blind is in (4 x 5) and a side pot it is not (3 x 15).
    expect(buildPots(s.players)).toEqual([
      { amount: 20, eligible: [0, 1, 2, 3] },
      { amount: 45, eligible: [0, 1, 3] },
    ]);
  });

  it('heads up, a small blind all in for less leaves the big blind nothing to do', () => {
    // The button (seat 0) has only 5 for its small blind; the big blind posts 20.
    const s = HOLDEM.startRound(HOLDEM.createMatch({ seats: 2, seed: 1, stacks: [5, 1000], dealer: 0, config: { blindsUpEvery: 0 } }));
    expect(s.phase === 'HAND_OVER' || s.phase === 'MATCH_OVER').toBe(true);
    expect(s.lastResult!.returned).toEqual([{ seat: 1, amount: 15 }]);
    expect(s.lastResult!.net.map(Math.abs)).toEqual([5, 5]);
  });

  it('when one player left with chips is short of the others, it still calls or folds', () => {
    // Button 0 shoves 1000; the small blind (1) is all in for 200 calling it;
    // the big blind (2) is the only one who can act and faces the full shove.
    let s = table([1000, 200, 1000], 0);
    s = act(s, { type: 'RAISE', seat: 0, to: 1000 });
    s = act(s, { type: 'CALL', seat: 1 });
    expect(s.toAct).toBe(2);
    expect(legal(s, 2)).toEqual(['FOLD', 'CALL']);
  });

  it('a bet nobody could call goes back to its owner and is not reported as a pot won', () => {
    let s = table([1000, 200], 0);
    s = act(s, { type: 'RAISE', seat: 0, to: 1000 });
    s = act(s, { type: 'CALL', seat: 1 });
    const kinds = s.log.map((e) => e.kind);
    // Handed back before the board runs out, then only the contested 400 is won.
    expect(kinds.indexOf('returned')).toBeLessThan(kinds.indexOf('street'));
    expect(s.log.filter((e) => e.kind === 'returned')).toEqual([{ kind: 'returned', seat: 0, amount: 800 }]);
    const won = s.log.filter((e) => e.kind === 'potWon');
    expect(won.map((e) => (e.kind === 'potWon' ? e.amount : 0))).toEqual([400]);
    expect(s.lastResult!.pots.map((p) => p.amount)).toEqual([400]);
    expect(s.lastResult!.returned).toEqual([{ seat: 0, amount: 800 }]);
    expect(s.players.map((p) => p.stack).reduce((a, b) => a + b, 0)).toBe(1200);
    expect(s.lastResult!.net.map(Math.abs)).toEqual([200, 200]);
  });

  it('an uncontested raise gets its uncalled part back, and only the rest counts as won', () => {
    let s = table([1500, 1500, 1500], 0);
    s = act(s, { type: 'RAISE', seat: 0, to: 60 });
    s = act(s, { type: 'FOLD', seat: 1 });
    s = act(s, { type: 'FOLD', seat: 2 });
    expect(s.log.filter((e) => e.kind === 'returned' || e.kind === 'potWon')).toEqual([
      { kind: 'returned', seat: 0, amount: 40 },
      { kind: 'potWon', amount: 50, winners: [0], uncontested: true },
    ]);
    expect(s.lastResult!.net).toEqual([30, -10, -20]);
    expect(s.players.map((p) => p.stack)).toEqual([1530, 1490, 1480]);
  });

  it('no bet stays in front of anyone once the hand is over, however it ended', () => {
    let s = table([1500, 1500, 1500], 0);
    s = act(s, { type: 'RAISE', seat: 0, to: 60 });
    s = act(s, { type: 'FOLD', seat: 1 });
    s = act(s, { type: 'FOLD', seat: 2 });
    expect(s.phase).toBe('HAND_OVER');
    expect(bets(s)).toEqual([0, 0, 0]);
    const v = HOLDEM.view(s, 1);
    expect([v.pot, v.currentBet, v.toCall]).toEqual([0, 0, 0]);
    expect(v.players.map((p) => p.bet)).toEqual([0, 0, 0]);
    // A walk for the big blind too.
    let w = table([1500, 1500, 1500], 0);
    w = act(w, { type: 'FOLD', seat: 0 });
    w = act(w, { type: 'FOLD', seat: 1 });
    expect(bets(w)).toEqual([0, 0, 0]);
    expect(w.currentBet).toBe(0);
  });

  it('short all-ins that add up to a full raise reopen the betting for whoever already acted', () => {
    // Button 3: seat 0 small blind, seat 1 big blind, seat 2 opens preflop.
    let s = table([1000, 170, 230, 1000], 3);
    // Everyone calls 20 to see a flop.
    s = act(s, { type: 'CALL', seat: 2 });
    s = act(s, { type: 'CALL', seat: 3 });
    s = act(s, { type: 'CALL', seat: 0 });
    s = act(s, { type: 'CHECK', seat: 1 });
    expect(s.phase).toBe('FLOP');
    expect(s.toAct).toBe(0);
    s = act(s, { type: 'RAISE', seat: 0, to: 100 }); // a bet of 100
    s = act(s, { type: 'RAISE', seat: 1, to: 150 }); // all in, 50 more: short
    expect(s.players[1]!.status).toBe('allIn');
    s = act(s, { type: 'RAISE', seat: 2, to: 210 }); // all in, 60 more: short again
    expect(s.players[2]!.status).toBe('allIn');
    // Seat 3 has not acted yet: it may raise.
    expect(legal(s, 3)).toContain('RAISE');
    s = act(s, { type: 'CALL', seat: 3 });
    // Seat 0 bet 100 and now faces 210: 110 more, a full raise in all.
    expect(s.toAct).toBe(0);
    expect(legal(s, 0)).toEqual(['FOLD', 'CALL', 'RAISE', 'RAISE']);
  });

  it('one short all-in still does not reopen it, and a seat that called it may not raise later short ones', () => {
    let s = table([1000, 170, 1000, 1000], 3);
    s = act(s, { type: 'CALL', seat: 2 });
    s = act(s, { type: 'CALL', seat: 3 });
    s = act(s, { type: 'CALL', seat: 0 });
    s = act(s, { type: 'CHECK', seat: 1 });
    s = act(s, { type: 'RAISE', seat: 0, to: 100 });
    s = act(s, { type: 'RAISE', seat: 1, to: 150 }); // all in, short
    s = act(s, { type: 'CALL', seat: 2 });
    s = act(s, { type: 'CALL', seat: 3 });
    expect(s.toAct).toBe(0);
    expect(legal(s, 0)).toEqual(['FOLD', 'CALL']);
  });

  it('going heads up, the player who just paid the big blind does not pay it again', () => {
    const SEED = 5; // a deal seat 0 loses
    // Button 0, small blind 1, big blind 2; seat 0 has 20 and goes all in.
    let s = HOLDEM.startRound(HOLDEM.createMatch({ seats: 3, seed: SEED, stacks: [20, 1000, 1000], dealer: 0, config: { blindsUpEvery: 0 } }));
    expect([s.button, s.bigBlindSeat]).toEqual([0, 2]);
    s = act(s, { type: 'CALL', seat: 0 }); // all in
    s = act(s, { type: 'CALL', seat: 1 });
    s = act(s, { type: 'CHECK', seat: 2 });
    while (s.phase !== 'HAND_OVER' && s.phase !== 'MATCH_OVER') s = act(s, { type: 'CHECK', seat: s.toAct! });
    // This deal (the seed) has seat 0 lose and bust.
    expect(s.players[0]!.status).toBe('out');
    s = HOLDEM.startRound(s);
    const blinds = s.log.filter((e) => e.kind === 'blind');
    // Seat 1 posts the big blind; seat 2, who just did, has the button and the small blind.
    expect(blinds.map((e) => (e.kind === 'blind' ? [e.seat, e.big] : null))).toEqual([
      [2, false],
      [1, true],
    ]);
    expect(s.button).toBe(2);
    expect(s.toAct).toBe(2);
  });

  it('when the big blind busts, the next seat still pays the big blind next hand', () => {
    // Four seats; follow the big blind over a run of hands in which seat 2 is out.
    let s = HOLDEM.createMatch({ seats: 4, seed: 9, stacks: [1000, 1000, 0, 1000], dealer: 0, config: { blindsUpEvery: 0 } });
    s = { ...s, bigBlindSeat: 1 }; // seat 1 paid the big blind last hand; seat 2 busted then
    const bigs: number[] = [];
    const buttons: number[] = [];
    for (let hand = 0; hand < 6; hand++) {
      s = HOLDEM.startRound(s);
      bigs.push(s.bigBlindSeat!);
      buttons.push(s.button);
      // Everyone folds to the big blind.
      while (s.phase !== 'HAND_OVER') s = act(s, { type: 'FOLD', seat: s.toAct! });
    }
    expect(bigs).toEqual([3, 0, 1, 3, 0, 1]);
    // The button and the small blind are the live seats just before it.
    expect(buttons).toEqual([0, 1, 3, 0, 1, 3]);
  });
});

describe('a hold’em table', () => {
  it('conserves every chip and hides every hole card, over random play to a winner', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const seats = 2 + (seed % 8);
      const all = Array.from({ length: seats }, (_, i) => i);
      const session = new Session(HOLDEM, { seats, seed, humanSeats: all, config: { startingStack: 300, blindsUpEvery: 4 } });
      const pick = makeRng(seed * 31);
      const total = seats * 300;
      let guard = 0;
      let lastBig = session.state.bigBlindSeat;
      while (!session.matchOver() && guard++ < 50_000) {
        if (session.roundOver()) {
          // A hand over leaves no bet out, and what was won is what was lost.
          const st = session.state;
          if (st.players.some((p) => p.bet !== 0) || st.currentBet !== 0) throw new Error(`seed ${seed}: bets left out at hand over`);
          if (st.lastResult!.net.reduce((a, b) => a + b, 0) !== 0) throw new Error(`seed ${seed}: net does not add up`);
          session.startNextRound();
          // Nobody pays the big blind twice running.
          if (session.state.bigBlindSeat === lastBig) throw new Error(`seed ${seed}: seat ${lastBig} paid the big blind twice`);
          lastBig = session.state.bigBlindSeat;
        } else {
          const seat = session.actors()[0]!;
          const legal = session.legal(seat);
          let a = legal[Math.floor(pick() * legal.length)]!;
          // Raises anywhere in their range, not only at the ends.
          if (a.type === 'RAISE') {
            const r = session.view(seat).raiseTo!;
            a = { type: 'RAISE', seat, to: r.min + Math.floor(pick() * (r.max - r.min + 1)) };
          }
          session.submit(a);
        }
        if (chipsInPlay(session.state) !== total) throw new Error(`chips not conserved at seed ${seed}`);
        const leaks = findLeaks(HOLDEM, session.state, seats);
        if (leaks.length > 0) throw new Error(`seed ${seed}: ${leaks[0]}`);
      }
      expect(session.matchOver()).toBe(true);
      expect(session.winners()!.length).toBe(1);
      expect(session.state.players.filter((p) => p.stack > 0).length).toBe(1);
    }
  });

  it('bots at every level play legally to a winner', () => {
    for (const level of ['easy', 'medium', 'hard'] as BotLevel[]) {
      const session = new Session(HOLDEM, { seats: 4, seed: 41, botLevel: level, config: { startingStack: 400, blindsUpEvery: 4 } });
      session.playWholeMatch();
      expect(session.matchOver()).toBe(true);
    }
  }, 60_000);

  it('medium beats easy heads up', () => {
    let wins = 0;
    const matches = 20;
    for (let i = 0; i < matches; i++) {
      for (const mSeat of [0, 1]) {
        let s = HOLDEM.startRound(HOLDEM.createMatch({ seats: 2, seed: 500 + i, config: { startingStack: 400, blindsUpEvery: 6 } }));
        const rng = makeRng(i * 7 + mSeat);
        while (s.phase !== 'MATCH_OVER') {
          if (s.phase === 'HAND_OVER') {
            s = HOLDEM.startRound(s);
            continue;
          }
          const seat = HOLDEM.actors(s)[0]!;
          s = HOLDEM.apply(s, HOLDEM.bot.decide(HOLDEM.view(s, seat), rng, seat === mSeat ? 'medium' : 'easy'));
        }
        if (HOLDEM.winners(s)![0] === mSeat) wins++;
      }
    }
    expect(wins / (matches * 2)).toBeGreaterThan(0.6);
  }, 120_000);

  it('the clock: check if you can, fold if you cannot', () => {
    const session = new Session(HOLDEM, { seats: 3, seed: 2, humanSeats: [0, 1, 2], config: { blindsUpEvery: 0 } });
    const seat = session.actors()[0]!;
    expect(HOLDEM.defaultAction(session.state, seat, () => 0.5, 'medium')).toEqual({ type: 'FOLD', seat });
  });
});

describe('the hold’em golden corpus', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const FILE = join(here, 'golden.json');
  const record = (seats: number, seed: number) => {
    const all = Array.from({ length: seats }, (_, i) => i);
    const session = new Session(HOLDEM, { seats, seed, humanSeats: all, config: { startingStack: 200, blindsUpEvery: 3 } });
    const pick = makeRng(seed + 11);
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
      const a = legal[Math.floor(pick() * legal.length)]!;
      session.submit(a);
      steps.push([a, session.drainEvents()]);
    }
    return hashes;
  };
  it('replays hand for hand', () => {
    const now = { headsUp: record(2, 1), six: record(6, 2), nine: record(9, 3) };
    if (process.env.GOLDEN_UPDATE === '1' || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
    const was = JSON.parse(readFileSync(FILE, 'utf8')) as typeof now;
    for (const k of Object.keys(now) as (keyof typeof now)[]) {
      const first = now[k].findIndex((h, i) => h !== was[k][i]);
      expect(first, `${k}: hand ${first + 1} changed`).toBe(-1);
      expect(now[k].length).toBe(was[k].length);
    }
  });
});
