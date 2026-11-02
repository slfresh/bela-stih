import { describe, expect, it } from 'vitest';
import { makeRng as engineRng } from '@belot/engine';
import { Session, canonical, findLeaks, makeRng, matchLegal } from '@belot/game-core';
import { TOY, type ToyAction } from './toy';

/**
 * The session layer over an arbitrary game: it plays bot seats until a person
 * is owed a decision, it resolves a simultaneous window when the clock closes
 * it, and the decision id a clock keys on moves exactly when the decision does.
 */

describe('rng', () => {
  it('is the engine generator, stream for stream', () => {
    const a = makeRng(12345);
    const b = engineRng(12345);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });
});

describe('an all-bot session', () => {
  it('plays a whole match to a winner', () => {
    const s = new Session(TOY, { seats: 3, seed: 7 });
    s.playWholeMatch();
    expect(s.matchOver()).toBe(true);
    expect(s.winners()!.length).toBe(1);
    const kinds = s.drainEvents().map((e) => e.kind);
    expect(kinds[0]).toBe('roundStarted');
    expect(kinds).toContain('matchOver');
    expect(kinds.filter((k) => k === 'roundWon').length).toBeGreaterThanOrEqual(2);
  });

  it('is reproducible from a seed and differs between seeds', () => {
    const run = (seed: number) => {
      const s = new Session(TOY, { seats: 4, seed });
      s.playWholeMatch();
      return JSON.stringify(s.drainEvents());
    };
    expect(run(1)).toBe(run(1));
    expect(run(1)).not.toBe(run(2));
  });

  it('refuses playWholeMatch with a person seated', () => {
    expect(() => new Session(TOY, { seats: 2, seed: 1, humanSeats: [0] }).playWholeMatch()).toThrow(/all-bot/);
  });
});

describe('a simultaneous window', () => {
  it('waits on every human at once and lets bots answer first', () => {
    const s = new Session(TOY, { seats: 4, seed: 3, humanSeats: [1, 3] });
    // Bots 0 and 2 have said READY; the window is open for the two people.
    expect(s.actors().sort()).toEqual([1, 3]);
    expect(s.humanActors().sort()).toEqual([1, 3]);
    expect(s.drainEvents().filter((e) => e.kind === 'ready').map((e) => (e as { seat: number }).seat).sort()).toEqual([0, 2]);
  });

  it('closeWindow applies the default action for every pending human, then runs the bots', () => {
    const s = new Session(TOY, { seats: 4, seed: 3, humanSeats: [1, 3] });
    s.drainEvents();
    s.closeWindow();
    const events = s.drainEvents();
    expect(events.filter((e) => e.kind === 'ready').map((e) => (e as { seat: number }).seat).sort()).toEqual([1, 3]);
    // Play began and ran until a person is on turn (or the round ended).
    expect(s.state.phase === 'PLAY' ? s.humanActors().length : 0).toBe(s.state.phase === 'PLAY' ? 1 : 0);
  });

  it('a person answering the window alone leaves the other pending', () => {
    const s = new Session(TOY, { seats: 3, seed: 5, humanSeats: [0, 1] });
    s.submit({ type: 'READY', seat: 0 });
    expect(s.actors()).toEqual([1]);
    expect(s.state.phase).toBe('ANTE');
  });
});

