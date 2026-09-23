/**
 * The history of matches with friends: every finished match at a private
 * table with at least one other person at it, kept on this device only (like
 * the series), and the statistics drawn from it.
 */

export interface MatchRecord {
  /** `${day}:${code}:${matchNumber}` - the id the series counts matches by. */
  id: string;
  /** When the match ended (ISO). */
  at: string;
  /** The table's code. */
  code: string;
  /** The partner's name; '' when a bot sat there. */
  partner: string;
  /** The two opponents' names; '' for a bot. */
  opponents: [string, string];
  /** Points played to (501 / 701 / 1001), and whether it was Prava bela. */
  target: number;
  hard: boolean;
  won: boolean;
  /** The final match score, ours first. */
  score: [number, number];
  /** Deals each side took, ours first; null when this device missed part of the match. */
  deals: [number, number] | null;
  /** Our best deal's points; null when missed, or when we never scored. */
  best: number | null;
}

/** How many matches are kept: enough for years of evenings, small on disk. */
export const HISTORY_KEEP = 200;

/** The list with a new match first; the same match twice is kept once. */
export function addRecord(list: readonly MatchRecord[], r: MatchRecord): MatchRecord[] {
  if (list.some((x) => x.id === r.id)) return [...list];
  return [r, ...list].slice(0, HISTORY_KEEP);
}

/** How a name is matched between evenings: case, spacing and ends ignored. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export interface Totals {
  played: number;
  won: number;
  lost: number;
  /** Matches won, as a whole percentage; 0 when none were played. */
  rate: number;
  /** The run the latest match belongs to: how many in a row, won or lost. */
  streak: { won: boolean; n: number } | null;
  /** The longest run of wins. */
  bestStreak: number;
}

export function totals(list: readonly MatchRecord[]): Totals {
  const played = list.length;
  const won = list.filter((r) => r.won).length;
  let streak: Totals['streak'] = null;
  for (const r of list) {
    // Newest first: the run lasts while the results match the latest.
    if (streak === null) streak = { won: r.won, n: 1 };
    else if (r.won === streak.won) streak.n += 1;
    else break;
  }
  let bestStreak = 0;
  let run = 0;
  for (const r of list) {
    run = r.won ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }
  return {
    played,
    won,
    lost: played - won,
    rate: played === 0 ? 0 : Math.round((won / played) * 100),
    streak,
    bestStreak,
  };
}

export interface PersonStats {
  /** As last seen. */
  name: string;
  /** Matches with them as my partner, and how many of those we won. */
  withPlayed: number;
  withWon: number;
  /** Matches against them, and how many of those I won. */
  againstPlayed: number;
  againstWon: number;
  /** When we last played (ISO). */
  last: string;
}

/**
 * Everyone I have played with or against, most played first. Bots are not
 * people and are left out; a name spelled differently another evening is the
 * same person as long as it matches ignoring case and spacing.
 */
export function people(list: readonly MatchRecord[]): PersonStats[] {
  const byKey = new Map<string, PersonStats>();
  const seen = (name: string, at: string): PersonStats | null => {
    const key = nameKey(name);
    if (!key) return null;
    let p = byKey.get(key);
    if (!p) {
      // Newest first, so the first sighting is the latest spelling and date.
      p = { name: name.trim(), withPlayed: 0, withWon: 0, againstPlayed: 0, againstWon: 0, last: at };
      byKey.set(key, p);
    }
    return p;
  };
  for (const r of list) {
    const partner = seen(r.partner, r.at);
    if (partner) {
      partner.withPlayed += 1;
      if (r.won) partner.withWon += 1;
    }
    for (const o of r.opponents) {
      const opp = seen(o, r.at);
      if (opp) {
        opp.againstPlayed += 1;
        if (r.won) opp.againstWon += 1;
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.withPlayed + b.againstPlayed - (a.withPlayed + a.againstPlayed) || (a.last < b.last ? 1 : -1),
  );
}

/** A record's date the way it is read here: 23.9.2026. 21:40 (the device's own clock). */
export function recordDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}. ${hh}:${mm}`;
}
