import type { Card, Declaration, EngineConfig, Rank, Seat, TeamId } from '@belot/shared-types';
import { RANKS, SUITS } from '@belot/shared-types';
import { naturalOrder } from './power';

/**
 * Declarations (zvanja). Detected from a player's full 8-card hand using the
 * NATURAL order only (never the trick order). Sequences of 3/4/5+ = terca 20 /
 * kvarta 50 / kvinta 100. Carrés (four of a kind): J=200, 9=150, A/10/K/Q=100,
 * four 8s and four 7s do NOT count.
 *
 * Resolution: the team holding the single STRONGEST declaration takes ALL of its
 * declarations; the other team scores none. Exactly-equal best declarations
 * cancel everything (config.declarationTieCancels). Ranking:
 *   carré > sequence; longer sequence > shorter; equal length -> higher top card.
 */

function sequenceValue(length: number): number {
  if (length >= 5) return 100;
  if (length === 4) return 50;
  if (length === 3) return 20;
  return 0;
}

const CARRE_VALUE: Record<Rank, number> = {
  J: 200,
  '9': 150,
  A: 100,
  '10': 100,
  K: 100,
  Q: 100,
  '8': 0,
  '7': 0,
};

export function detectDeclarations(hand: Card[], seat: Seat): Declaration[] {
  const decls: Declaration[] = [];

  // Sequences within each suit (consecutive in natural order).
  for (const suit of SUITS) {
    const order = hand
      .filter((c) => c.suit === suit)
      .map((c) => naturalOrder(c.rank))
      .sort((a, b) => a - b);

    let runStart = 0;
    for (let i = 1; i <= order.length; i++) {
      const broken = i === order.length || order[i] !== order[i - 1]! + 1;
      if (broken) {
        const runLen = i - runStart;
        if (runLen >= 3) {
          const cards: Card[] = [];
          for (let k = runStart; k < i; k++) cards.push({ suit, rank: RANKS[order[k]!]! });
          const topRank = RANKS[order[i - 1]!]!;
          decls.push({
            kind: 'sequence',
            cards,
            value: sequenceValue(runLen),
            length: runLen,
            topRank,
            seat,
          });
        }
        runStart = i;
      }
    }
  }

  // Carrés (four of a kind).
  for (const rank of RANKS) {
    const count = hand.filter((c) => c.rank === rank).length;
    if (count === 4 && CARRE_VALUE[rank] > 0) {
      decls.push({
        kind: 'carre',
        cards: SUITS.map((s) => ({ suit: s, rank })),
        value: CARRE_VALUE[rank],
        length: 4,
        topRank: rank,
        seat,
      });
    }
  }

  return decls;
}

export interface DeclarationResolution {
  /** Team that wins the contest and scores ALL its declarations; null = canceled / none. */
  winningTeam: TeamId | null;
  /** Points each team scores from declarations. */
  perTeamValue: [number, number];
  winningDeclarations: Declaration[];
}

/** Comparison key for a declaration: [category, length, topNaturalRank]. Higher wins. */
function declKey(d: Declaration): [number, number, number] {
  const category = d.kind === 'carre' ? 2 : 1;
  return [category, d.length, naturalOrder(d.topRank)];
}

function cmpKey(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

export function resolveDeclarations(
  perSeat: Declaration[][],
  teamOf: (s: Seat) => TeamId,
  config: Pick<EngineConfig, 'declarationTieCancels'>,
  /** The deal's first trick leader — ties go to whoever plays earlier from here. */
  firstLeader: Seat = 0,
): DeclarationResolution {
  const all = perSeat.flat();
  if (all.length === 0) return { winningTeam: null, perTeamValue: [0, 0], winningDeclarations: [] };

  const best: (Declaration | null)[] = [null, null];
  for (const d of all) {
    const t = teamOf(d.seat);
    const cur = best[t];
    if (!cur || cmpKey(declKey(d), declKey(cur)) > 0) best[t] = d;
  }

  const b0 = best[0];
  const b1 = best[1];
  let winner: TeamId | null;
  if (b0 && !b1) winner = 0;
  else if (b1 && !b0) winner = 1;
  else if (b0 && b1) {
    const c = cmpKey(declKey(b0), declKey(b1));
    if (c > 0) winner = 0;
    else if (c < 0) winner = 1;
    // Exactly equal best declarations: UHDDR tournament rule 7 gives the tie
    // to whoever is FIRST in play order from the deal's first leader ("prednost
    // ima onaj koji je prvi na štihu"). The cancel variant stays as a knob.
    else if (config.declarationTieCancels) winner = null;
    else {
      const dist = (seat: Seat) => (seat - firstLeader + 4) % 4;
      winner = teamOf(dist(b0.seat) <= dist(b1.seat) ? b0.seat : b1.seat);
    }
  } else winner = null;

  if (winner === null) return { winningTeam: null, perTeamValue: [0, 0], winningDeclarations: [] };

  const winningDeclarations = all.filter((d) => teamOf(d.seat) === winner);
  const total = winningDeclarations.reduce((s, d) => s + d.value, 0);
  const perTeamValue: [number, number] = [0, 0];
  perTeamValue[winner] = total;
  return { winningTeam: winner, perTeamValue, winningDeclarations };
}
