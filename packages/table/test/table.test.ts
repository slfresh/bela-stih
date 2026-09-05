import { describe, expect, it } from 'vitest';
import { cardId, teamOf, type Action, type Card, type Seat } from '@belot/engine';
import { Table, type TableEvent } from '@belot/table';

/**
 * The table layer plays the bot seats by itself and reports what happened. These
 * tests pin both halves: that it always stops in a state a person can act on, and
 * that the event stream is a faithful, complete account of the deal.
 */

function kinds(events: TableEvent[]): string[] {
  return events.map((e) => e.kind);
}

describe('an all-bot table', () => {
  it('plays a whole match to a winner without intervention', () => {
    const t = new Table({ seed: 21 });
    expect(t.humanSeats.size).toBe(0);
    t.playWholeMatch();

    expect(t.phase).toBe('MATCH_OVER');
    const winner = t.winner()!;
    expect([0, 1]).toContain(winner);
    expect(Math.max(...t.matchScores)).toBeGreaterThanOrEqual(1001);

    const events = t.drainEvents();
    expect(kinds(events)).toContain('matchOver');
    expect(events.filter((e) => e.kind === 'dealScored').length).toBeGreaterThan(1);
  });

  it('is reproducible from a seed', () => {
    const a = new Table({ seed: 99 });
    const b = new Table({ seed: 99 });
    a.playWholeMatch();
    b.playWholeMatch();
    expect(a.matchScores).toEqual(b.matchScores);
    expect(JSON.stringify(kinds(a.drainEvents()))).toBe(JSON.stringify(kinds(b.drainEvents())));
  });

  it('refuses playWholeMatch when a person holds a seat', () => {
    const t = new Table({ seed: 3, humanSeats: [0] });
    expect(() => t.playWholeMatch()).toThrow(/all-bot table/);
  });
});

