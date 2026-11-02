import { describe, expect, it } from 'vitest';
import { Session, findLeaks, makeRng, type BotLevel } from '@belot/game-core';
import { DECK_SIZE, OSMICE, makeDeck, type OCard, type OsmiceAction, type OsmiceEvent, type OsmiceState } from '@belot/games-osmice';

/**
 * Osmice, pinned the way Bela is: random legal play over many rounds with the
 * invariants checked after every move, the hidden-information check over every
 * state, the wire normaliser, the rules one by one, and the bots' strength.
 */

/** Rounds of random play per push; the nightly job raises it (OSMICE_ROUNDS). */
const DEALS = Number(process.env.OSMICE_ROUNDS ?? 500);

function allCards(s: OsmiceState): OCard[] {
  return [...s.hands.flat(), ...s.drawPile, ...s.discard];
}

/** Plain throws, not expect(): this runs after every one of tens of thousands of moves. */
function checkInvariants(s: OsmiceState): void {
  const fail = (why: string) => {
    throw new Error(`invariant broken: ${why} (round ${s.roundNumber}, phase ${s.phase})`);
  };
  const seen = new Set<string>();
  let n = 0;
  for (const pile of [...s.hands, s.drawPile, s.discard]) {
    for (const c of pile) {
      seen.add(c.id);
      n++;
    }
  }
  if (n !== DECK_SIZE || seen.size !== DECK_SIZE) fail(`${n} cards, ${seen.size} distinct`);
  if (s.discard.length === 0) fail('empty discard pile');
  if (s.pendingDraw < 0) fail('negative pending draw');
  if (s.phase === 'PLAY' && s.hands.some((h) => h.length === 0)) fail('an empty hand during play');
  if (s.phase === 'ROUND_OVER' || s.phase === 'MATCH_OVER') {
    if (s.hands.filter((h) => h.length === 0).length !== 1) fail('not exactly one empty hand at the end');
    if (s.hands[s.lastRound!.winner]!.length !== 0) fail('the winner still holds cards');
  }
}

/** Random legal play, every seat human so this test chooses each move. */
function selfPlay(seats: number, seed: number, config: Partial<OsmiceState['config']> = {}) {
  const session = new Session(OSMICE, { seats, seed, humanSeats: Array.from({ length: seats }, (_, i) => i), config });
  const pick = makeRng(seed ^ 0x5eed);
  let rounds = 0;
  let moves = 0;
  const kinds = new Map<string, number>();
  const tally = (es: OsmiceEvent[]) => es.forEach((e) => kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1));
  tally(session.drainEvents());
  checkInvariants(session.state);
  while (!session.matchOver()) {
    if (session.roundOver()) {
      rounds++;
      session.startNextRound();
    } else {
      const seat = session.actors()[0]!;
      const legal = session.legal(seat);
      if (legal.length === 0) throw new Error('a seat on turn with nothing legal');
      session.submit(legal[Math.floor(pick() * legal.length)]!);
      moves++;
      if (moves > 200_000) throw new Error('runaway match');
    }
    tally(session.drainEvents());
    checkInvariants(session.state);
  }
  return { rounds: rounds + 1, moves, kinds, state: session.state };
}

describe('the Osmice deck', () => {
  it('is 108 distinct cards: 76 numbers, 24 actions, 8 wilds', () => {
    const d = makeDeck();
    expect(d.length).toBe(108);
    expect(new Set(d.map((c) => c.id)).size).toBe(108);
    expect(d.filter((c) => c.colour === null).length).toBe(8);
    expect(d.filter((c) => /^[0-9]$/.test(c.value)).length).toBe(76);
    expect(d.filter((c) => c.value === '0').length).toBe(4);
  });
});

