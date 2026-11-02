import type { LocaleId } from './index';

/** Osmice's words, in all three languages (typed, so a missing one is a compile error). */

export type OsmiceColourKey = 'red' | 'gold' | 'green' | 'blue';
export type OsmiceActionKey = 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

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
  /**
   * A +2 or a +4 in one line: who takes how many, and that they lose their
   * go. Said as one, because the two halves arrive together and the second
   * used to wipe the first before anyone could read it.
   */
  drewAndSkipped: (name: string, n: number) => string;
  drewAndSkippedMe: (n: number) => string;
  /** Who put the card on the pile; a wild also says the colour it called. */
  played: (name: string, card: string) => string;
  playedWild: (name: string, card: string, colour: string) => string;
  /** Kept the card they drew and passed. */
  passed: (name: string) => string;
  reversed: string;
  roundWon: (name: string, points: number) => string;
  matchWon: (name: string) => string;
  /** The same two lines about the person: "You win!", never "You wins!". */
  roundWonMe: (points: number) => string;
  matchWonMe: string;
  /** Tapping a card that cannot go on your turn. */
  cantPlay: string;
  /** Said with the card you just drew, which is first in the hand. */
  drawnTag: string;
  nextRound: string;
  newMatch: string;
  score: string;
  /** A score with its unit, so it is not read as a card count: "188 bodova". */
  points: (n: number) => string;
  /** The round sheet's two columns: what this round did, and the match total. */
  roundColumn: string;
  totalColumn: string;
  /**
   * A loser's row on the round sheet, for a screen reader: what the cards
   * left in their hand were worth, with the unit, so "62" is not heard as
   * sixty-two cards.
   */
  leftInHand: (points: number) => string;
  target: (n: number) => string;
  activeColour: (colour: string) => string;
  cardsLeft: (n: number) => string;
  /** A card in words, for screen readers. */
  cardName: (value: string, colour: string | null) => string;
  rules: string[];
}

/**
 * Croatian and Serbian count in three forms: 1, 21, 31 take the singular
 * (karta), 2-4, 22-24 the paucal (karte), and 5-20, 25-30 and the teens the
 * genitive (karata). "21 karata" was what a six-player hand read before.
 */
function slavic(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

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
    drewAndSkipped: (name, n) => `${name} vuče ${n} i propušta potez`,
    drewAndSkippedMe: (n) => `Vučeš ${n} i propuštaš potez`,
    played: (name, card) => `${name} igra: ${card}`,
    playedWild: (name, card, colour) => `${name} igra: ${card} · boja ${colour}`,
    passed: (name) => `${name} ide dalje`,
    reversed: 'Smjer se okreće',
    roundWon: (name, points) => `${name} je bez karata: +${points}`,
    matchWon: (name) => `${name} pobjeđuje!`,
    roundWonMe: (points) => `Bez karata si: +${points}`,
    matchWonMe: 'Pobjeđuješ!',
    cantPlay: 'Ta karta sad ne ide.',
    drawnTag: 'izvučena',
    nextRound: 'Sljedeća runda',
    newMatch: 'Nova partija',
    score: 'Bodovi',
    points: (n) => `${n} ${slavic(n, 'bod', 'boda', 'bodova')}`,
    roundColumn: 'Runda',
    totalColumn: 'Ukupno',
    leftInHand: (points) => `karte u ruci: ${points} ${slavic(points, 'bod', 'boda', 'bodova')}`,
    target: (n) => `do ${n}`,
    activeColour: (colour) => `Boja: ${colour}`,
    cardsLeft: (n) => `${n} ${slavic(n, 'karta', 'karte', 'karata')}`,
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
    drewAndSkipped: (name, n) => `${name} вуче ${n} и пропушта потез`,
    drewAndSkippedMe: (n) => `Вучеш ${n} и пропушташ потез`,
    played: (name, card) => `${name} игра: ${card}`,
    playedWild: (name, card, colour) => `${name} игра: ${card} · боја ${colour}`,
    passed: (name) => `${name} иде даље`,
    reversed: 'Смер се окреће',
    roundWon: (name, points) => `${name} је без карата: +${points}`,
    matchWon: (name) => `${name} побеђује!`,
    roundWonMe: (points) => `Без карата си: +${points}`,
    matchWonMe: 'Побеђујеш!',
    cantPlay: 'Та карта сад не иде.',
    drawnTag: 'извучена',
    nextRound: 'Следећа рунда',
    newMatch: 'Нова партија',
    score: 'Бодови',
    points: (n) => `${n} ${slavic(n, 'бод', 'бода', 'бодова')}`,
    roundColumn: 'Рунда',
    totalColumn: 'Укупно',
    leftInHand: (points) => `карте у руци: ${points} ${slavic(points, 'бод', 'бода', 'бодова')}`,
    target: (n) => `до ${n}`,
    activeColour: (colour) => `Боја: ${colour}`,
    cardsLeft: (n) => `${n} ${slavic(n, 'карта', 'карте', 'карата')}`,
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
    drewAndSkipped: (name, n) => `${name} draws ${n} and misses a go`,
    drewAndSkippedMe: (n) => `You draw ${n} and miss your go`,
    played: (name, card) => `${name} plays ${card}`,
    playedWild: (name, card, colour) => `${name} plays ${card} and calls ${colour}`,
    passed: (name) => `${name} passes`,
    reversed: 'Direction turns round',
    roundWon: (name, points) => `${name} is out: +${points}`,
    matchWon: (name) => `${name} wins!`,
    roundWonMe: (points) => `You're out of cards: +${points}`,
    matchWonMe: 'You win!',
    cantPlay: "That card can't go now.",
    drawnTag: 'just drawn',
    nextRound: 'Next round',
    newMatch: 'New match',
    score: 'Score',
    points: (n) => (n === 1 ? '1 point' : `${n} points`),
    roundColumn: 'Round',
    totalColumn: 'Total',
    leftInHand: (points) => `cards in hand: ${points === 1 ? '1 point' : `${points} points`}`,
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

export function osmiceStrings(id: LocaleId): OsmiceStrings {
  return OSMICE[id] ?? OSMICE.hr;
}
