import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Session, canonical, findLeaks, makeRng, type BotLevel } from '@belot/game-core';
import { makeShoe, type Card52 } from '@belot/cards';
import { BACCARAT, bankerDraws, betTotal, playCoup, total, type BaccaratState } from '@belot/games-baccarat';

/**
 * Baccarat, pinned: the tableau case by case and against the game's known
 * odds, chips conserved after every move, the betting window, the
 * hidden-shoe check, bots, and a golden corpus.
 */

const C = (rank: Card52['rank']): Card52 => ({ id: `${rank}s`, rank, suit: 'spades' });

describe('the tableau', () => {
  it('counts by the last digit, courts and tens nothing', () => {
    expect(total([C('9'), C('8')])).toBe(7);
    expect(total([C('K'), C('T')])).toBe(0);
    expect(total([C('A'), C('5'), C('Q')])).toBe(6);
  });

  it('the banker draws by its total and the player third card', () => {
    // Player stood: banker draws on 0-5.
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((t) => bankerDraws(t, null))).toEqual([true, true, true, true, true, true, false, false]);
    expect(bankerDraws(3, C('8'))).toBe(false);
    expect(bankerDraws(3, C('9'))).toBe(true);
    expect(bankerDraws(4, C('A'))).toBe(false);
    expect(bankerDraws(4, C('2'))).toBe(true);
    expect(bankerDraws(5, C('3'))).toBe(false);
    expect(bankerDraws(5, C('4'))).toBe(true);
    expect(bankerDraws(6, C('6'))).toBe(true);
    expect(bankerDraws(6, C('8'))).toBe(false);
    expect(bankerDraws(7, C('6'))).toBe(false);
  });

  it('a natural stops the coup at two cards each', () => {
    // Dealt from the end: player 9 K, banker 3 2, then cards that must stay in the shoe.
    const shoe = [C('5'), C('5'), C('2'), C('K'), C('3'), C('9')];
    const coup = playCoup(shoe);
    expect(coup.natural).toBe(true);
    expect(coup.player.length + coup.banker.length).toBe(4);
    expect(coup.outcome).toBe('player');
    expect(shoe.length).toBe(2);
  });

  it('matches the game known odds over 200,000 coups', () => {
    const rng = makeRng(42);
    const n = { player: 0, banker: 0, tie: 0 };
    let shoe = makeShoe(8, rng);
    for (let i = 0; i < 200_000; i++) {
      if (shoe.length < 16) shoe = makeShoe(8, rng);
      n[playCoup(shoe).outcome]++;
    }
    const f = (k: keyof typeof n) => n[k] / 200_000;
    // Published eight-deck figures: banker 45.86%, player 44.62%, tie 9.52%.
    expect(f('banker')).toBeCloseTo(0.4586, 2);
    expect(f('player')).toBeCloseTo(0.4462, 2);
    expect(f('tie')).toBeCloseTo(0.0952, 2);
  });
});

function chips(s: BaccaratState): number {
  return s.stacks.reduce((a, b) => a + b, 0) + s.bets.reduce((a, b) => a + betTotal(b), 0) + s.house;
}

