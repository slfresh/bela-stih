import type { SeriesBook, SeriesEntry } from '../storage';

/**
 * Who played with whom, from this player's side: our pair's names and
 * theirs, each pair in any seating order, case and spacing ignored. The same
 * four in the same teams next week find the same entry; swap partners and it
 * is another series.
 */
export function groupKey(ours: readonly string[], theirs: readonly string[]): string {
  const pair = (names: readonly string[]) =>
    names
      .map((n) => n.trim().replace(/\s+/g, ' ').toLocaleLowerCase())
      .sort()
      .join(' + ');
  return `${pair(ours)} | ${pair(theirs)}`;
}

/** How many counted matches each entry remembers, so it never grows without end. */
export const SEEN_KEEP = 60;

/**
 * The book after a finished match: one more to the side that took it (two
 * under the double-win rule), once per match.
 */
export function recordMatch(
  book: SeriesBook,
  key: string,
  matchId: string,
  weWon: boolean,
  wins: 1 | 2 = 1,
  /** The four as they are spelled tonight (me first, then my partner); kept for the statistics screen. */
  names?: SeriesEntry['names'],
): SeriesBook {
  const e: SeriesEntry = book[key] ?? { us: 0, them: 0, seen: [] };
  if (e.seen.includes(matchId)) return book;
  return {
    ...book,
    [key]: {
      ...e,
      us: e.us + (weWon ? wins : 0),
      them: e.them + (weWon ? 0 : wins),
      seen: [...e.seen, matchId].slice(-SEEN_KEEP),
      ...(names ? { names } : {}),
    },
  };
}

/**
 * Who an entry is between, for the statistics screen: the names it kept, or
 * - for an entry from before it kept any - the key's own lowercased pairs.
 */
export function seriesNames(key: string, e: Pick<SeriesEntry, 'names'>): NonNullable<SeriesEntry['names']> {
  if (e.names) return e.names;
  const pair = (s: string | undefined): [string, string] => {
    const [a = '', b = ''] = (s ?? '').split(' + ');
    return [a, b];
  };
  const [ours, theirs] = key.split(' | ');
  return { us: pair(ours), them: pair(theirs) };
}