describe('decisions', () => {
  it('decisionId changes with every decision and is null between rounds', () => {
    const s = new Session(TOY, { seats: 2, seed: 9, humanSeats: [0] });
    const seen = new Set<string>();
    while (!s.matchOver()) {
      if (s.roundOver()) {
        expect(s.decisionId()).toBeNull();
        s.startNextRound();
        continue;
      }
      const id = s.decisionId()!;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      s.submit(s.legal(0)[0]!);
    }
  });

  it('rejects an action from a seat that is not owed one, or from a bot seat', () => {
    const s = new Session(TOY, { seats: 2, seed: 9, humanSeats: [0] });
    s.closeWindow(); // into PLAY, seat 1 (bot) then seat 0 or the other way round
    const actor = s.actors()[0]!;
    const other = 1 - actor;
    expect(() => s.submit({ type: 'TAKE', seat: other, n: 1 })).toThrow(/not seat/);
    if (actor === 1) expect(() => s.submit({ type: 'TAKE', seat: 1, n: 1 })).toThrow(/played by a bot/);
  });

  it('submitRaw accepts a canonical legal action and refuses anything else', () => {
    const s = new Session(TOY, { seats: 2, seed: 2, humanSeats: [0] });
    expect(s.submitRaw(0, { seat: 0, type: 'READY' })).toBe(true);
    expect(s.state.phase).toBe('PLAY');
    expect(s.submitRaw(0, { type: 'TAKE', seat: 0, n: 99 })).toBe(false);
    expect(s.submitRaw(0, 'TAKE')).toBe(false);
    expect(s.submitRaw(1, { type: 'TAKE', seat: 1, n: 1 })).toBe(false); // seat 1 is a bot
    const before = s.moveCount;
    const n = (s.legal(0)[0] as ToyAction & { n: number }).n;
    expect(s.submitRaw(0, { n, seat: 0, type: 'TAKE' })).toBe(true);
    expect(s.moveCount).toBeGreaterThan(before);
  });

  it('botMoveFor plays one move for a human seat on turn and leaves it human', () => {
    const s = new Session(TOY, { seats: 2, seed: 2, humanSeats: [0] });
    s.closeWindow();
    // After the window the bot (seat 1) has played on until it is seat 0's turn.
    expect(s.actors()).toEqual([0]);
    const moves = s.moveCount;
    s.botMoveFor(0);
    expect(s.moveCount).toBeGreaterThan(moves);
    expect(s.humanSeats.has(0)).toBe(true);
  });

  it('a seat handed to a bot is played at once; handed back it waits', () => {
    const s = new Session(TOY, { seats: 2, seed: 4, humanSeats: [0, 1] });
    expect(s.actors().sort()).toEqual([0, 1]);
    s.setSeatHuman(1, false);
    expect(s.actors()).toEqual([0]);
    s.setSeatHuman(1, true);
    expect(s.humanSeats.has(1)).toBe(true);
  });

  it('newMatch is legal only once the match is over and keeps counting moves', () => {
    const s = new Session(TOY, { seats: 2, seed: 11 });
    expect(() => s.newMatch()).toThrow(/cannot start a new match/);
    s.playWholeMatch();
    const moves = s.moveCount;
    s.newMatch({ seed: 12 });
    expect(s.matchOver()).toBe(false);
    expect(s.drainEvents().map((e) => e.kind).slice(0, 2)).toEqual(['matchStarted', 'roundStarted']);
    s.playWholeMatch();
    expect(s.moveCount).toBeGreaterThan(moves);
  });
});

describe('findLeaks', () => {
  it('passes an honest view and catches a planted leak', () => {
    const s = new Session(TOY, { seats: 3, seed: 1 });
    expect(findLeaks(TOY, s.state, 3, (t) => [`"wish:${t.split(':')[1]}`])).toEqual([]);
    const planted = { ...TOY, view: (st: typeof s.state, seat: number) => ({ ...TOY.view(st, seat), all: TOY.secrets(st).flatMap((x) => x.tokens) }) };
    expect(findLeaks(planted, s.state, 3).length).toBe(6);
  });
});

describe('normalize helpers', () => {
  it('canonical sorts keys and drops undefined', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
  });
  it('matchLegal returns the legal instance, not the raw object', () => {
    const legal = [{ type: 'TAKE', seat: 0, n: 2 }];
    const hit = matchLegal(legal, { n: 2, seat: 0, type: 'TAKE' });
    expect(hit).toBe(legal[0]);
    expect(matchLegal(legal, { n: 3, seat: 0, type: 'TAKE' })).toBeNull();
  });
});
