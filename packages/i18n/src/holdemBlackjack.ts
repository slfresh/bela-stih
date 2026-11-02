import type { LocaleId } from './index';

/** Blackjack's and Texas Hold'em's words, in all three languages. */

/** "A", "A and B", "A, B and C". */
function list(names: readonly string[], and: string): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
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
  /** The same, said to the person: "You win 120 with a pair". */
  youWin: (amount: number, hand: string | null) => string;
  /** A pot shared between several players: "Grandma and Moustache split 60". */
  split: (names: readonly string[], amount: number, hand: string | null) => string;
  /** A pot the person shares with the others named: "You and Grandma split 60". */
  youSplit: (others: readonly string[], amount: number, hand: string | null) => string;
  /** Which pot a line is about, once a hand has side pots: "Main pot: …", "Side pot 2: …". */
  mainPot: (line: string) => string;
  sidePot: (n: number | null, line: string) => string;
  /** A bet nobody called, handed back: not a win. */
  returned: (name: string, amount: number) => string;
  youReturned: (amount: number) => string;
  eliminated: (name: string) => string;
  /** The person is out of chips: their match is over. */
  youOut: string;
  /** Under a seat (mine included) that has folded this hand. */
  folded: string;
  handOf: (n: number) => string;
  rules: string[];
}

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
    youWin: (amount, hand) => (hand ? `Uzimaš ${amount} (${hand})` : `Uzimaš ${amount}`),
    split: (names, amount, hand) => `${list(names, 'i')} dijele ${amount}${hand ? ` (${hand})` : ''}`,
    youSplit: (others, amount, hand) => `Ti i ${list(others, 'i')} dijelite ${amount}${hand ? ` (${hand})` : ''}`,
    mainPot: (line) => `Glavni pot: ${line}`,
    sidePot: (n, line) => `Sporedni pot${n === null ? '' : ` ${n}`}: ${line}`,
    returned: (name, amount) => `${name} dobiva natrag ${amount} koje nitko nije pratio`,
    youReturned: (amount) => `Dobivaš natrag ${amount} koje nitko nije pratio`,
    eliminated: (name) => `${name} ispada`,
    youOut: 'Ispadaš: nemaš više žetona',
    folded: 'Izvan ruke',
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
    youWin: (amount, hand) => (hand ? `Узимаш ${amount} (${hand})` : `Узимаш ${amount}`),
    split: (names, amount, hand) => `${list(names, 'и')} деле ${amount}${hand ? ` (${hand})` : ''}`,
    youSplit: (others, amount, hand) => `Ти и ${list(others, 'и')} делите ${amount}${hand ? ` (${hand})` : ''}`,
    mainPot: (line) => `Главни пот: ${line}`,
    sidePot: (n, line) => `Споредни пот${n === null ? '' : ` ${n}`}: ${line}`,
    returned: (name, amount) => `${name} добија назад ${amount} које нико није пратио`,
    youReturned: (amount) => `Добијаш назад ${amount} које нико није пратио`,
    eliminated: (name) => `${name} испада`,
    youOut: 'Испадаш: немаш више жетона',
    folded: 'Ван руке',
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
    youWin: (amount, hand) => (hand ? `You win ${amount} with ${hand}` : `You win ${amount}`),
    split: (names, amount, hand) => `${list(names, 'and')} split ${amount}${hand ? ` with ${hand}` : ''}`,
    youSplit: (others, amount, hand) => `You and ${list(others, 'and')} split ${amount}${hand ? ` with ${hand}` : ''}`,
    mainPot: (line) => `Main pot: ${line}`,
    sidePot: (n, line) => `Side pot${n === null ? '' : ` ${n}`}: ${line}`,
    returned: (name, amount) => `${name} gets back ${amount} nobody called`,
    youReturned: (amount) => `You get back ${amount} nobody called`,
    eliminated: (name) => `${name} is out`,
    youOut: 'You are out of chips',
    folded: 'Folded',
    handOf: (n) => `Hand ${n}`,
    rules: [
      'Everyone gets two cards. Three shared cards come to the table, then one, then one more, with a round of betting before and after each.',
      'On your turn, fold, check, call or raise. A raise is at least the size of the last one.',
      'At the end the best five of seven cards wins: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, a pair, high card.',
      'Everyone starts with the same chips, the blinds go up, and the game runs until one player has them all.',
    ],
  },
};

export function blackjackStrings(id: LocaleId): BlackjackStrings {
  return BLACKJACK[id] ?? BLACKJACK.hr;
}
export function holdemStrings(id: LocaleId): HoldemStrings {
  return HOLDEM[id] ?? HOLDEM.hr;
}