describe('Osmice self-play', () => {
  it(`keeps every card and ends every round with one empty hand, over ${DEALS} rounds`, () => {
    let rounds = 0;
    let seed = 1;
    const seen = new Map<string, number>();
    while (rounds < DEALS) {
      const seats = 2 + (seed % 5);
      const r = selfPlay(seats, seed, { matchTarget: 300, stackDraws: seed % 3 === 0 });
      rounds += r.rounds;
      for (const [k, n] of r.kinds) seen.set(k, (seen.get(k) ?? 0) + n);
      expect(Math.max(...r.state.scores)).toBeGreaterThanOrEqual(300);
      seed++;
    }
    // Random play reaches every kind of event.
    for (const k of ['roundStarted', 'cardPlayed', 'drew', 'passed', 'skipped', 'reversed', 'reshuffled', 'lastCard', 'roundOver', 'matchOver']) {
      expect(seen.get(k) ?? 0, k).toBeGreaterThan(0);
    }
  });

  it('never shows a seat a card it may not see', () => {
    for (const seats of [2, 3, 4, 6]) {
      const session = new Session(OSMICE, { seats, seed: seats * 7, humanSeats: Array.from({ length: seats }, (_, i) => i), config: { matchTarget: 150 } });
      const pick = makeRng(seats);
      let steps = 0;
      while (!session.matchOver() && steps++ < 3000) {
        expect(findLeaks(OSMICE, session.state, seats)).toEqual([]);
        if (session.roundOver()) session.startNextRound();
        else {
          const legal = session.legal(session.actors()[0]!);
          session.submit(legal[Math.floor(pick() * legal.length)]!);
        }
      }
      // And the event stream names a drawn card's count, never the card.
      for (const e of session.drainEvents()) if (e.kind === 'drew') expect(Object.keys(e).sort()).toEqual(['count', 'kind', 'penalty', 'seat']);
    }
  });

  it('the leak check would catch a view showing the next hand', () => {
    const session = new Session(OSMICE, { seats: 3, seed: 3, humanSeats: [0, 1, 2] });
    const leaky = { ...OSMICE, view: (s: OsmiceState, seat: number) => ({ ...OSMICE.view(s, seat), peek: s.hands[(seat + 1) % 3] }) };
    expect(findLeaks(leaky, session.state, 3).length).toBeGreaterThan(0);
  });
});

/** A hand-built position: seat 0 to play on a red 5, with exactly these cards. */
function position(hands: OCard[][], topCard: OCard, extra: Partial<OsmiceState> = {}): OsmiceState {
  const base = OSMICE.startRound(OSMICE.createMatch({ seats: hands.length, seed: 1 }));
  const used = new Set([...hands.flat(), topCard].map((c) => c.id));
  return {
    ...base,
    hands: hands.map((h) => h.map((c) => ({ ...c }))),
    discard: [topCard],
    drawPile: makeDeck().filter((c) => !used.has(c.id)),
    colour: topCard.colour ?? 'red',
    turn: 0,
    direction: 1,
    ...extra,
  };
}
const C = (id: string): OCard => makeDeck().find((c) => c.id === id)!;
const play = (s: OsmiceState, a: OsmiceAction) => OSMICE.apply(s, a);

