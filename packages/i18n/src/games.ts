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

const GAMES: Record<LocaleId, GamesStrings> = {
  hr: {
    moreGames: 'Još igara',
    vsBots: (n) => `Protiv botova · ${n} igrača`,
    players: 'Igrača za stolom',
    playersCount: (n) => `${n}`,
    play: 'Igraj',
    back: 'Natrag',
    you: 'Ti',
  },
  'sr-Cyrl': {
    moreGames: 'Још игара',
    vsBots: (n) => `Против ботова · ${n} играча`,
    players: 'Играча за столом',
    playersCount: (n) => `${n}`,
    play: 'Играј',
    back: 'Назад',
    you: 'Ти',
  },
  en: {
    moreGames: 'More games',
    vsBots: (n) => `Against bots · ${n} players`,
    players: 'Players at the table',
    playersCount: (n) => `${n}`,
    play: 'Play',
    back: 'Back',
    you: 'You',
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
