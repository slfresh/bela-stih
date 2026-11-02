/**
 * The Osmice deck: 108 cards of our own design.
 *
 * The family is Crazy Eights — match the colour or the value, shed your hand —
 * which nobody owns. The deck, its names and its art are this app's own, so it
 * borrows no one's trade dress: four colours, numbers 0–9, three action cards
 * per colour and two kinds of wild.
 *
 *   per colour: one 0, two each of 1–9, two `preskok` (skip), two `obrni`
 *   (reverse), two `vuci2` (draw two)                     = 25 × 4 = 100
 *   wild:       four `divlja` (pick a colour), four `divlja4` (pick a colour,
 *               the next player draws four)               = 8
 */

export type Colour = 'red' | 'gold' | 'green' | 'blue';
export const COLOURS: readonly Colour[] = ['red', 'gold', 'green', 'blue'];

export type NumberValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type ActionValue = 'skip' | 'reverse' | 'draw2';
export type WildValue = 'wild' | 'wild4';
export type Value = NumberValue | ActionValue | WildValue;

export const NUMBERS: readonly NumberValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * One physical card. `id` is unique across the deck (there are two red 5s),
 * which is what lets a hand, a legal move and a hidden-information check all
 * name one card exactly. Wilds have no colour of their own.
 */
export interface OCard {
  id: string;
  colour: Colour | null;
  value: Value;
}

export const DECK_SIZE = 108;

export function makeDeck(): OCard[] {
  const deck: OCard[] = [];
  for (const colour of COLOURS) {
    for (const value of NUMBERS) {
      const copies = value === '0' ? 1 : 2;
      for (let c = 0; c < copies; c++) deck.push({ id: `${colour}-${value}-${c}`, colour, value });
    }
    for (const value of ['skip', 'reverse', 'draw2'] as const) {
      for (let c = 0; c < 2; c++) deck.push({ id: `${colour}-${value}-${c}`, colour, value });
    }
  }
  for (const value of ['wild', 'wild4'] as const) {
    for (let c = 0; c < 4; c++) deck.push({ id: `${value}-${c}`, colour: null, value });
  }
  return deck;
}

export const isWild = (c: OCard): boolean => c.value === 'wild' || c.value === 'wild4';
export const isNumber = (c: OCard): boolean => (NUMBERS as readonly string[]).includes(c.value);

/** What a card left in a hand costs when somebody else goes out. */
export function cardPoints(c: OCard): number {
  if (isWild(c)) return 50;
  if (isNumber(c)) return Number(c.value);
  return 20;
}

export function isColour(x: unknown): x is Colour {
  return typeof x === 'string' && (COLOURS as readonly string[]).includes(x);
}
