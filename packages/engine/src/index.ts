/**
 * @belot/engine — the crown jewels.
 *
 * A pure, deterministic, configurable Balkan Belot rules engine + scoring.
 * No UI, no IO. The SAME module runs on device (offline vs AI) and on the
 * Colyseus server (validate every move, secure server-side shuffle).
 */

// card primitives + deterministic RNG
export {
  makeDeck,
  cardId,
  parseCard,
  cardEquals,
  hasCard,
  removeCard,
  makeRng,
  shuffle,
  type Rng,
} from './cards';

// derivations (the two value/rank systems)
export {
  isTrump,
  rankPower,
  pointValue,
  naturalOrder,
  CARD_POINTS_TOTAL,
} from './power';

// trick resolution
export { beats, trickWinnerIndex } from './compare';

// legality
export { legalPlays, type LegalityInput } from './legality';

// declarations
export {
  detectDeclarations,
  resolveDeclarations,
  type DeclarationResolution,
} from './declarations';

// scoring
export {
  computeDealProgress,
  scoreDeal,
  type DealProgressInput,
  type DealScoreInput,
  type DealScoreResult,
  type DealTrick,
} from './scoring';

// state machine
export {
  teamOf,
  createMatch,
  startDeal,
  legalActions,
  currentActor,
  applyAction,
  matchWinner,
  publicView,
  type GameState,
  type CreateMatchOptions,
} from './state';

// re-export the shared vocabulary for convenience
export * from '@belot/shared-types';
