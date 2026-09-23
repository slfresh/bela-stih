import type { Rank } from '@belot/engine';

/**
 * The strength of the cards, strongest first, with what each is worth, for
 * the rules screen: the engine's own tables (packages/engine/src/power.ts),
 * held to pointValue and rankPower by a test so the screen cannot drift.
 */
export const TRUMP_LINE: readonly (readonly [Rank, number])[] = [
  ['J', 20],
  ['9', 14],
  ['A', 11],
  ['10', 10],
  ['K', 4],
  ['Q', 3],
  ['8', 0],
  ['7', 0],
];
export const PLAIN_LINE: readonly (readonly [Rank, number])[] = [
  ['A', 11],
  ['10', 10],
  ['K', 4],
  ['Q', 3],
  ['J', 2],
  ['9', 0],
  ['8', 0],
  ['7', 0],
];
