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
  /** The cash-out sheet's label for what the match came to, and its word for coming out exactly even. */
  result: string;
  even: string;
  /** Deal with nothing on the table: sit this round out. */
  noBet: string;
  /** A chip in the chip picker, to a screen reader. */
  chip: (n: number) => string;
  /** Under the chip picker: the chip chosen and what is on the table. */
  chipAndBet: (chip: number, bet: number) => string;
  /** On a spot that cannot take the chosen chip: it has reached the table's limit. */
  limit: (n: number) => string;
  /** What is left off the table is less than the smallest chip: nothing more to add. */
  allDown: string;
  /** A round whose bets all came back. */
  pushed: string;
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
  /** The bead road's caption, its one-letter beads, and what it says to a screen reader. */
  road: string;
  bead: Record<'player' | 'banker' | 'tie', string>;
  roadSummary: (player: number, banker: number, tie: number) => string;
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
    result: 'Ishod stola',
    even: 'Na nuli',
    noBet: 'Bez uloga',
    chip: (n) => `Žeton ${n}`,
    chipAndBet: (chip, bet) => `Žeton ${chip} · Na stolu ${bet}`,
    limit: (n) => `Najviše ${n}`,
    allDown: 'Nema više žetona za dodati: dijeli ili poništi.',
    pushed: 'Ulozi su vraćeni',
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
    result: 'Исход стола',
    even: 'На нули',
    noBet: 'Без улога',
    chip: (n) => `Жетон ${n}`,
    chipAndBet: (chip, bet) => `Жетон ${chip} · На столу ${bet}`,
    limit: (n) => `Највише ${n}`,
    allDown: 'Нема више жетона за додавање: дели или поништи.',
    pushed: 'Улози су враћени',
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
    result: 'Table result',
    even: 'Even',
    noBet: 'No bet',
    chip: (n) => `Chip ${n}`,
    chipAndBet: (chip, bet) => `Chip ${chip} · On the table ${bet}`,
    limit: (n) => `Limit ${n}`,
    allDown: 'No chip left to add: deal or clear.',
    pushed: 'Bets returned',
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
    road: 'Zadnja dijeljenja',
    bead: { player: 'I', banker: 'B', tie: 'N' },
    roadSummary: (p, b, t) => `Zadnja dijeljenja: igrač ${p}, bankar ${b}, neriješeno ${t}`,
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
    road: 'Последња дељења',
    bead: { player: 'И', banker: 'Б', tie: 'Н' },
    roadSummary: (p, b, t) => `Последња дељења: играч ${p}, банкар ${b}, нерешено ${t}`,
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
    road: 'Last coups',
    bead: { player: 'P', banker: 'B', tie: 'T' },
    roadSummary: (p, b, t) => `Last coups: player ${p}, banker ${b}, tie ${t}`,
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
