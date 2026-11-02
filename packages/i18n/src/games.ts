import type { LocaleId } from './index';

/**
 * Words for the games beyond Bela, one namespace per game, in all three
 * languages. Each table is typed against its interface, so a string missing
 * from one language is a compile error, not a blank button.
 */

export type OsmiceColourKey = 'red' | 'gold' | 'green' | 'blue';
export type OsmiceActionKey = 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

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
}

export interface OsmiceStrings {
  name: string;
  tagline: string;
  colour: Record<OsmiceColourKey, string>;
  /** What is printed on an action card, short. */
  actionShort: Record<OsmiceActionKey, string>;
  /** The action card named in words. */
  actionName: Record<OsmiceActionKey, string>;
  draw: string;
  pass: string;
  /** The colour picker's title after playing a wild. */
  pickColour: string;
  yourTurn: string;
  turnOf: (name: string) => string;
  /** Said when a player is down to one card. */
  lastCard: string;
  /** Under the drawn card: play it, or keep it. */
  drewPlayable: string;
  mustTake: (n: number) => string;
  skipped: (name: string) => string;
  drewCards: (name: string, n: number) => string;
  /** The same two lines when it is the person themselves. */
  skippedMe: string;
  drewCardsMe: (n: number) => string;
  reversed: string;
  roundWon: (name: string, points: number) => string;
  matchWon: (name: string) => string;
  nextRound: string;
  newMatch: string;
  score: string;
  target: (n: number) => string;
  activeColour: (colour: string) => string;
  cardsLeft: (n: number) => string;
  /** A card in words, for screen readers. */
  cardName: (value: string, colour: string | null) => string;
  rules: string[];
}


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

export interface BlackjackStrings {
  name: string;
  tagline: string;
  dealer: string;
  hit: string;
  stand: string;
  double: string;
  split: string;
  blackjack: string;
  bust: string;
  total: (n: number, soft: boolean) => string;
  result: Record<'win' | 'lose' | 'push' | 'blackjack', string>;
  rules: string[];
}

export interface HoldemStrings {
  name: string;
  tagline: string;
  fold: string;
  check: string;
  call: (n: number) => string;
  bet: (n: number) => string;
  raiseTo: (n: number) => string;
  allIn: string;
  pot: (n: number) => string;
  blinds: (sb: number, bb: number) => string;
  button: string;
  halfPot: string;
  fullPot: string;
  min: string;
  category: Record<'highCard' | 'pair' | 'twoPair' | 'trips' | 'straight' | 'flush' | 'fullHouse' | 'quads' | 'straightFlush', string>;
  wins: (name: string, amount: number, hand: string | null) => string;
  eliminated: (name: string) => string;
  handOf: (n: number) => string;
  rules: string[];
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
  },
};

