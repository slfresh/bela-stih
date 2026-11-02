import type { LocaleId } from './index';

/**
 * Words for the games beyond Bela, one namespace per game, in all three
 * languages. Each table is typed against its interface, so a string missing
 * from one language is a compile error, not a blank button.
 */

export interface GamesStrings {
  /** The home panel that lists the other games. */
  moreGames: string;
  /**
   * A game tile's line: against the bots, with how many players. One player
   * is only possible at Blackjack and Baccarat, and there it is the person
   * alone against the house: no bots, and no plural.
   */
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
  /**
   * Quick play's button: a table of strangers is always the game's standard
   * size, whatever the picker above says, so the button names it.
   */
  quickPlaySeats: (seats: number) => string;
  /**
   * A game row's two online buttons, each a short name over a smaller line
   * with the table's size: half a phone's width holds "Quick play" and
   * "table of 4" on a line each, where the whole phrase wrapped at a random
   * word. `quickPlaySeats` stays the button's spoken label.
   */
  privateShort: string;
  tableOf: (seats: number) => string;
  /** The home's one join-by-code box for the games beyond Bela: its heading and the line under it. */
  joinOther: string;
  /** `belaBox`: the heading of Bela's own code box near the top, which a Bela code goes in. */
  joinOtherSub: (games: readonly string[], belaBox: string) => string;
  /** The Stats screen's section for Bela's own numbers, so they are not read as every game's. */
  belaSection: string;
  /** The Stats screen's tiles for one game beyond Bela: won of played. */
  statRounds: string;
  statMatches: string;
  seated: (n: number, of: number) => string;
  codeIs: string;
  /** The Stats screen's panel for the games beyond Bela. */
  statsHeading: string;
  roundsWon: (won: number, played: number) => string;
  matchesWon: (won: number, played: number) => string;
  notPlayed: string;
}

/** "a, b, c and d", in each language's own word for "and". */
function list(names: readonly string[], and: string): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

/**
 * Croatian and Serbian count players in three forms: 1, 21, 31 take the
 * singular (igrač), everything else at a table reads well with the genitive
 * (igrača) - 2 to 4 strictly want the paucal, which is the same word here.
 */
const oneForm = (n: number) => n % 10 === 1 && n % 100 !== 11;

const GAMES: Record<LocaleId, GamesStrings> = {
  hr: {
    moreGames: 'Još igara',
    vsBots: (n) => (n === 1 ? 'Samo ti protiv kuće' : `Protiv botova · ${n} ${oneForm(n) ? 'igrač' : 'igrača'}`),
    players: 'Igrača za stolom',
    playersCount: (n) => `${n}`,
    play: 'Igraj',
    back: 'Natrag',
    you: 'Ti',
    online: 'Online',
    quickPlay: 'Brza igra',
    quickPlaySeats: (n) => `Brza igra · stol za ${n}`,
    privateShort: 'Privatni stol',
    tableOf: (n) => `stol za ${n}`,
    joinOther: 'Stol prijatelja',
    joinOtherSub: (g, box) => `Šifra stola za ${list(g, 'ili')}. Šifra za Belu ide gore, u „${box}”.`,
    belaSection: 'Bela',
    statRounds: 'Dobivene runde',
    statMatches: 'Dobivene partije',
    seated: (n, of) => `Za stolom: ${n} / ${of}`,
    codeIs: 'Šifra stola',
    statsHeading: 'Ostale igre',
    roundsWon: (w, p) => `Runde: ${w} / ${p}`,
    matchesWon: (w, p) => `Partije: ${w} / ${p}`,
    notPlayed: 'Još nije igrano',
  },
  'sr-Cyrl': {
    moreGames: 'Још игара',
    vsBots: (n) => (n === 1 ? 'Само ти против куће' : `Против ботова · ${n} ${oneForm(n) ? 'играч' : 'играча'}`),
    players: 'Играча за столом',
    playersCount: (n) => `${n}`,
    play: 'Играј',
    back: 'Назад',
    you: 'Ти',
    online: 'Онлајн',
    quickPlay: 'Брза игра',
    quickPlaySeats: (n) => `Брза игра · сто за ${n}`,
    privateShort: 'Приватни сто',
    tableOf: (n) => `сто за ${n}`,
    joinOther: 'Сто пријатеља',
    joinOtherSub: (g, box) => `Шифра стола за ${list(g, 'или')}. Шифра за Белу иде горе, у „${box}”.`,
    belaSection: 'Бела',
    statRounds: 'Добијене рунде',
    statMatches: 'Добијене партије',
    seated: (n, of) => `За столом: ${n} / ${of}`,
    codeIs: 'Шифра стола',
    statsHeading: 'Остале игре',
    roundsWon: (w, p) => `Рунде: ${w} / ${p}`,
    matchesWon: (w, p) => `Партије: ${w} / ${p}`,
    notPlayed: 'Још није играно',
  },
  en: {
    moreGames: 'More games',
    vsBots: (n) => (n === 1 ? 'Just you against the house' : `Against bots · ${n} players`),
    players: 'Players at the table',
    playersCount: (n) => `${n}`,
    play: 'Play',
    back: 'Back',
    you: 'You',
    online: 'Online',
    quickPlay: 'Quick play',
    quickPlaySeats: (n) => `Quick play · table of ${n}`,
    privateShort: 'Private table',
    tableOf: (n) => `table of ${n}`,
    joinOther: "A friend's table",
    joinOtherSub: (g, box) => `A table code for ${list(g, 'or')}. A Bela code goes in “${box}” at the top.`,
    belaSection: 'Bela',
    statRounds: 'Rounds won',
    statMatches: 'Matches won',
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
