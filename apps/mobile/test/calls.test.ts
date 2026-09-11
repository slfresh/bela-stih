import { describe, expect, it } from 'vitest';
import type { Action, DeclarationSummary, PublicView, Seat } from '@belot/engine';
import { Table } from '@belot/table';
import { Director, ZERO_TIMINGS } from '../src/anim/director';
import { applyEventEnd, applyEventStart } from '../src/anim/patch';
import { callsOnTable } from '../src/table/calls';

/**
 * The zvanja are said once, at the start of the deal: a call has its chip while
 * the table is still being asked, the round's close hands over to the reveal,
 * and after the first lead nothing about the zvanja is on screen — bela
 * included. The player asked for exactly this: "show the winning zvanje one
 * time at the beginning of the deal, then it disappears; remember it".
 */

type CallsView = Parameters<typeof callsOnTable>[0];

const call = (seat: Seat, value: number): DeclarationSummary => ({
  kind: 'sequence',
  value,
  length: value === 20 ? 3 : 4,
  topRank: 'A',
  seat,
});

const asking: CallsView = {
  announcedDeclarations: [],
  revealedDeclarations: [],
  handCounts: [8, 8, 8, 8],
};

/** Bid the first suit offered, announce whatever is held, call bela, play the first legal card. */
function choose(legal: Action[]): Action {
  return (
    legal.find((a) => a.type === 'BID_CALL') ??
    legal.find((a) => a.type === 'DECLARE_ANNOUNCE' && a.cards !== undefined) ??
    legal.find((a) => a.type === 'DOUBLE_PASS') ??
    legal.find((a) => a.type === 'DECLARE_SKIP') ??
    legal.find((a) => a.type === 'PLAY_CARD' && a.announceBela === true) ??
    legal[0]!
  );
}

describe('callsOnTable', () => {
  it('shows each call while the table is still being asked', () => {
    const one = { ...asking, announcedDeclarations: [call(1, 20)] };
    expect(callsOnTable(one)).toEqual([call(1, 20)]);
    const two = { ...asking, announcedDeclarations: [call(1, 20), call(2, 50)] };
    expect(callsOnTable(two)).toEqual([call(1, 20), call(2, 50)]);
  });

  it('shows nothing once the winning side is laid out, the losers included', () => {
    const v = {
      ...asking,
      announcedDeclarations: [call(1, 20), call(2, 50)],
      revealedDeclarations: [{ ...call(2, 50), cards: [] }] as unknown as PublicView['revealedDeclarations'],
    };
    expect(callsOnTable(v)).toEqual([]);
  });

  it('shows nothing once a card has left a hand, even with no reveal (a cancelled tie)', () => {
    const tie = { ...asking, announcedDeclarations: [call(1, 20), call(2, 20)] };
    expect(callsOnTable(tie)).toHaveLength(2);
    // The lead sets off; and the first trick's sweep, its slots empty and its count not yet in.
    expect(callsOnTable({ ...tie, handCounts: [8, 7, 8, 8] })).toEqual([]);
    expect(callsOnTable({ ...tie, handCounts: [7, 7, 7, 7] })).toEqual([]);
  });

  it("a call's chip goes up with its bubble, once — not a gap's flash before the reveal", () => {
    const table = new Table({ seed: 5, humanSeats: [0, 1, 2, 3] });
    const v0: PublicView = { ...table.view(0), announcedDeclarations: [], revealedDeclarations: [], handCounts: [8, 8, 8, 8] };
    const e = { kind: 'declared' as const, seat: 1 as Seat, declarations: [call(1, 50)] };
    const started = applyEventStart(v0, e, 0);
    expect(callsOnTable(started)).toEqual([call(1, 50)]);
    expect(applyEventEnd(started, e, v0, 0).announcedDeclarations).toEqual([call(1, 50)]);
  });

  it('through real deals, on the engine: chips only before the round closes, never after the lead', () => {
    let rounds = 0;
    let reveals = 0;
    let belas = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const table = new Table({ seed, humanSeats: [0, 1, 2, 3] });
      let led = false;
      let guard = 0;
      while (table.phase !== 'DEAL_OVER' && table.phase !== 'MATCH_OVER') {
        if (guard++ > 400) throw new Error(`seed ${seed}: the deal did not finish`);
        const v = table.view(0);
        const shown = callsOnTable(v);
        if (v.declareTurn !== null) {
          // Asking: every call said so far has its chip.
          expect(shown).toEqual(v.announcedDeclarations);
          if (v.announcedDeclarations.length > 0) rounds++;
        } else if (v.phase === 'PLAY' && v.revealedDeclarations.length > 0) {
          reveals++;
          expect(shown).toEqual([]);
        }
        if (led) expect(shown, `seed ${seed}: a chip after the lead`).toEqual([]);
        if (led && v.belaAnnouncedBy !== null) belas++;
        const pick = choose(table.legal());
        expect(pick.seat).toBe(table.actor());
        if (pick.type === 'PLAY_CARD') led = true;
        table.submit(pick);
      }
    }
    // The walk really crossed every moment it claims to check.
    expect(rounds).toBeGreaterThan(0);
    expect(reveals).toBeGreaterThan(0);
    expect(belas).toBeGreaterThan(0);
  });

  it('through real deals, on every frame the director paces: never a chip once a card has set off', () => {
    // The engine's views never show the sweep's in-between beat — the paced
    // view does: the web build brought the first-trick chips back for the
    // length of the sweep until the close was read from the hands.
    let frames = 0;
    let chipFrames = 0;
    let afterLead = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const table = new Table({ seed, humanSeats: [0, 1, 2, 3] });
      let led = false;
      const d = new Director(0, table.view(0), {
        onView: (v) => {
          frames++;
          const shown = callsOnTable(v);
          if (shown.length > 0) chipFrames++;
          if (led) {
            afterLead++;
            expect(shown, `seed ${seed}: a chip on a paced frame after the lead`).toEqual([]);
          }
        },
        onEventStart: (e) => {
          if (e.kind === 'dealStarted') led = false;
          if (e.kind === 'cardPlayed') led = true;
        },
        onIdle: () => {},
      }, ZERO_TIMINGS);
      d.enqueue({ events: table.drainEvents(), finalView: table.view(0) });
      let guard = 0;
      while (table.phase !== 'DEAL_OVER' && table.phase !== 'MATCH_OVER') {
        if (guard++ > 400) throw new Error(`seed ${seed}: the deal did not finish`);
        table.submit(choose(table.legal()));
        d.enqueue({ events: table.drainEvents(), finalView: table.view(0) });
      }
      d.dispose();
    }
    expect(chipFrames).toBeGreaterThan(0);
    expect(afterLead).toBeGreaterThan(frames / 2);
  });
});
