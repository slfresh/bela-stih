import {
  applyAction,
  cardId,
  createMatch,
  currentActor,
  legalActions,
  matchWinner,
  publicView,
  startDeal,
  teamOf,
  DEFAULT_CONFIG,
  type Action,
  type EngineConfig,
  type GameState,
  type PublicView,
  type Seat,
} from '@belot/engine';
import { decideAction, type BotMemory } from '@belot/bots';
import type { GameDefinition, Secret } from '@belot/game-core';
import { deriveBelaEvents, type TableEvent } from './events';
import { cleanAction } from './normalize';

/**
 * Bela behind the game contract.
 *
 * Every member is a one-liner over the engine and bots exactly as they ship:
 * nothing here re-implements a rule, so the golden corpus pins this adapter
 * as tightly as it pins the engine.
 */

export type BelaDefinition = GameDefinition<GameState, Action, PublicView, TableEvent, EngineConfig>;

const asSeat = (seat: number): Seat => {
  if (seat !== 0 && seat !== 1 && seat !== 2 && seat !== 3) throw new Error(`bela has no seat ${seat}`);
  return seat;
};

export const BELA: BelaDefinition = {
  meta: {
    id: 'bela',
    minPlayers: 4,
    maxPlayers: 4,
    teams: { count: 2, teamOf: (seat) => teamOf(asSeat(seat)) },
    deck: 'madarice32',
    betting: false,
    casino: false,
    simultaneous: false,
    // Friends who join one after another land as partners: 0 and 2, then 1 and 3.
    seatFillOrder: () => [0, 2, 1, 3],
    windowMs: 30_000,
    nextRoundMs: 13_000,
  },
  defaultConfig: DEFAULT_CONFIG,

  createMatch({ seats, seed, rng, config, dealer }) {
    if (seats !== 4) throw new Error(`bela is played by exactly 4, not ${seats}`);
    return createMatch({ seed, rng, config, dealer: dealer === undefined ? undefined : asSeat(dealer) });
  },
  startRound: startDeal,
  roundOver: (s) => s.phase === 'DEAL_OVER',
  matchOver: (s) => s.phase === 'MATCH_OVER',

  actors(s) {
    const seat = currentActor(s);
    return seat === null ? [] : [seat];
  },
  seatStatus: () => 'active',
  legalActions: (s, seat) => legalActions(s).filter((a) => a.seat === seat),
  normalize: (_s, seat, raw) => cleanAction(raw, asSeat(seat)),
  defaultAction: (s, seat, rng, level) =>
    decideAction(publicView(s, asSeat(seat)), rng, level, { completedTricks: s.completedTricks }),
  apply: applyAction,

  view: (s, seat) => publicView(s, asSeat(seat)),
  secrets(s): Secret[] {
    // Cards in a hand are hidden from the other three — except the winning
    // side's zvanja, which go face up on the table once the asking closes.
    const shown = new Set(s.revealedDeclarations.flatMap((d) => d.cards.map(cardId)));
    const out: Secret[] = s.hands.map((hand, seat) => ({
      tokens: hand.map(cardId).filter((id) => !shown.has(id)),
      visibleTo: [seat],
    }));
    out.push({ tokens: s.stock.map(cardId), visibleTo: [] });
    return out;
  },
  // Skipping is a private "nothing to say": broadcasting it would tell the
  // table which seats hold no zvanja.
  isEventPublic: (e) => e.kind !== 'declarationSkipped',
  deriveEvents: deriveBelaEvents,

  winners(s) {
    const team = matchWinner(s);
    return team === null ? null : [team];
  },
  settlement: () => null,

  bot: {
    decide: (view, rng, level, memory) => decideAction(view, rng, level, memory as BotMemory | undefined),
    memory: (s): BotMemory => ({ completedTricks: s.completedTricks }),
  },
};
