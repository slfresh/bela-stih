import type { LocaleId } from './index';

/** What every casino table says, and Baccarat's own words, in all three languages. */

export interface CasinoStrings {
  /** The home panel's heading for the casino games, and the line under it. */
  heading: string;
  playMoney: string;
  chips: string;
  balance: (n: number) => string;
  buyIn: (n: number) => string;
  /** Not enough chips to sit down. */
  broke: string;
  playAgain: string;
  cashOut: (n: number) => string;
  bet: string;
  clear: string;
  deal: string;
  waitingForBets: string;
  roundOf: (n: number, of: number) => string;
  won: (n: number) => string;
  lost: (n: number) => string;
  push: string;
  out: string;
}

export interface BaccaratStrings {
  name: string;
  tagline: string;
  player: string;
  banker: string;
  tie: string;
  /** "Player wins 7 to 4" etc. */
  outcome: (winner: 'player' | 'banker' | 'tie', p: number, b: number) => string;
  natural: string;
  pays: (spot: 'player' | 'banker' | 'tie', commission: number, tiePays: number) => string;
  rules: string[];
}

const CASINO: Record<LocaleId, CasinoStrings> = {
  hr: {
    heading: 'Kasino stol',
    playMoney: 'Samo žetoni za igru: ne kupuju se, ne mijenjaju se za novčiće ni za novac, i dopunjuju se svaki dan.',
    chips: 'Žetoni',
    balance: (n) => `Žetoni: ${n}`,
    buyIn: (n) => `Sjedaš sa ${n} žetona`,
    broke: 'Nemaš dovoljno žetona za ovaj stol. Sutra se dopunjuju.',
    playAgain: 'Igraj opet',
    cashOut: (n) => `Ustaješ sa ${n} žetona`,
    bet: 'Ulog',
    clear: 'Poništi',
    deal: 'Dijeli',
    waitingForBets: 'Čeka se ulog…',
    roundOf: (n, of) => `${n} / ${of}`,
    won: (n) => `+${n}`,
    lost: (n) => `−${n}`,
    push: 'Neriješeno',
    out: 'Bez žetona',
  },
  'sr-Cyrl': {
    heading: 'Казино сто',
    playMoney: 'Само жетони за игру: не купују се, не мењају се за новчиће ни за новац, и допуњују се сваког дана.',
    chips: 'Жетони',
    balance: (n) => `Жетони: ${n}`,
    buyIn: (n) => `Седаш са ${n} жетона`,
    broke: 'Немаш довољно жетона за овај сто. Сутра се допуњују.',
    playAgain: 'Играј поново',
    cashOut: (n) => `Устајеш са ${n} жетона`,
    bet: 'Улог',
    clear: 'Поништи',
    deal: 'Дели',
    waitingForBets: 'Чека се улог…',
    roundOf: (n, of) => `${n} / ${of}`,
    won: (n) => `+${n}`,
    lost: (n) => `−${n}`,
    push: 'Нерешено',
    out: 'Без жетона',
  },
  en: {
    heading: 'Casino table',
    playMoney: 'Play chips only: never bought, never exchanged for coins or money, and topped up every day.',
    chips: 'Chips',
    balance: (n) => `Chips: ${n}`,
    buyIn: (n) => `You sit down with ${n} chips`,
    broke: 'Not enough chips for this table. They top up tomorrow.',
    playAgain: 'Play again',
    cashOut: (n) => `You stand up with ${n} chips`,
    bet: 'Bet',
    clear: 'Clear',
    deal: 'Deal',
    waitingForBets: 'Waiting for bets…',
    roundOf: (n, of) => `${n} / ${of}`,
    won: (n) => `+${n}`,
    lost: (n) => `−${n}`,
    push: 'Push',
    out: 'Out of chips',
  },
};

const BACCARAT: Record<LocaleId, BaccaratStrings> = {
  hr: {
    name: 'Baccarat',
    tagline: 'Igrač, bankar ili neriješeno — bliže devetki pobjeđuje.',
    player: 'Igrač',
    banker: 'Bankar',
    tie: 'Neriješeno',
    outcome: (w, p, b) => (w === 'tie' ? `Neriješeno, ${p} : ${b}` : w === 'player' ? `Igrač dobiva, ${p} : ${b}` : `Bankar dobiva, ${b} : ${p}`),
    natural: 'Prirodna!',
    pays: (spot, c, t) => (spot === 'player' ? 'plaća 1:1' : spot === 'banker' ? `plaća 1:1, minus ${c}%` : `plaća ${t}:1`),
    rules: [
      'Prije dijeljenja ulažeš na igrača, bankara ili neriješeno.',
      'Svaka strana dobiva dvije karte; računa se samo zadnja znamenka zbroja: as 1, desetka i slike 0.',
      'Treća karta vuče se po stalnim pravilima — nitko ništa ne bira.',
      'Bliže devetki pobjeđuje. Igrač plaća 1:1, bankar 1:1 manje 5 %, neriješeno 8:1.',
    ],
  },
  'sr-Cyrl': {
    name: 'Бакара',
    tagline: 'Играч, банкар или нерешено — ближе деветки побеђује.',
    player: 'Играч',
    banker: 'Банкар',
    tie: 'Нерешено',
    outcome: (w, p, b) => (w === 'tie' ? `Нерешено, ${p} : ${b}` : w === 'player' ? `Играч добија, ${p} : ${b}` : `Банкар добија, ${b} : ${p}`),
    natural: 'Природна!',
    pays: (spot, c, t) => (spot === 'player' ? 'плаћа 1:1' : spot === 'banker' ? `плаћа 1:1, минус ${c}%` : `плаћа ${t}:1`),
    rules: [
      'Пре дељења улажеш на играча, банкара или нерешено.',
      'Свака страна добија две карте; рачуна се само последња цифра збира: ас 1, десетка и слике 0.',
      'Трећа карта вуче се по сталним правилима — нико ништа не бира.',
      'Ближе деветки побеђује. Играч плаћа 1:1, банкар 1:1 мање 5 %, нерешено 8:1.',
    ],
  },
  en: {
    name: 'Baccarat',
    tagline: 'Player, banker or tie — closest to nine wins.',
    player: 'Player',
    banker: 'Banker',
    tie: 'Tie',
    outcome: (w, p, b) => (w === 'tie' ? `Tie, ${p} to ${b}` : w === 'player' ? `Player wins, ${p} to ${b}` : `Banker wins, ${b} to ${p}`),
    natural: 'A natural!',
    pays: (spot, c, t) => (spot === 'player' ? 'pays 1:1' : spot === 'banker' ? `pays 1:1 less ${c}%` : `pays ${t}:1`),
    rules: [
      'Before the deal, bet on the player, the banker or a tie.',
      'Each side gets two cards; only the last digit of the total counts: an ace is 1, tens and courts 0.',
      'A third card is drawn by fixed rules — nobody chooses anything.',
      'Closest to nine wins. Player pays 1:1, banker 1:1 less 5%, a tie 8:1.',
    ],
  },
};

export function casinoStrings(id: LocaleId): CasinoStrings {
  return CASINO[id] ?? CASINO.hr;
}
export function baccaratStrings(id: LocaleId): BaccaratStrings {
  return BACCARAT[id] ?? BACCARAT.hr;
}
