import { looksLikeAction, matchLegal, type GameDefinition, type Secret } from '@belot/game-core';
import { isColour } from './cards';
import { decideOsmice } from './bots';
import { deriveOsmiceEvents, type OsmiceEvent } from './events';
import {
  applyAction,
  createMatch,
  currentActor,
  DEFAULT_OSMICE_CONFIG,
  legalActions,
  matchWinner,
  startRound,
  type OsmiceAction,
  type OsmiceConfig,
  type OsmiceState,
} from './state';
import { publicView, type OsmiceView } from './view';

export type OsmiceDefinition = GameDefinition<OsmiceState, OsmiceAction, OsmiceView, OsmiceEvent, OsmiceConfig>;

/** Rebuild a move off the wire from primitives only, then insist it is one of the legal ones. */
function normalize(s: OsmiceState, seat: number, raw: unknown): OsmiceAction | null {
  if (!looksLikeAction(raw, seat)) return null;
  const r = raw as Record<string, unknown>;
  let rebuilt: OsmiceAction;
  if (r.type === 'DRAW' || r.type === 'PASS') rebuilt = { type: r.type, seat };
  else if (r.type === 'PLAY' && typeof r.cardId === 'string' && r.cardId.length <= 16) {
    rebuilt = { type: 'PLAY', seat, cardId: r.cardId, ...(isColour(r.colour) ? { colour: r.colour } : {}) };
  } else return null;
  return matchLegal(legalActions(s, seat), rebuilt);
}

export const OSMICE: OsmiceDefinition = {
  meta: {
    id: 'osmice',
    minPlayers: 2,
    maxPlayers: 6,
    teams: null,
    deck: 'custom',
    betting: false,
    casino: false,
    simultaneous: false,
    windowMs: 30_000,
    nextRoundMs: 8_000,
  },
  defaultConfig: DEFAULT_OSMICE_CONFIG,

  createMatch: (o) => createMatch(o),
  startRound,
  roundOver: (s) => s.phase === 'ROUND_OVER',
  matchOver: (s) => s.phase === 'MATCH_OVER',

  actors(s) {
    const seat = currentActor(s);
    return seat === null ? [] : [seat];
  },
  seatStatus: () => 'active',
  legalActions,
  normalize,
  // A player who runs out of time draws (or, having drawn, keeps the card).
  defaultAction: (s, seat) => (s.drawn ? { type: 'PASS', seat } : (legalActions(s, seat).find((a) => a.type === 'DRAW') ?? legalActions(s, seat)[0]!)),
  apply: applyAction,

  view: publicView,
  secrets(s): Secret[] {
    const out: Secret[] = s.hands.map((hand, seat) => ({ tokens: hand.map((c) => c.id), visibleTo: [seat] }));
    out.push({ tokens: s.drawPile.map((c) => c.id), visibleTo: [] });
    return out;
  },
  isEventPublic: () => true,
  deriveEvents: deriveOsmiceEvents,

  winners(s) {
    const w = matchWinner(s);
    return w === null ? null : [w];
  },
  settlement: () => null,

  bot: {
    decide: (view, rng, level) => decideOsmice(view, rng, level),
  },
};
