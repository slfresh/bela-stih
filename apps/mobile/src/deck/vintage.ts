import type { Card } from '@belot/engine';

/**
 * The vintage deck: 32 photographed cards of a real printed Tell-pattern deck,
 * sliced from four public-domain photos (Wikimedia Commons, PD-self by user
 * Zakupak, 2011). See docs/deck-reference.md. Metro needs static requires,
 * hence the table.
 */
const VINTAGE: Record<string, number> = {
  'hearts_A': require('../../assets/vintage/hearts_A.jpg'),
  'hearts_K': require('../../assets/vintage/hearts_K.jpg'),
  'hearts_Q': require('../../assets/vintage/hearts_Q.jpg'),
  'hearts_J': require('../../assets/vintage/hearts_J.jpg'),
  'hearts_10': require('../../assets/vintage/hearts_10.jpg'),
  'hearts_9': require('../../assets/vintage/hearts_9.jpg'),
  'hearts_8': require('../../assets/vintage/hearts_8.jpg'),
  'hearts_7': require('../../assets/vintage/hearts_7.jpg'),
  'diamonds_A': require('../../assets/vintage/diamonds_A.jpg'),
  'diamonds_K': require('../../assets/vintage/diamonds_K.jpg'),
  'diamonds_Q': require('../../assets/vintage/diamonds_Q.jpg'),
  'diamonds_J': require('../../assets/vintage/diamonds_J.jpg'),
  'diamonds_10': require('../../assets/vintage/diamonds_10.jpg'),
  'diamonds_9': require('../../assets/vintage/diamonds_9.jpg'),
  'diamonds_8': require('../../assets/vintage/diamonds_8.jpg'),
  'diamonds_7': require('../../assets/vintage/diamonds_7.jpg'),
  'spades_A': require('../../assets/vintage/spades_A.jpg'),
  'spades_K': require('../../assets/vintage/spades_K.jpg'),
  'spades_Q': require('../../assets/vintage/spades_Q.jpg'),
  'spades_J': require('../../assets/vintage/spades_J.jpg'),
  'spades_10': require('../../assets/vintage/spades_10.jpg'),
  'spades_9': require('../../assets/vintage/spades_9.jpg'),
  'spades_8': require('../../assets/vintage/spades_8.jpg'),
  'spades_7': require('../../assets/vintage/spades_7.jpg'),
  'clubs_A': require('../../assets/vintage/clubs_A.jpg'),
  'clubs_K': require('../../assets/vintage/clubs_K.jpg'),
  'clubs_Q': require('../../assets/vintage/clubs_Q.jpg'),
  'clubs_J': require('../../assets/vintage/clubs_J.jpg'),
  'clubs_10': require('../../assets/vintage/clubs_10.jpg'),
  'clubs_9': require('../../assets/vintage/clubs_9.jpg'),
  'clubs_8': require('../../assets/vintage/clubs_8.jpg'),
  'clubs_7': require('../../assets/vintage/clubs_7.jpg'),
};

export function vintageSource(card: Card): number {
  return VINTAGE[`${card.suit}_${card.rank}`]!;
}