describe('a table with a person at seat 0', () => {
  it('stops on the human and offers them legal actions', () => {
    const t = new Table({ seed: 5, humanSeats: [0] });
    expect(t.isHumanTurn()).toBe(true);
    expect(t.actor()).toBe(0);
    expect(t.legal().length).toBeGreaterThan(0);
    for (const a of t.legal()) expect(a.seat).toBe(0);
  });

  it('runs the bots forward after the person acts', () => {
    const t = new Table({ seed: 5, humanSeats: [0] });
    t.drainEvents();
    t.submit(t.legal()[0]!);
    // Either it came back round to the person, or the deal has been scored.
    expect(t.isHumanTurn() || t.actor() === null).toBe(true);
    expect(t.drainEvents().length).toBeGreaterThan(0);
  });

  it('rejects an action for a seat the person does not hold', () => {
    const t = new Table({ seed: 5, humanSeats: [0] });
    const bogus: Action = { type: 'BID_PASS', seat: 1 };
    expect(() => t.submit(bogus)).toThrow(/seat 0's turn/);
  });

  it('rejects an action while the bots are still to move', () => {
    const t = new Table({ seed: 5, humanSeats: [2] });
    // Seat 0 opens the bidding, so it is not the person's turn yet.
    if (t.actor() !== 2) {
      expect(() => t.submit({ type: 'BID_PASS', seat: 2 })).toThrow(/played by a bot/);
    }
  });

  it('plays a full match through the human seat', () => {
    const t = new Table({ seed: 8, humanSeats: [0] });
    let guard = 0;
    while (t.phase !== 'MATCH_OVER') {
      if (guard++ > 20_000) throw new Error('match did not finish');
      if (t.phase === 'DEAL_OVER') {
        t.startNextDeal();
        continue;
      }
      expect(t.isHumanTurn()).toBe(true); // bots never leave us mid-turn
      t.submit(t.legal()[0]!);
    }
    expect(Math.max(...t.matchScores)).toBeGreaterThanOrEqual(1001);
  });

  it('never hands the person another seat’s cards', () => {
    const t = new Table({ seed: 13, humanSeats: [0] });
    const view = t.view(0);
    const others = new Set(
      ([1, 2, 3] as Seat[]).flatMap((s) => t.state.hands[s]!.map(cardId)),
    );
    const seen = collectCards(view).map(cardId);
    expect(seen.filter((id) => others.has(id))).toEqual([]);
  });
});

/** How a disconnect is survived online: the seat becomes a bot and play carries on. */
describe('handing a seat to a bot and back', () => {
  it('lets a bot take over a seat mid-game and finish the deal', () => {
    const t = new Table({ seed: 5, humanSeats: [0] });
    expect(t.isHumanTurn()).toBe(true);

    t.setSeatHuman(0, false); // the player drops
    expect(t.humanSeats.has(0)).toBe(false);
    // With nobody human left, the bots run the deal to its end unaided.
    expect(t.actor()).toBeNull();
    expect(['DEAL_OVER', 'MATCH_OVER']).toContain(t.phase);
  });

  it('gives the seat back and stops for the player again', () => {
    const t = new Table({ seed: 5, humanSeats: [0, 1] });
    t.setSeatHuman(0, false);
    // Seat 1 is still human, so the table must still stop for somebody.
    expect(t.actor()).not.toBeNull();

    t.setSeatHuman(0, true);
    expect(t.humanSeats.has(0)).toBe(true);
    let guard = 0;
    while (t.phase !== 'MATCH_OVER' && guard++ < 20_000) {
      if (t.phase === 'DEAL_OVER') {
        t.startNextDeal();
        continue;
      }
      expect(t.isHumanTurn()).toBe(true);
      t.submit(t.legal()[0]!);
    }
    expect(Math.max(...t.matchScores)).toBeGreaterThanOrEqual(1001);
  });

  it('runs a four-human table that never moves without input', () => {
    const t = new Table({ seed: 9, humanSeats: [0, 1, 2, 3] });
    let guard = 0;
    while (t.phase !== 'MATCH_OVER') {
      if (guard++ > 40_000) throw new Error('match did not finish');
      if (t.phase === 'DEAL_OVER') {
        t.startNextDeal();
        continue;
      }
      // Every single decision belongs to a person.
      expect(t.isHumanTurn()).toBe(true);
      t.submit(t.legal()[0]!);
    }
    expect(Math.max(...t.matchScores)).toBeGreaterThanOrEqual(1001);
  });
});

describe('the event stream', () => {
  /** Collect every event of one complete deal from a fresh all-bot table. */
  function firstDeal(seed: number): TableEvent[] {
    const t = new Table({ seed });
    t.runBots();
    return t.drainEvents();
  }

  it('opens with a deal and closes with a score', () => {
    const events = firstDeal(31);
    expect(events[0]!.kind).toBe('dealStarted');
    expect(events.at(-1)!.kind).toBe('dealScored');
  });

  it('reports the contract once doubling has closed', () => {
    const events = firstDeal(31);
    const done = events.find((e) => e.kind === 'handsCompleted');
    expect(done).toBeDefined();
    if (done?.kind === 'handsCompleted') {
      expect(['spades', 'hearts', 'diamonds', 'clubs']).toContain(done.trumpSuit);
      expect([1, 2, 4]).toContain(done.multiplier);
    }
  });

  it('accounts for all 32 cards and all 8 tricks', () => {
    const events = firstDeal(31);
    const played = events.filter((e) => e.kind === 'cardPlayed');
    expect(played).toHaveLength(32);
    const ids = played.map((e) => cardId((e as { card: Card }).card));
    expect(new Set(ids).size).toBe(32);

    const tricks = events.filter((e) => e.kind === 'trickWon');
    expect(tricks).toHaveLength(8);
    expect(tricks.map((e) => (e as { trickNumber: number }).trickNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(tricks.filter((e) => (e as { isLastTrick: boolean }).isLastTrick)).toHaveLength(1);
  });

  it('adds the trick points up to the 152 on the table', () => {
    const events = firstDeal(31);
    const total = events
      .filter((e) => e.kind === 'trickWon')
      .reduce((sum, e) => sum + (e as { points: number }).points, 0);
    expect(total).toBe(152);
  });

  it('settles every seat’s zvanja exactly once before the cards fly', () => {
    const events = firstDeal(31);
    const settled = events.filter(
      (e) => e.kind === 'declared' || e.kind === 'declarationSkipped',
    );
    const seats = settled.map((e) => (e as { seat: Seat }).seat);
    expect(new Set(seats).size).toBe(seats.length); // never twice for one seat

    // Each settlement lands before that seat's first card.
    for (const seat of seats) {
      const settledAt = events.findIndex(
        (e) => (e.kind === 'declared' || e.kind === 'declarationSkipped') && e.seat === seat,
      );
      const firstCardAt = events.findIndex((e) => e.kind === 'cardPlayed' && e.seat === seat);
      expect(settledAt).toBeLessThan(firstCardAt);
    }
  });

  it('announces bela immediately before the card that carries it', () => {
    // The medium bot always calls, so any dealt pair shows up in the stream.
    for (let seed = 1; seed < 60; seed++) {
      const events = firstDeal(seed);
      const at = events.findIndex((e) => e.kind === 'belaCalled');
      if (at < 0) continue;

      const call = events[at] as { seat: Seat };
      const next = events[at + 1]!;
      expect(next.kind).toBe('cardPlayed');
      if (next.kind === 'cardPlayed') {
        expect(next.seat).toBe(call.seat);
        expect(['K', 'Q']).toContain(next.card.rank);
      }
      // And the deal pays the 20 to that seat's team.
      const scored = events.find((e) => e.kind === 'dealScored');
      if (scored?.kind === 'dealScored') {
        expect(scored.result.bela[teamOf(call.seat)]).toBe(20);
      }
      return;
    }
    throw new Error('no seed produced a bela');
  });

  it('matches the score it reports against the running match total', () => {
    const t = new Table({ seed: 44 });
    t.runBots();
    const scored = t.drainEvents().find((e) => e.kind === 'dealScored');
    expect(scored).toBeDefined();
    if (scored?.kind === 'dealScored') {
      expect(scored.matchScores).toEqual(t.matchScores);
      expect(scored.result.finalScore[0] + scored.result.finalScore[1]).toBeGreaterThan(0);
    }
  });

  it('empties on drain', () => {
    const t = new Table({ seed: 7 });
    t.runBots();
    expect(t.drainEvents().length).toBeGreaterThan(0);
    expect(t.drainEvents()).toEqual([]);
  });
});

describe('dealing on', () => {
  it('refuses to deal while a hand is in progress', () => {
    const t = new Table({ seed: 7, humanSeats: [0] });
    expect(() => t.startNextDeal()).toThrow(/cannot deal from phase/);
  });

  it('rotates the dealer and reports the new deal', () => {
    const t = new Table({ seed: 7 });
    t.runBots();
    expect(t.phase).toBe('DEAL_OVER');
    const dealerBefore = t.state.dealer;
    t.drainEvents();
    t.startNextDeal();
    const started = t.drainEvents().find((e) => e.kind === 'dealStarted');
    expect(started).toBeDefined();
    if (started?.kind === 'dealStarted') expect(started.dealer).toBe(dealerBefore);
  });
});

function collectCards(value: unknown, out: Card[] = []): Card[] {
  if (Array.isArray(value)) {
    for (const v of value) collectCards(v, out);
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.suit === 'string' && typeof o.rank === 'string') out.push(o as unknown as Card);
    else for (const v of Object.values(o)) collectCards(v, out);
  }
  return out;
}

describe('starting a new match at the same table', () => {
  function finished(): Table {
    const t = new Table({ seed: 5 });
    t.playWholeMatch();
    t.drainEvents();
    return t;
  }

  it('refuses to discard a match that is still being played', () => {
    const t = new Table({ seed: 5 });
    expect(() => t.newMatch()).toThrow(/cannot start a new match/);
  });

  it('resets the score and deals again, keeping the seats', () => {
    const t = finished();
    const humansBefore = [...t.humanSeats];
    const wonWith = Math.max(...t.matchScores);
    t.newMatch();

    // An all-bot table plays its first deal out the moment it is dealt, so the
    // score is a single deal's worth rather than a literal 0:0 — what matters
    // is that the finished match's total is gone.
    expect(Math.max(...t.matchScores)).toBeLessThan(wonWith);
    expect(t.matchScores[0] + t.matchScores[1]).toBeLessThanOrEqual(252);
    expect(t.phase).not.toBe('MATCH_OVER');
    expect([...t.humanSeats]).toEqual(humansBefore);

    const kinds = t.drainEvents().map((e) => e.kind);
    expect(kinds[0]).toBe('matchStarted');
    expect(kinds[1]).toBe('dealStarted');
  });

  it('carries the dealer rotation on instead of snapping back', () => {
    const t = finished();
    const dealerBefore = t.state.dealer;
    t.newMatch();
    const started = t.drainEvents().find((e) => e.kind === 'dealStarted');
    expect(started && started.kind === 'dealStarted' && started.dealer).toBe(dealerBefore);
  });

  it('keeps the engine config', () => {
    const t = new Table({ seed: 5, config: { renonsMode: 'punish', declarationMode: 'blind' } });
    t.playWholeMatch();
    t.newMatch();
    expect(t.state.config.renonsMode).toBe('punish');
    expect(t.state.config.declarationMode).toBe('blind');
  });

  it('does not replay the finished match — the bot RNG carries on', () => {
    const t = new Table({ seed: 5 });
    t.playWholeMatch();
    const first = t.matchScores.join(':');
    t.newMatch();
    t.playWholeMatch();
    const second = t.matchScores.join(':');
    // Two independent matches; identical totals would mean the RNG reset.
    expect(second).not.toBe(first);
  });

  it('drops events left undrained from the finished match', () => {
    const t = new Table({ seed: 5 });
    t.playWholeMatch(); // events deliberately NOT drained
    t.newMatch();
    const kinds = t.drainEvents().map((e) => e.kind);
    expect(kinds).not.toContain('matchOver');
    expect(kinds[0]).toBe('matchStarted');
  });
});

/**
 * The turn clock is keyed on these two together, so they are load-bearing well
 * beyond the Table: keying a clock on the SEAT alone gave two consecutive
 * decisions by the same player one shared 30 seconds, and — because a timeout
 * usually leaves that same seat on turn — stopped the server arming a clock at
 * all, freezing the table for everybody.
 */
describe('botMoveFor and moveCount', () => {
  it('counts every applied action, and only applied ones', () => {
    const t = new Table({ seed: 11, humanSeats: [0] });
    const before = t.moveCount;
    expect(before).toBeGreaterThan(0); // the constructor's bot run

    // A rejected action must not advance the count.
    expect(() => t.submit({ type: 'BID_PASS', seat: 1 })).toThrow();
    expect(t.moveCount).toBe(before);

    t.submit(t.legal()[0]!);
    expect(t.moveCount).toBeGreaterThan(before);
  });

  it('gives consecutive decisions by the same seat different identities', () => {
    // The exact thing a seat-keyed clock could not tell apart.
    const t = new Table({ seed: 3, humanSeats: [0] });
    const seen = new Set<string>();
    let guard = 0;
    while (t.phase !== 'DEAL_OVER' && t.phase !== 'MATCH_OVER' && guard++ < 200) {
      const actor = t.actor();
      if (actor === null) break;
      const key = `${actor}:${t.moveCount}`;
      expect(seen.has(key)).toBe(false); // never reused
      seen.add(key);
      if (actor === 0) t.submit(t.legal()[0]!);
      else t.runBots();
    }
    expect(seen.size).toBeGreaterThan(8);
  });

  it('plays exactly one action and leaves the seat human', () => {
    const t = new Table({ seed: 7, humanSeats: [0] });
    let guard = 0;
    while (t.actor() !== 0 && t.actor() !== null && guard++ < 200) t.runBots();
    expect(t.actor()).toBe(0);

    const before = t.moveCount;
    t.botMoveFor(0);
    // One action for seat 0, then the bots advance to the next human decision
    // — which, with only one human, means back to seat 0 or the deal's end.
    expect(t.moveCount).toBeGreaterThan(before);
    expect(t.humanSeats.has(0)).toBe(true);
    if (t.phase === 'PLAY') expect(t.actor()).toBe(0);
  });

  it('never plays the whole deal out from under its only human', () => {
    // The bug: setSeatHuman(seat, false) runs the bots until the next HUMAN
    // seat, and with one human there is none to stop at.
    for (let seed = 1; seed <= 40; seed++) {
      const t = new Table({ seed, humanSeats: [0] });
      let guard = 0;
      while (t.actor() !== 0 && t.actor() !== null && guard++ < 200) t.runBots();
      if (t.actor() !== 0 || t.phase !== 'PLAY') continue;
      const held = t.state.hands[0]!.length;
      t.botMoveFor(0);
      expect(held - t.state.hands[0]!.length).toBeLessThanOrEqual(1);
      expect(t.phase).toBe('PLAY');
    }
  });

  it('is a no-op when it is not that seat’s turn', () => {
    const t = new Table({ seed: 9, humanSeats: [0] });
    let guard = 0;
    while (t.actor() !== 0 && t.actor() !== null && guard++ < 200) t.runBots();
    const before = t.moveCount;
    const notActor = ((t.actor()! + 1) % 4) as Seat;
    t.botMoveFor(notActor);
    expect(t.moveCount).toBe(before);
  });
});
