import type { LocaleId } from './index';

/**
 * Words for the games beyond Bela, one namespace per game, in all three
 * languages. Each table is typed against its interface, so a string missing
 * from one language is a compile error, not a blank button.
 */

export interface GamesStrings {
  /** The home panel that lists the other games. */
  moreGames: string;
  /** A game tile's line: against the bots, with how many players. */
  vsBots: (players: number) => string;
  /** The player count picker. */
  players: string;
  playersCount: (n: number) => string;
  play: string;
  back: string;
  you: string;
  /** Online: the heading, quick play with strangers, and the lobby's count of seats taken. */
  online: string;
  quickPlay: string;
  seated: (n: number, of: number) => string;
  codeIs: string;
  /** The Stats screen's panel for the games beyond Bela. */
  statsHeading: string;
  roundsWon: (won: number, played: number) => string;
  matchesWon: (won: number, played: number) => string;
  notPlayed: string;
}

const GAMES: Record<LocaleId, GamesStrings> = {
  hr: {
    moreGames: 'Još igara',
    vsBots: (n) => `Protiv botova · ${n} igrača`,
    players: 'Igrača za stolom',
    playersCount: (n) => `${n}`,
    play: 'Igraj',
    back: 'Natrag',
    you: 'Ti',
    online: 'Online',
    quickPlay: 'Brza igra',
    seated: (n, of) => `Za stolom: ${n} / ${of}`,
    codeIs: 'Šifra stola',
    statsHeading: 'Ostale igre',
    roundsWon: (w, p) => `Runde: ${w} / ${p}`,
    matchesWon: (w, p) => `Partije: ${w} / ${p}`,
    notPlayed: 'Još nije igrano',
  },
  'sr-Cyrl': {
    moreGames: 'Још игара',
    vsBots: (n) => `Против ботова · ${n} играча`,
    players: 'Играча за столом',
    playersCount: (n) => `${n}`,
    play: 'Играј',
    back: 'Назад',
    you: 'Ти',
    online: 'Онлајн',
    quickPlay: 'Брза игра',
    seated: (n, of) => `За столом: ${n} / ${of}`,
    codeIs: 'Шифра стола',
    statsHeading: 'Остале игре',
    roundsWon: (w, p) => `Рунде: ${w} / ${p}`,
    matchesWon: (w, p) => `Партије: ${w} / ${p}`,
    notPlayed: 'Још није играно',
  },
  en: {
    moreGames: 'More games',
    vsBots: (n) => `Against bots · ${n} players`,
    players: 'Players at the table',
    playersCount: (n) => `${n}`,
    play: 'Play',
    back: 'Back',
    you: 'You',
    online: 'Online',
    quickPlay: 'Quick play',
    seated: (n, of) => `At the table: ${n} / ${of}`,
    codeIs: 'Table code',
    statsHeading: 'Other games',
    roundsWon: (w, p) => `Rounds won: ${w} / ${p}`,
    matchesWon: (w, p) => `Matches won: ${w} / ${p}`,
    notPlayed: 'Not played yet',
  },
};

export function gamesStrings(id: LocaleId): GamesStrings {
  return GAMES[id] ?? GAMES.hr;
}

export * from './osmice';
export * from './casino';
export * from './holdemBlackjack';
export * from './online';
