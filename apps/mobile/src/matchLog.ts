import type { TeamId } from '@belot/engine';
import type { TableEvent } from '@belot/table';

/**
 * The deals of the match in play, as they were scored: what the match-end
 * sheet sums up. Fed every event the table sees, flushed ones included, so a
 * fast-forward misses nothing; a table joined mid-match (a reconnect) has
 * missed deals, and then there is no summary at all rather than a wrong one.
 */
export interface MatchLog {
  /** Each scored deal's recorded points, by team id. */
  deals: readonly (readonly [number, number])[];
}

export const EMPTY_LOG: MatchLog = { deals: [] };

export function logEvent(log: MatchLog, e: TableEvent): MatchLog {
  if (e.kind === 'matchStarted') return EMPTY_LOG;
  if (e.kind === 'dealScored') return { deals: [...log.deals, [e.result.finalScore[0], e.result.finalScore[1]]] };
  return log;
}

export interface MatchSummary {
  /** Deals each team took (more recorded points than the other), by team id. */
  won: [number, number];
  /** Our best deal: its points, and which deal it was (1-based). Null when we never scored. */
  best: { points: number; deal: number } | null;
}

/** The match in numbers, or null when the log is not the whole match. */
export function summarize(log: MatchLog, matchScores: readonly [number, number], us: TeamId): MatchSummary | null {
  const sum = [0, 0];
  for (const d of log.deals) {
    sum[0] += d[0];
    sum[1] += d[1];
  }
  if (log.deals.length === 0 || sum[0] !== matchScores[0] || sum[1] !== matchScores[1]) return null;
  const won: [number, number] = [0, 0];
  let best: MatchSummary['best'] = null;
  log.deals.forEach((d, i) => {
    if (d[0] > d[1]) won[0] += 1;
    else if (d[1] > d[0]) won[1] += 1;
    if (d[us] > 0 && (best === null || d[us] > best.points)) best = { points: d[us], deal: i + 1 };
  });
  return { won, best };
}