describe('the rules, one by one', () => {
  it('match the colour or the value; a wild goes on anything', () => {
    const s = position([[C('red-7-0'), C('blue-5-0'), C('blue-6-0'), C('wild-0')], [C('gold-1-0')]], C('red-5-0'));
    const ids = new Set(OSMICE.legalActions(s, 0).filter((a) => a.type === 'PLAY').map((a) => (a as { cardId: string }).cardId));
    expect(ids).toEqual(new Set(['red-7-0', 'blue-5-0', 'wild-0']));
    // A wild is offered once per colour, and must name one.
    expect(OSMICE.legalActions(s, 0).filter((a) => a.type === 'PLAY' && a.cardId === 'wild-0').length).toBe(4);
    expect(() => play(s, { type: 'PLAY', seat: 0, cardId: 'wild-0' })).toThrow(/needs a colour/);
    expect(() => play(s, { type: 'PLAY', seat: 0, cardId: 'blue-6-0' })).toThrow(/cannot go on the pile/);
    const after = play(s, { type: 'PLAY', seat: 0, cardId: 'wild-0', colour: 'green' });
    expect(after.colour).toBe('green');
    expect(after.turn).toBe(1);
  });

  it('a draw-four only without the active colour', () => {
    const withRed = position([[C('red-7-0'), C('wild4-0')], [C('gold-1-0')]], C('red-5-0'));
    expect(OSMICE.legalActions(withRed, 0).some((a) => a.type === 'PLAY' && a.cardId === 'wild4-0')).toBe(false);
    const noRed = position([[C('blue-7-0'), C('wild4-0')], [C('gold-1-0'), C('gold-2-0')], [C('gold-3-0')]], C('red-5-0'));
    const after = play(noRed, { type: 'PLAY', seat: 0, cardId: 'wild4-0', colour: 'blue' });
    expect(after.hands[1]!.length).toBe(2 + 4);
    expect(after.turn).toBe(2); // seat 1 drew four and missed the go
  });

  it('skip, reverse (a skip between two), and draw-two', () => {
    const three = (id: string) => position([[C(id), C('red-9-0')], [C('gold-1-0')], [C('gold-2-0')]], C('red-5-0'));
    expect(play(three('red-skip-0'), { type: 'PLAY', seat: 0, cardId: 'red-skip-0' }).turn).toBe(2);
    const rev = play(three('red-reverse-0'), { type: 'PLAY', seat: 0, cardId: 'red-reverse-0' });
    expect(rev.direction).toBe(-1);
    expect(rev.turn).toBe(2);
    const d2 = play(three('red-draw2-0'), { type: 'PLAY', seat: 0, cardId: 'red-draw2-0' });
    expect(d2.hands[1]!.length).toBe(3);
    expect(d2.turn).toBe(2);
    const two = position([[C('red-reverse-0'), C('red-9-0')], [C('gold-1-0')]], C('red-5-0'));
    expect(play(two, { type: 'PLAY', seat: 0, cardId: 'red-reverse-0' }).turn).toBe(0);
  });

  it('draw one: a playable card may be played or kept, an unplayable one ends the turn', () => {
    const s = position([[C('blue-1-0')], [C('gold-1-0')]], C('red-5-0'));
    s.drawPile.push(C('red-8-0'));
    const drew = play(s, { type: 'DRAW', seat: 0 });
    expect(drew.turn).toBe(0);
    expect(drew.drawn!.id).toBe('red-8-0');
    expect(OSMICE.legalActions(drew, 0).map((a) => a.type).sort()).toEqual(['PASS', 'PLAY']);
    expect(() => play(drew, { type: 'PLAY', seat: 0, cardId: 'blue-1-0' })).toThrow(/only the drawn card/);
    expect(play(drew, { type: 'PASS', seat: 0 }).turn).toBe(1);

    const t = position([[C('blue-1-0')], [C('gold-1-0')]], C('red-5-0'));
    t.drawPile.push(C('green-8-0'));
    const miss = play(t, { type: 'DRAW', seat: 0 });
    expect(miss.turn).toBe(1);
    expect(miss.drewOn[0]).toEqual(['red']);
    expect(() => play(t, { type: 'PASS', seat: 0 })).toThrow(/only after drawing/);
  });

  it('stacked draws pass the pile on, or the one who stops it takes it all', () => {
    const s = position([[C('red-draw2-0'), C('red-1-0')], [C('blue-draw2-0'), C('blue-1-0')], [C('gold-1-0'), C('gold-2-0')]], C('red-5-0'), {
      config: { ...OSMICE.defaultConfig, stackDraws: true },
    });
    const a = play(s, { type: 'PLAY', seat: 0, cardId: 'red-draw2-0' });
    expect(a.pendingDraw).toBe(2);
    expect(OSMICE.legalActions(a, 1).map((x) => x.type).sort()).toEqual(['DRAW', 'PLAY']);
    const b = play(a, { type: 'PLAY', seat: 1, cardId: 'blue-draw2-0' });
    expect(b.pendingDraw).toBe(4);
    const c = play(b, { type: 'DRAW', seat: 2 });
    expect(c.hands[2]!.length).toBe(6);
    expect(c.pendingDraw).toBe(0);
    expect(c.turn).toBe(0);
  });

  it('going out scores what everyone else holds', () => {
    const s = position([[C('red-7-0')], [C('wild-0'), C('blue-skip-0'), C('gold-3-0')], [C('green-9-0')]], C('red-5-0'));
    const after = play(s, { type: 'PLAY', seat: 0, cardId: 'red-7-0' });
    expect(after.phase).toBe('ROUND_OVER');
    expect(after.lastRound).toEqual({ winner: 0, left: [0, 73, 9], points: 82 });
    expect(after.scores[0]).toBe(82);
  });

  it('the first card turned up is always a number', () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = OSMICE.startRound(OSMICE.createMatch({ seats: 4, seed }));
      expect(/^[0-9]$/.test(s.discard[0]!.value)).toBe(true);
      expect(s.hands.every((h) => h.length === 7)).toBe(true);
    }
  });
});