describe('a baccarat table', () => {
  it('conserves every chip after every move, over random play', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const seats = 1 + (seed % 7);
      const session = new Session(BACCARAT, { seats, seed, humanSeats: Array.from({ length: seats }, (_, i) => i), config: { coups: 30 } });
      const pick = makeRng(seed * 7);
      const start = seats * 1000;
      let guard = 0;
      while (!session.matchOver() && guard++ < 20_000) {
        if (session.roundOver()) session.startNextRound();
        else {
          const seat = session.actors()[Math.floor(pick() * session.actors().length)]!;
          const legal = session.legal(seat);
          // Lean towards betting, so stacks move.
          const bets = legal.filter((a) => a.type === 'BET');
          const a = bets.length > 0 && pick() < 0.6 ? bets[Math.floor(pick() * bets.length)]! : legal[Math.floor(pick() * legal.length)]!;
          session.submit(a);
        }
        if (chips(session.state) !== start) throw new Error(`chips not conserved at seed ${seed}`);
        if (session.state.stacks.some((x) => x < 0)) throw new Error('a negative stack');
      }
      expect(session.matchOver()).toBe(true);
      expect(session.settlement()!.reduce((a, b) => a + b, 0)).toBe(-session.state.house);
    }
  });

  it('pays player 1:1, banker 1:1 less 5%, tie 8:1, and pushes the rest on a tie', () => {
    // Find coups of each outcome from seeded shoes, betting 100 on each spot.
    const seen = new Set<string>();
    for (let seed = 1; seen.size < 3 && seed < 500; seed++) {
      let s = BACCARAT.startRound(BACCARAT.createMatch({ seats: 1, seed }));
      for (const spot of ['player', 'banker', 'tie'] as const) s = BACCARAT.apply(s, { type: 'BET', seat: 0, spot, amount: 100 });
      s = BACCARAT.apply(s, { type: 'READY', seat: 0 });
      const out = s.lastCoup!.outcome;
      seen.add(out);
      const expected = out === 'player' ? 200 : out === 'banker' ? 195 : 100 + 100 + 900;
      expect(s.stacks[0], out).toBe(1000 - 300 + expected);
    }
    expect(seen.size).toBe(3);
  });

  it('is a betting window: everyone at once, and the clock closes it', () => {
    const session = new Session(BACCARAT, { seats: 3, seed: 5, humanSeats: [0, 2] });
    // The bot at seat 1 has bet and said no more bets; both people are still owed.
    expect(session.actors().sort()).toEqual([0, 2]);
    session.submit({ type: 'BET', seat: 2, spot: 'banker', amount: 25 });
    expect(session.actors().sort()).toEqual([0, 2]);
    session.submit({ type: 'READY', seat: 2 });
    expect(session.actors()).toEqual([0]);
    session.closeWindow();
    expect(session.roundOver()).toBe(true);
    const kinds = session.drainEvents().map((e) => e.kind);
    expect(kinds).toContain('dealt');
    expect(kinds).toContain('coupResolved');
    expect(session.state.stacks[0]).toBe(1000); // timed out without a bet: nothing staked
  });

  it('refuses a bet over the stack or the table limit, and after no more bets', () => {
    let s = BACCARAT.startRound(BACCARAT.createMatch({ seats: 2, seed: 1, stacks: [30, 1000] }));
    expect(() => BACCARAT.apply(s, { type: 'BET', seat: 0, spot: 'banker', amount: 100 })).toThrow(/not allowed/);
    for (let i = 0; i < 5; i++) s = BACCARAT.apply(s, { type: 'BET', seat: 1, spot: 'player', amount: 100 });
    expect(() => BACCARAT.apply(s, { type: 'BET', seat: 1, spot: 'player', amount: 10 })).toThrow(/not allowed/);
    s = BACCARAT.apply(s, { type: 'READY', seat: 1 });
    expect(() => BACCARAT.apply(s, { type: 'BET', seat: 1, spot: 'tie', amount: 10 })).toThrow(/already said no more bets/);
    expect(BACCARAT.normalize(s, 0, { type: 'BET', seat: 0, spot: 'banker', amount: 10, x: 1 })).toEqual({ type: 'BET', seat: 0, spot: 'banker', amount: 10 });
    expect(BACCARAT.normalize(s, 0, { type: 'BET', seat: 0, spot: 'side', amount: 10 })).toBeNull();
    expect(BACCARAT.normalize(s, 0, { type: 'BET', seat: 0, spot: 'banker', amount: 11 })).toBeNull();
  });

  it('a busted seat sits out, and a table nobody can bet at ends', () => {
    const s = BACCARAT.startRound(BACCARAT.createMatch({ seats: 2, seed: 3, stacks: [5, 5] }));
    expect(s.phase).toBe('MATCH_OVER');
    expect(BACCARAT.seatStatus(s, 0)).toBe('out');
  });

  it('never shows anyone the shoe', () => {
    const session = new Session(BACCARAT, { seats: 4, seed: 9, humanSeats: [0, 1, 2, 3], config: { coups: 8 } });
    const pick = makeRng(1);
    while (!session.matchOver()) {
      expect(findLeaks(BACCARAT, session.state, 4)).toEqual([]);
      if (session.roundOver()) session.startNextRound();
      else {
        const seat = session.actors()[0]!;
        const legal = session.legal(seat);
        session.submit(legal[Math.floor(pick() * legal.length)]!);
      }
    }
  });

  it('bots at every level play legally to the end of a match', () => {
    for (const level of ['easy', 'medium', 'hard'] as BotLevel[]) {
      const session = new Session(BACCARAT, { seats: 5, seed: 17, botLevel: level });
      session.playWholeMatch();
      expect(session.matchOver()).toBe(true);
      expect(session.state.coupNumber).toBe(20);
    }
  });
});

describe('the baccarat golden corpus', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const FILE = join(here, 'golden.json');
  const record = (seats: number, seed: number) => {
    const all = Array.from({ length: seats }, (_, i) => i);
    const session = new Session(BACCARAT, { seats, seed, humanSeats: all, config: { coups: 12 } });
    const pick = makeRng(seed + 99);
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
  it('replays coup for coup', () => {
    const now = { one: record(1, 1), three: record(3, 2), seven: record(7, 3) };
    if (process.env.GOLDEN_UPDATE === '1' || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
    const was = JSON.parse(readFileSync(FILE, 'utf8')) as typeof now;
    for (const k of Object.keys(now) as (keyof typeof now)[]) {
      const first = now[k].findIndex((h, i) => h !== was[k][i]);
      expect(first, `${k}: coup ${first + 1} changed`).toBe(-1);
      expect(now[k].length).toBe(was[k].length);
    }
  });
});
