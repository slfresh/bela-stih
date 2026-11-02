import { describe, expect, it } from 'vitest';
import { parseCard, publicView, type GameState } from '@belot/engine';
import { Session, findLeaks } from '@belot/game-core';
import { BELA, cleanAction } from '@belot/games-bela';

/**
 * The Bela module behind the game contract: its secrets really are what each
 * seat may not see, its normaliser is the room's, and a session over it plays
 * the game to a winner the way the table always has.
 */

/** A card crosses the wire as `{suit, rank}`; match it in either key order. */
const spellCard = (id: string): string[] => {
  const c = parseCard(id);
  return [JSON.stringify({ suit: c.suit, rank: c.rank }), JSON.stringify({ rank: c.rank, suit: c.suit })];
};

function* statesOf(seed: number): Generator<GameState> {
  const session = new Session(BELA, { seats: 4, seed, humanSeats: [0, 1, 2, 3] });
  let guard = 0;
  while (!session.matchOver() && guard++ < 2000) {
    yield session.state;
    if (session.roundOver()) session.startNextRound();
    else session.botMoveFor(session.actors()[0]!);
  }
  yield session.state;
}

describe('BELA secrets and views', () => {
  it('no seat ever sees a card it may not, across whole matches', () => {
    let checked = 0;
    for (const seed of [1, 2, 3]) {
      for (const s of statesOf(seed)) {
        expect(findLeaks(BELA, s, 4, spellCard)).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('the check would catch a view that shows every hand', () => {
    const leaky = { ...BELA, view: (s: GameState, seat: number) => ({ ...publicView(s, seat as 0), all: s.hands }) };
    const s = new Session(BELA, { seats: 4, seed: 9, humanSeats: [0, 1, 2, 3] }).state;
    expect(findLeaks(leaky, s, 4, spellCard).length).toBeGreaterThan(0);
  });

  it('meta is a 4-seat, two-team game that seats friends as partners', () => {
    expect(BELA.meta.minPlayers).toBe(4);
    expect(BELA.meta.maxPlayers).toBe(4);
    expect([0, 1, 2, 3].map((s) => BELA.meta.teams!.teamOf(s, 4))).toEqual([0, 1, 0, 1]);
    expect(BELA.meta.seatFillOrder!(4)).toEqual([0, 2, 1, 3]);
    expect(() => BELA.createMatch({ seats: 3, seed: 1 })).toThrow(/exactly 4/);
  });

  it('declarationSkipped is the one private event', () => {
    expect(BELA.isEventPublic({ kind: 'declarationSkipped', seat: 1 })).toBe(false);
    expect(BELA.isEventPublic({ kind: 'bidPassed', seat: 1 })).toBe(true);
  });
});

describe('BELA.normalize (the room cleanAction)', () => {
  const s = new Session(BELA, { seats: 4, seed: 5, humanSeats: [0, 1, 2, 3] }).state;
  it('rebuilds a well-formed action as a fresh object', () => {
    const raw = { type: 'PLAY_CARD', seat: 2, card: { suit: 'hearts', rank: 'A', extra: 1 }, announceBela: true };
    const a = BELA.normalize(s, 2, raw)!;
    expect(a).toEqual({ type: 'PLAY_CARD', seat: 2, card: { suit: 'hearts', rank: 'A' }, announceBela: true });
    expect((a as { card: unknown }).card).not.toBe(raw.card);
  });
  it('refuses another seat, an unknown type, a bad card', () => {
    expect(BELA.normalize(s, 1, { type: 'BID_PASS', seat: 2 })).toBeNull();
    expect(BELA.normalize(s, 1, { type: 'CHEAT', seat: 1 })).toBeNull();
    expect(BELA.normalize(s, 1, { type: 'BID_CALL', seat: 1, suit: 'stars' })).toBeNull();
    expect(cleanAction(null, 0)).toBeNull();
  });
});

describe('a Session over BELA', () => {
  it('plays to a winning team, and defaultAction is a legal move', () => {
    const session = new Session(BELA, { seats: 4, seed: 12 });
    session.playWholeMatch();
    expect(session.matchOver()).toBe(true);
    expect([[0], [1]]).toContainEqual(session.winners());

    const live = new Session(BELA, { seats: 4, seed: 12, humanSeats: [0, 1, 2, 3] });
    const seat = live.actors()[0]!;
    const fallback = BELA.defaultAction(live.state, seat, () => 0.5, 'medium');
    expect(live.legal(seat)).toContainEqual(fallback);
    const moves = live.moveCount;
    live.closeWindow();
    expect(live.moveCount).toBe(moves + 1);
  });

  it('submitRaw goes through the normaliser and the engine', () => {
    const live = new Session(BELA, { seats: 4, seed: 12, humanSeats: [0, 1, 2, 3] });
    const seat = live.actors()[0]!;
    expect(live.submitRaw(seat, { type: 'BID_CALL', seat, suit: 'stars' })).toBe(false);
    expect(live.submitRaw((seat + 1) % 4, live.legal(seat)[0])).toBe(false);
    expect(live.submitRaw(seat, JSON.parse(JSON.stringify(live.legal(seat)[0])))).toBe(true);
  });
});