const OSMICE: Record<LocaleId, OsmiceStrings> = {
  hr: {
    name: 'Osmice',
    tagline: 'Boja ili broj — prvi bez karata pobjeđuje.',
    colour: { red: 'crvena', gold: 'žuta', green: 'zelena', blue: 'plava' },
    actionShort: { skip: 'Preskok', reverse: 'Obrni', draw2: '+2', wild: 'Boja', wild4: '+4' },
    actionName: { skip: 'preskok', reverse: 'obrni', draw2: 'vuci dvije', wild: 'divlja', wild4: 'divlja, vuci četiri' },
    draw: 'Vuci',
    pass: 'Dalje',
    pickColour: 'Koja boja?',
    yourTurn: 'Na tebi je',
    turnOf: (name) => `Igra ${name}`,
    lastCard: 'Zadnja!',
    drewPlayable: 'Izvučena karta ide — igraj je ili idi dalje.',
    mustTake: (n) => `Vučeš ${n}`,
    skipped: (name) => `${name} preskače`,
    drewCards: (name, n) => `${name} vuče ${n}`,
    skippedMe: 'Preskočen si',
    drewCardsMe: (n) => `Vučeš ${n}`,
    reversed: 'Smjer se okreće',
    roundWon: (name, points) => `${name} je bez karata: +${points}`,
    matchWon: (name) => `${name} pobjeđuje!`,
    nextRound: 'Sljedeća runda',
    newMatch: 'Nova partija',
    score: 'Bodovi',
    target: (n) => `do ${n}`,
    activeColour: (colour) => `Boja: ${colour}`,
    cardsLeft: (n) => (n === 1 ? '1 karta' : n >= 2 && n <= 4 ? `${n} karte` : `${n} karata`),
    cardName: (value, colour) => (colour ? `${value}, ${colour}` : value),
    rules: [
      'Na kup igraš kartu iste boje ili istog broja, ili divlju kartu.',
      'Ako nemaš što, vučeš jednu. Ako izvučena ide, možeš je odmah odigrati.',
      'Preskok preskače sljedećeg, obrni okreće smjer, +2 tjera sljedećeg da vuče dvije i propusti potez.',
      'Divlja bira boju; divlja +4 bira boju i tjera sljedećeg da vuče četiri — smiješ je igrati samo kad nemaš tražene boje.',
      'Tko prvi ostane bez karata dobiva bodove svih karata koje su ostale drugima: broj vrijedi koliko piše, akcijska karta 20, divlja 50.',
    ],
  },
  'sr-Cyrl': {
    name: 'Осмице',
    tagline: 'Боја или број — први без карата побеђује.',
    colour: { red: 'црвена', gold: 'жута', green: 'зелена', blue: 'плава' },
    actionShort: { skip: 'Прескок', reverse: 'Обрни', draw2: '+2', wild: 'Боја', wild4: '+4' },
    actionName: { skip: 'прескок', reverse: 'обрни', draw2: 'вуци две', wild: 'дивља', wild4: 'дивља, вуци четири' },
    draw: 'Вуци',
    pass: 'Даље',
    pickColour: 'Која боја?',
    yourTurn: 'На теби је',
    turnOf: (name) => `Игра ${name}`,
    lastCard: 'Последња!',
    drewPlayable: 'Извучена карта иде — играј је или иди даље.',
    mustTake: (n) => `Вучеш ${n}`,
    skipped: (name) => `${name} прескаче`,
    drewCards: (name, n) => `${name} вуче ${n}`,
    skippedMe: 'Прескочен си',
    drewCardsMe: (n) => `Вучеш ${n}`,
    reversed: 'Смер се окреће',
    roundWon: (name, points) => `${name} је без карата: +${points}`,
    matchWon: (name) => `${name} побеђује!`,
    nextRound: 'Следећа рунда',
    newMatch: 'Нова партија',
    score: 'Бодови',
    target: (n) => `до ${n}`,
    activeColour: (colour) => `Боја: ${colour}`,
    cardsLeft: (n) => (n === 1 ? '1 карта' : n >= 2 && n <= 4 ? `${n} карте` : `${n} карата`),
    cardName: (value, colour) => (colour ? `${value}, ${colour}` : value),
    rules: [
      'На куп играш карту исте боје или истог броја, или дивљу карту.',
      'Ако немаш шта, вучеш једну. Ако извучена иде, можеш је одмах одиграти.',
      'Прескок прескаче следећег, обрни окреће смер, +2 тера следећег да вуче две и пропусти потез.',
      'Дивља бира боју; дивља +4 бира боју и тера следећег да вуче четири — смеш је играти само кад немаш тражену боју.',
      'Ко први остане без карата добија бодове свих карата које су остале другима: број вреди колико пише, акцијска карта 20, дивља 50.',
    ],
  },
  en: {
    name: 'Osmice',
    tagline: 'Match the colour or the number — first to empty their hand wins.',
    colour: { red: 'red', gold: 'yellow', green: 'green', blue: 'blue' },
    actionShort: { skip: 'Skip', reverse: 'Turn', draw2: '+2', wild: 'Wild', wild4: '+4' },
    actionName: { skip: 'skip', reverse: 'turn round', draw2: 'draw two', wild: 'wild', wild4: 'wild draw four' },
    draw: 'Draw',
    pass: 'Pass',
    pickColour: 'Which colour?',
    yourTurn: 'Your turn',
    turnOf: (name) => `${name} to play`,
    lastCard: 'Last card!',
    drewPlayable: 'The card you drew can go — play it or pass.',
    mustTake: (n) => `You draw ${n}`,
    skipped: (name) => `${name} is skipped`,
    drewCards: (name, n) => `${name} draws ${n}`,
    skippedMe: 'You are skipped',
    drewCardsMe: (n) => `You draw ${n}`,
    reversed: 'Direction turns round',
    roundWon: (name, points) => `${name} is out: +${points}`,
    matchWon: (name) => `${name} wins!`,
    nextRound: 'Next round',
    newMatch: 'New match',
    score: 'Score',
    target: (n) => `to ${n}`,
    activeColour: (colour) => `Colour: ${colour}`,
    cardsLeft: (n) => (n === 1 ? '1 card' : `${n} cards`),
    cardName: (value, colour) => (colour ? `${colour} ${value}` : value),
    rules: [
      'Play a card of the same colour or the same number onto the pile, or a wild.',
      'If you have nothing, draw one. If the card you drew can go, you may play it at once.',
      'Skip skips the next player, turn round reverses the direction, +2 makes the next player draw two and miss their go.',
      'A wild names the colour; a wild +4 names it and makes the next player draw four — only when you hold nothing of the colour asked for.',
      'The first to empty their hand scores every card left in the other hands: a number is worth its number, an action card 20, a wild 50.',
    ],
  },
};