describe('moves off the wire', () => {
  const s = position([[C('red-7-0'), C('wild-0')], [C('gold-1-0')]], C('red-5-0'));
  it('are rebuilt from primitives and must be legal', () => {
    const a = OSMICE.normalize(s, 0, { type: 'PLAY', seat: 0, cardId: 'wild-0', colour: 'blue', junk: { x: 1 } });
    expect(a).toEqual({ type: 'PLAY', seat: 0, cardId: 'wild-0', colour: 'blue' });
    expect(OSMICE.normalize(s, 0, { type: 'PLAY', seat: 0, cardId: 'gold-1-0' })).toBeNull(); // not mine
    expect(OSMICE.normalize(s, 0, { type: 'PLAY', seat: 0, cardId: 'wild-0', colour: 'purple' })).toBeNull();
    expect(OSMICE.normalize(s, 0, { type: 'DRAW', seat: 1 })).toBeNull();
    expect(OSMICE.normalize(s, 0, { type: 'PASS', seat: 0 })).toBeNull();
    expect(OSMICE.normalize(s, 0, '__proto__')).toBeNull();
  });
});

describe('Osmice bots', () => {
  it('always choose a legal move, at every level', () => {
    for (const level of ['easy', 'medium', 'hard'] as BotLevel[]) {
      const session = new Session(OSMICE, { seats: 4, seed: 11, botLevel: level, config: { matchTarget: level === 'hard' ? 60 : 200 } });
      session.playWholeMatch();
      expect(session.matchOver()).toBe(true);
    }
  });

  it('defaultAction is a legal move', () => {
    const session = new Session(OSMICE, { seats: 3, seed: 5, humanSeats: [0, 1, 2] });
    const seat = session.actors()[0]!;
    expect(session.legal(seat)).toContainEqual(OSMICE.defaultAction(session.state, seat, () => 0.5, 'medium'));
  });

  /** Two seats, every seed played from both sides so the deal cancels out. */
  const winRate = (a: BotLevel, b: BotLevel, matches: number) => {
    let wins = 0;
    for (let i = 0; i < matches; i++) {
      for (const aSeat of [0, 1]) {
        let state = OSMICE.startRound(OSMICE.createMatch({ seats: 2, seed: 1000 + i, config: { matchTarget: 200 } }));
        const rng = makeRng(77 + i);
        let guard = 0;
        while (state.phase !== 'MATCH_OVER' && guard++ < 50_000) {
          if (state.phase === 'ROUND_OVER') {
            state = OSMICE.startRound(state);
            continue;
          }
          const seat = OSMICE.actors(state)[0]!;
          state = OSMICE.apply(state, OSMICE.bot.decide(OSMICE.view(state, seat), rng, seat === aSeat ? a : b));
        }
        if (OSMICE.winners(state)![0] === aSeat) wins++;
      }
    }
    return wins / (matches * 2);
  };

  it('medium beats easy clearly, head to head', () => {
    // Measured over 1,200 games: 87%.
    expect(winRate('medium', 'easy', 150)).toBeGreaterThan(0.75);
  });

  it('hard beats easy too (its strength against medium is measured by the arena, not here: it looks ahead)', () => {
    expect(winRate('hard', 'easy', 15)).toBeGreaterThan(0.6);
  });
});
