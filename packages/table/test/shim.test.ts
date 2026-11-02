import { describe, expect, it } from 'vitest';
import { HARD_CONFIG_OVERRIDES, makeRng, type Action, type EngineConfig, type Seat } from '@belot/engine';
import type { BotLevel } from '@belot/bots';
import { Table } from '@belot/table';
import { Table as LegacyTable } from './legacyTable';

/**
 * `Table` is now a shim over `Session<BELA>`. This pins it, step for step,
 * against a frozen copy of the class it replaced (`legacyTable.ts`): the same
 * events, the same view for every seat, the same actor, the same move count,
 * across bot levels, rule overlays, human seats, disconnects, turn timeouts and
 * rematches. Delete both files once nothing depends on the old shape.
 */

type Either = Table | LegacyTable;
const SEATS: Seat[] = [0, 1, 2, 3];

function snapshot(t: Either) {
  return JSON.stringify({
    events: t.drainEvents(),
    views: SEATS.map((s) => t.view(s)),
    actor: t.actor(),
    phase: t.phase,
    moves: t.moveCount,
    scores: t.matchScores,
    winner: t.winner(),
    legal: t.legal(),
  });
}

interface Scenario {
  name: string;
  seed: number;
  humans: Seat[];
  level?: BotLevel;
  config?: Partial<EngineConfig>;
  injected?: boolean;
}

const SCENARIOS: Scenario[] = [
  { name: 'all bots, medium', seed: 21, humans: [] },
  { name: 'all bots, hard', seed: 4, humans: [], level: 'hard' },
  { name: 'all bots, easy, 501', seed: 77, humans: [], level: 'easy', config: { matchTarget: 501 } },
  { name: 'one human, blind zvanja', seed: 5, humans: [0], config: { declarationMode: 'blind' } },
  { name: 'two humans, prava bela', seed: 13, humans: [0, 2], config: HARD_CONFIG_OVERRIDES },
  { name: 'kontra on, double win', seed: 31, humans: [1], config: { allowKontra: true, doubleWinBelow500: true } },
  { name: 'injected rng', seed: 0, humans: [3], injected: true },
];

function build(Kind: typeof Table | typeof LegacyTable, sc: Scenario): Either {
  return new Kind({
    seed: sc.seed,
    humanSeats: sc.humans,
    botLevel: sc.level,
    config: sc.config,
    // A fresh generator per table, from the same seed, so both draw the same stream.
    rng: sc.injected ? makeRng(0xbe1a) : undefined,
  });
}

/** Drive both tables identically: the human always takes a seeded choice among its legal actions. */
function playBoth(sc: Scenario, maxSteps = 4000): { steps: number; matches: number } {
  const a = build(Table, sc);
  const b = build(LegacyTable, sc);
  const pick = makeRng(sc.seed + 1);
  expect(snapshot(a)).toBe(snapshot(b));
  let steps = 0;
  let matches = 0;
  while (steps++ < maxSteps) {
    if (a.phase === 'MATCH_OVER') {
      if (++matches === 2) break;
      a.newMatch({ seed: sc.seed + 100 });
      b.newMatch({ seed: sc.seed + 100 });
    } else if (a.phase === 'DEAL_OVER') {
      a.startNextDeal();
      b.startNextDeal();
    } else if (a.isHumanTurn()) {
      const legal = a.legal();
      const action: Action = legal[Math.floor(pick() * legal.length)]!;
      // Every so often the person times out instead, and the bot moves for them.
      if (steps % 17 === 0) {
        const seat = a.actor()!;
        a.botMoveFor(seat);
        b.botMoveFor(seat);
      } else {
        a.submit(action);
        b.submit(action);
      }
    } else {
      a.runBots();
      b.runBots();
    }
    // A disconnect and a return, mid-deal.
    if (steps === 40 && sc.humans.length > 0) {
      a.setSeatHuman(sc.humans[0]!, false);
      b.setSeatHuman(sc.humans[0]!, false);
    }
    if (steps === 60 && sc.humans.length > 0) {
      a.setSeatHuman(sc.humans[0]!, true);
      b.setSeatHuman(sc.humans[0]!, true);
    }
    expect(snapshot(a)).toBe(snapshot(b));
    expect(a.matchWins()).toBe(b.matchWins());
  }
  return { steps, matches };
}

describe('Table over Session<BELA> is the old Table, step for step', () => {
  for (const sc of SCENARIOS) {
    it(sc.name, () => {
      // Two whole matches (the second a rematch), compared after every step.
      expect(playBoth(sc).matches).toBe(2);
    });
  }

  it('playWholeMatch ends identically', () => {
    for (const seed of [1, 2, 3]) {
      const a = new Table({ seed });
      const b = new LegacyTable({ seed });
      a.playWholeMatch();
      b.playWholeMatch();
      expect(snapshot(a)).toBe(snapshot(b));
    }
  });

  it('refuses the same things with the same words', () => {
    const errorOf = (f: () => void): string => {
      try {
        f();
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    };
    const pairs: [() => void, () => void][] = [
      [() => new Table({ seed: 5, humanSeats: [0] }).submit({ type: 'BID_PASS', seat: 1 }), () => new LegacyTable({ seed: 5, humanSeats: [0] }).submit({ type: 'BID_PASS', seat: 1 })],
      [() => new Table({ seed: 5, humanSeats: [2] }).submit({ type: 'BID_PASS', seat: 2 }), () => new LegacyTable({ seed: 5, humanSeats: [2] }).submit({ type: 'BID_PASS', seat: 2 })],
      [() => new Table({ seed: 5 }).newMatch(), () => new LegacyTable({ seed: 5 }).newMatch()],
      [() => new Table({ seed: 5, humanSeats: [0] }).startNextDeal(), () => new LegacyTable({ seed: 5, humanSeats: [0] }).startNextDeal()],
      [() => new Table({ seed: 5, humanSeats: [0] }).playWholeMatch(), () => new LegacyTable({ seed: 5, humanSeats: [0] }).playWholeMatch()],
    ];
    let refused = 0;
    for (const [now, was] of pairs) {
      const msg = errorOf(now);
      if (msg !== '') refused += 1;
      expect(msg).toBe(errorOf(was));
    }
    expect(refused).toBeGreaterThanOrEqual(4);
  });
});
