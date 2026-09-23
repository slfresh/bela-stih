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

/** The book after a finished match: one more to the side that took it, once per match. */
export function recordMatch(book: SeriesBook, key: string, matchId: string, weWon: boolean): SeriesBook {
  const e: SeriesEntry = book[key] ?? { us: 0, them: 0, seen: [] };
  if (e.seen.includes(matchId)) return book;
  return {
    ...book,
    [key]: {
      us: e.us + (weWon ? 1 : 0),
      them: e.them + (weWon ? 0 : 1),
      seen: [...e.seen, matchId].slice(-SEEN_KEEP),
    },
  };
}
