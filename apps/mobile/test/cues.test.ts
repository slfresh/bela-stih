import { describe, expect, it } from 'vitest';
import { Table, type TableEvent } from '@belot/table';
import { cueFor, declarationWeight } from '../src/table/cues';

/** The table's own reactions: computed from the event, pure, and testable. */

describe('declarationWeight', () => {
  it('grows with the summed value: 20 / 50 / 100 / 150 and up', () => {
    expect(declarationWeight([20])).toBe(1);
    expect(declarationWeight([20, 20])).toBe(1);
    expect(declarationWeight([50])).toBe(2);
    expect(declarationWeight([100])).toBe(3);
    expect(declarationWeight([50, 50, 20])).toBe(3);
    expect(declarationWeight([150])).toBe(4);
    expect(declarationWeight([])).toBe(1);
  });
});

describe('cueFor', () => {
  // A human at seat 0, so the view holds a hand to find royals in.
  const table = new Table({ seed: 3, humanSeats: [0] });
  const view = table.view(0);

  it('a pass nods the passer; kontra shakes the felt, rekontra harder', () => {
    expect(cueFor({ kind: 'bidPassed', seat: 2 }, 0, view, 1)).toEqual({ kind: 'nod', seat: 2, n: 1 });
    expect(cueFor({ kind: 'doublePassed', seat: 1 }, 0, view, 2)).toEqual({ kind: 'nod', seat: 1, n: 2 });
    expect(cueFor({ kind: 'doubled', seat: 1, multiplier: 2 }, 0, view, 3)).toEqual({ kind: 'shake', amp: 3, n: 3 });
    expect(cueFor({ kind: 'doubled', seat: 1, multiplier: 4 }, 0, view, 4)).toEqual({ kind: 'shake', amp: 5, n: 4 });
  });

  it('only a big zvanje pulses the announcer', () => {
    const small: TableEvent = {
      kind: 'declared',
      seat: 3,
      declarations: [{ kind: 'sequence', value: 20, length: 3, topRank: 'K', seat: 3 }],
    };
    const big: TableEvent = {
      kind: 'declared',
      seat: 3,
      declarations: [{ kind: 'sequence', value: 100, length: 5, topRank: 'A', seat: 3 }],
    };
    expect(cueFor(small, 0, view, 1)).toBeNull();
    expect(cueFor(big, 0, view, 1)).toEqual({ kind: 'pulse', seat: 3, n: 1 });
  });

  it("another player's bela pulses them; my own glows my trump king and queen", () => {
    expect(cueFor({ kind: 'belaCalled', seat: 2 }, 0, view, 1)).toEqual({ kind: 'pulse', seat: 2, n: 1 });
    const trumpView = {
      ...view,
      context: { contractType: 'SUIT' as const, trumpSuit: view.hand[0]!.suit },
      hand: [
        { suit: view.hand[0]!.suit, rank: 'K' as const },
        { suit: view.hand[0]!.suit, rank: 'Q' as const },
        { suit: view.hand[0]!.suit, rank: '7' as const },
      ],
    };
    const cue = cueFor({ kind: 'belaCalled', seat: 0 }, 0, trumpView, 5);
    expect(cue?.kind).toBe('glow');
    if (cue?.kind === 'glow') expect(cue.cardIds).toHaveLength(2);
  });

  it('a štiglja shakes the table; an ordinary deal does not', () => {
    const scored = (() => {
      const t = new Table({ seed: 7, humanSeats: [] });
      return t.drainEvents().find((e): e is Extract<TableEvent, { kind: 'dealScored' }> => e.kind === 'dealScored')!;
    })();
    expect(cueFor({ ...scored, result: { ...scored.result, valatTeam: 0 } }, 0, view, 9)).toEqual({ kind: 'stiglja', n: 9 });
    expect(cueFor({ ...scored, result: { ...scored.result, valatTeam: null } }, 0, view, 9)).toBeNull();
  });

  it('a seatless beat, a card, a trick: no cue', () => {
    expect(cueFor({ kind: 'matchStarted', matchNumber: 2 }, 0, view, 1)).toBeNull();
    expect(cueFor({ kind: 'trickWon', seat: 1, trickNumber: 1, points: 10, isLastTrick: false }, 0, view, 1)).toBeNull();
  });
});