export function gamesStrings(id: LocaleId): GamesStrings {
  return GAMES[id] ?? GAMES.hr;
}

export function osmiceStrings(id: LocaleId): OsmiceStrings {
  return OSMICE[id] ?? OSMICE.hr;
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

const BLACKJACK: Record<LocaleId, BlackjackStrings> = {
  hr: {
    name: 'Blackjack',
    tagline: 'Do 21, a ne preko — bolje od djelitelja.',
    dealer: 'Djelitelj',
    hit: 'Karta',
    stand: 'Dosta',
    double: 'Udvostruči',
    split: 'Podijeli',
    blackjack: 'Blackjack!',
    bust: 'Preko!',
    total: (n, soft) => (soft ? `${n - 10} / ${n}` : `${n}`),
    result: { win: 'Dobitak', lose: 'Gubitak', push: 'Neriješeno', blackjack: 'Blackjack 3:2' },
    rules: [
      'Uložiš prije dijeljenja. Ti dobivaš dvije karte, djelitelj jednu otvorenu i jednu zatvorenu.',
      'Karte vrijede koliko piše, slike 10, as 1 ili 11. Cilj je biti bliže 21 od djelitelja, a ne preko.',
      'Karta uzima još jednu, dosta staje. Na prve dvije možeš udvostručiti ulog za točno jednu kartu, a par možeš podijeliti u dvije ruke.',
      'Djelitelj vuče do 17. Blackjack (as i desetka) plaća 3:2, dobitak 1:1, jednako je neriješeno.',
    ],
  },
  'sr-Cyrl': {
    name: 'Блекџек',
    tagline: 'До 21, а не преко — боље од делиоца.',
    dealer: 'Делилац',
    hit: 'Карта',
    stand: 'Доста',
    double: 'Удвостручи',
    split: 'Подели',
    blackjack: 'Блекџек!',
    bust: 'Преко!',
    total: (n, soft) => (soft ? `${n - 10} / ${n}` : `${n}`),
    result: { win: 'Добитак', lose: 'Губитак', push: 'Нерешено', blackjack: 'Блекџек 3:2' },
    rules: [
      'Уложиш пре дељења. Ти добијаш две карте, делилац једну отворену и једну затворену.',
      'Карте вреде колико пише, слике 10, ас 1 или 11. Циљ је бити ближе 21 од делиоца, а не преко.',
      'Карта узима још једну, доста стаје. На прве две можеш удвостручити улог за тачно једну карту, а пар можеш поделити у две руке.',
      'Делилац вуче до 17. Блекџек (ас и десетка) плаћа 3:2, добитак 1:1, једнако је нерешено.',
    ],
  },
  en: {
    name: 'Blackjack',
    tagline: 'Get to 21, not over — beat the dealer.',
    dealer: 'Dealer',
    hit: 'Hit',
    stand: 'Stand',
    double: 'Double',
    split: 'Split',
    blackjack: 'Blackjack!',
    bust: 'Bust!',
    total: (n, soft) => (soft ? `${n - 10} / ${n}` : `${n}`),
    result: { win: 'Win', lose: 'Lose', push: 'Push', blackjack: 'Blackjack 3:2' },
    rules: [
      'Bet before the deal. You get two cards, the dealer one face up and one face down.',
      'Cards count their number, courts 10, an ace 1 or 11. Get closer to 21 than the dealer without going over.',
      'Hit takes another card, stand stops. On your first two cards you may double your bet for exactly one more card, and split a pair into two hands.',
      'The dealer draws to 17. A blackjack (ace and a ten) pays 3:2, a win 1:1, a tie pushes.',
    ],
  },
};

const HOLDEM: Record<LocaleId, HoldemStrings> = {
  hr: {
    name: "Texas Hold'em",
    tagline: 'Dvije tvoje, pet zajedničkih — najbolja petorka uzima pot.',
    fold: 'Odustani',
    check: 'Provjeri',
    call: (n) => `Prati ${n}`,
    bet: (n) => `Uloži ${n}`,
    raiseTo: (n) => `Povisi na ${n}`,
    allIn: 'Sve',
    pot: (n) => `Pot ${n}`,
    blinds: (sb, bb) => `Blindovi ${sb}/${bb}`,
    button: 'D',
    halfPot: '½ pota',
    fullPot: 'Pot',
    min: 'Min',
    category: { highCard: 'visoka karta', pair: 'par', twoPair: 'dva para', trips: 'tris', straight: 'skala', flush: 'boja', fullHouse: 'full house', quads: 'poker', straightFlush: 'skala u boji' },
    wins: (name, amount, hand) => (hand ? `${name} uzima ${amount} (${hand})` : `${name} uzima ${amount}`),
    eliminated: (name) => `${name} ispada`,
    handOf: (n) => `Ruka ${n}`,
    rules: [
      'Svatko dobiva dvije karte. Na stol dolaze tri, pa jedna, pa još jedna zajednička karta, s krugom ulaganja prije i poslije svake.',
      'Na potezu odustaješ, provjeravaš, pratiš ili povisuješ. Povišica je barem kolika je bila zadnja.',
      'Na kraju pobjeđuje najbolja petorka od sedam karata: skala u boji, poker, full house, boja, skala, tris, dva para, par, visoka karta.',
      'Svi počinju s istim žetonima, blindovi rastu, a igra traje dok netko ne osvoji sve.',
    ],
  },
  'sr-Cyrl': {
    name: 'Тексас холдем',
    tagline: 'Две твоје, пет заједничких — најбоља петорка узима пот.',
    fold: 'Одустани',
    check: 'Провери',
    call: (n) => `Прати ${n}`,
    bet: (n) => `Уложи ${n}`,
    raiseTo: (n) => `Повиси на ${n}`,
    allIn: 'Све',
    pot: (n) => `Пот ${n}`,
    blinds: (sb, bb) => `Блајндови ${sb}/${bb}`,
    button: 'Д',
    halfPot: '½ пота',
    fullPot: 'Пот',
    min: 'Мин',
    category: { highCard: 'висока карта', pair: 'пар', twoPair: 'два пара', trips: 'трилинг', straight: 'кента', flush: 'боја', fullHouse: 'фул хаус', quads: 'покер', straightFlush: 'кента у боји' },
    wins: (name, amount, hand) => (hand ? `${name} узима ${amount} (${hand})` : `${name} узима ${amount}`),
    eliminated: (name) => `${name} испада`,
    handOf: (n) => `Рука ${n}`,
    rules: [
      'Свако добија две карте. На сто долазе три, па једна, па још једна заједничка карта, са кругом улагања пре и после сваке.',
      'На потезу одустајеш, провераваш, пратиш или повисујеш. Повишица је бар колика је била последња.',
      'На крају побеђује најбоља петорка од седам карата: кента у боји, покер, фул хаус, боја, кента, трилинг, два пара, пар, висока карта.',
      'Сви почињу са истим жетонима, блајндови расту, а игра траје док неко не освоји све.',
    ],
  },
  en: {
    name: "Texas Hold'em",
    tagline: 'Two cards yours, five shared — the best five takes the pot.',
    fold: 'Fold',
    check: 'Check',
    call: (n) => `Call ${n}`,
    bet: (n) => `Bet ${n}`,
    raiseTo: (n) => `Raise to ${n}`,
    allIn: 'All in',
    pot: (n) => `Pot ${n}`,
    blinds: (sb, bb) => `Blinds ${sb}/${bb}`,
    button: 'D',
    halfPot: '½ pot',
    fullPot: 'Pot',
    min: 'Min',
    category: { highCard: 'high card', pair: 'a pair', twoPair: 'two pair', trips: 'three of a kind', straight: 'a straight', flush: 'a flush', fullHouse: 'a full house', quads: 'four of a kind', straightFlush: 'a straight flush' },
    wins: (name, amount, hand) => (hand ? `${name} wins ${amount} with ${hand}` : `${name} wins ${amount}`),
    eliminated: (name) => `${name} is out`,
    handOf: (n) => `Hand ${n}`,
    rules: [
      'Everyone gets two cards. Three shared cards come to the table, then one, then one more, with a round of betting before and after each.',
      'On your turn, fold, check, call or raise. A raise is at least the size of the last one.',
      'At the end the best five of seven cards wins: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, a pair, high card.',
      'Everyone starts with the same chips, the blinds go up, and the game runs until one player has them all.',
    ],
  },
};

export function casinoStrings(id: LocaleId): CasinoStrings {
  return CASINO[id] ?? CASINO.hr;
}
export function baccaratStrings(id: LocaleId): BaccaratStrings {
  return BACCARAT[id] ?? BACCARAT.hr;
}
export function blackjackStrings(id: LocaleId): BlackjackStrings {
  return BLACKJACK[id] ?? BLACKJACK.hr;
}
export function holdemStrings(id: LocaleId): HoldemStrings {
  return HOLDEM[id] ?? HOLDEM.hr;
}
