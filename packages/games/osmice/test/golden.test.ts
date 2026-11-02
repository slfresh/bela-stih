import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Session, canonical, makeRng } from '@belot/game-core';
import { OSMICE, type OsmiceConfig } from '@belot/games-osmice';

/**
 * The Osmice golden corpus: seeded matches, every move's action, every seat's
 * view and the events it produced, hashed round by round and committed. A hash
 * that moves is a rules change, named by scenario and round. Refresh on
 * purpose only:
 *
 *   GOLDEN_UPDATE=1 npx vitest run packages/games/osmice/test/golden.test.ts
 */

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'golden.json');

interface Scenario {
  name: string;
  seats: number;
  seed: number;
  config: Partial<OsmiceConfig>;
}

const SCENARIOS: Scenario[] = [
  { name: 'two players', seats: 2, seed: 1, config: { matchTarget: 600 } },
  { name: 'three players', seats: 3, seed: 2, config: { matchTarget: 600 } },
  { name: 'four players, stacked draws', seats: 4, seed: 3, config: { matchTarget: 600, stackDraws: true } },
  { name: 'six players, short hands', seats: 6, seed: 4, config: { matchTarget: 600, handSize: 5 } },
  { name: 'draw-four anywhere', seats: 4, seed: 5, config: { matchTarget: 600, wild4OnlyWithoutColour: false } },
];

const hash = (x: unknown) => createHash('sha256').update(canonical(x)).digest('hex').slice(0, 16);

function record(sc: Scenario): string[] {
  const all = Array.from({ length: sc.seats }, (_, i) => i);
  const session = new Session(OSMICE, { seats: sc.seats, seed: sc.seed, humanSeats: all, config: sc.config });
  const pick = makeRng(sc.seed * 31 + 7);
  const rounds: string[] = [];
  let steps: unknown[] = [{ events: session.drainEvents(), views: all.map((s) => session.view(s)) }];
  let guard = 0;
  while (guard++ < 100_000) {
    if (session.roundOver() || session.matchOver()) {
      rounds.push(hash(steps));
      steps = [];
      if (session.matchOver()) break;
      session.startNextRound();
      steps.push({ events: session.drainEvents(), views: all.map((s) => session.view(s)) });
      continue;
    }
    const seat = session.actors()[0]!;
    const legal = session.legal(seat);
    const action = legal[Math.floor(pick() * legal.length)]!;
    session.submit(action);
    steps.push({ action, events: session.drainEvents(), views: all.map((s) => session.view(s)) });
  }
  return rounds;
}

describe('the Osmice golden corpus', () => {
  const now = Object.fromEntries(SCENARIOS.map((sc) => [sc.name, record(sc)]));

  it('replays every scenario round for round', () => {
    if (process.env.GOLDEN_UPDATE === '1' || !existsSync(FILE)) {
      writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
    }
    const was = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string[]>;
    for (const sc of SCENARIOS) {
      const a = now[sc.name]!;
      const b = was[sc.name]!;
      const first = a.findIndex((h, i) => h !== b[i]);
      expect(first, `${sc.name}: round ${first + 1} changed`).toBe(-1);
      expect(a.length, `${sc.name}: round count`).toBe(b.length);
    }
  });

  it('covers every scenario with more than one round', () => {
    for (const sc of SCENARIOS) expect(now[sc.name]!.length, sc.name).toBeGreaterThan(1);
  });
});
