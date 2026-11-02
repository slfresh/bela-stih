import type { Cause, GameDefinition, Secret } from '@belot/game-core';
import { looksLikeAction, matchLegal } from '@belot/game-core';

/**
 * A toy game that exercises every axis of the contract the Bela adapter does
 * not: a variable number of seats, a SIMULTANEOUS ante window where every seat
 * must say READY before play, then single-actor turns taking 1..3 from a pile.
 * Whoever takes the last chip wins the round; first to `target` rounds wins.
 * Each seat's "secret" is the number it would like to take next.
 */

export interface ToyConfig {
  pile: number;
  target: number;
}

export interface ToyState {
  seats: number;
  config: ToyConfig;
  dealer: number;
  phase: 'ANTE' | 'PLAY' | 'ROUND_OVER' | 'MATCH_OVER';
  ready: boolean[];
  pile: number;
  turn: number;
  wish: number[];
  roundWins: number[];
  rounds: number;
}

export type ToyAction =
  | { type: 'READY'; seat: number }
  | { type: 'TAKE'; seat: number; n: number };

export interface ToyView {
  seat: number;
  phase: ToyState['phase'];
  pile: number;
  myWish: number;
  legal: ToyAction[];
}

export type ToyEvent =
  | { kind: 'roundStarted'; dealer: number }
  | { kind: 'ready'; seat: number }
  | { kind: 'took'; seat: number; n: number }
  | { kind: 'roundWon'; seat: number }
  | { kind: 'matchOver'; winner: number }
  | { kind: 'matchStarted'; matchNumber: number };

const next = (s: ToyState, seat: number): number => (seat + 1) % s.seats;

export const TOY: GameDefinition<ToyState, ToyAction, ToyView, ToyEvent, ToyConfig> = {
  meta: {
    id: 'toy',
    minPlayers: 2,
    maxPlayers: 6,
    teams: null,
    deck: 'custom',
    betting: false,
    casino: false,
    simultaneous: true,
    windowMs: 1000,
    nextRoundMs: 1000,
  },
  defaultConfig: { pile: 7, target: 2 },

  createMatch({ seats, config, dealer, rng, seed }) {
    const cfg = { ...TOY.defaultConfig, ...config };
    const r = rng ?? (() => ((seed * 9301 + 49297) % 233280) / 233280);
    return {
      seats,
      config: cfg,
      dealer: dealer ?? 0,
      phase: 'ROUND_OVER',
      ready: Array(seats).fill(false),
      pile: 0,
      turn: 0,
      wish: Array.from({ length: seats }, () => 1 + Math.floor(r() * 3)),
      roundWins: Array(seats).fill(0),
      rounds: 0,
    };
  },
  startRound(s) {
    return { ...s, phase: 'ANTE', ready: Array(s.seats).fill(false), pile: s.config.pile, turn: next(s, s.dealer) };
  },
  roundOver: (s) => s.phase === 'ROUND_OVER' || s.phase === 'MATCH_OVER',
  matchOver: (s) => s.phase === 'MATCH_OVER',

  actors(s) {
    if (s.phase === 'ANTE') return s.ready.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
    if (s.phase === 'PLAY') return [s.turn];
    return [];
  },
  seatStatus: () => 'active',
  legalActions(s, seat) {
    if (!TOY.actors(s).includes(seat)) return [];
    if (s.phase === 'ANTE') return [{ type: 'READY', seat }];
    return [1, 2, 3].filter((n) => n <= s.pile).map((n) => ({ type: 'TAKE', seat, n }));
  },
  normalize(s, seat, raw) {
    return looksLikeAction(raw, seat) ? matchLegal(TOY.legalActions(s, seat), raw) : null;
  },
  defaultAction(s, seat) {
    return s.phase === 'ANTE' ? { type: 'READY', seat } : { type: 'TAKE', seat, n: 1 };
  },
  apply(s, a) {
    const legal = TOY.legalActions(s, a.seat);
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a))) throw new Error(`illegal ${a.type}`);
    if (a.type === 'READY') {
      const ready = s.ready.slice();
      ready[a.seat] = true;
      return { ...s, ready, phase: ready.every(Boolean) ? 'PLAY' : 'ANTE' };
    }
    const pile = s.pile - a.n;
    if (pile > 0) return { ...s, pile, turn: next(s, a.seat) };
    const roundWins = s.roundWins.slice();
    roundWins[a.seat] += 1;
    const won = roundWins[a.seat] >= s.config.target;
    return {
      ...s,
      pile,
      roundWins,
      rounds: s.rounds + 1,
      dealer: next(s, s.dealer),
      phase: won ? 'MATCH_OVER' : 'ROUND_OVER',
    };
  },

  view(s, seat) {
    return { seat, phase: s.phase, pile: s.pile, myWish: s.wish[seat]!, legal: TOY.legalActions(s, seat) };
  },
  secrets(s): Secret[] {
    return s.wish.map((w, seat) => ({ tokens: [`wish:${seat}:${w}`], visibleTo: [seat] }));
  },
  isEventPublic: () => true,
  deriveEvents(before, after, cause: Cause<ToyAction>) {
    const out: ToyEvent[] = [];
    if (cause.kind === 'newMatch') out.push({ kind: 'matchStarted', matchNumber: cause.matchNumber });
    if (cause.kind === 'startRound' || cause.kind === 'newMatch') out.push({ kind: 'roundStarted', dealer: after.dealer });
    if (cause.kind === 'action') {
      const a = cause.action;
      if (a.type === 'READY') out.push({ kind: 'ready', seat: a.seat });
      else out.push({ kind: 'took', seat: a.seat, n: a.n });
      if (before.phase === 'PLAY' && after.phase !== 'PLAY') out.push({ kind: 'roundWon', seat: a.seat });
      if (after.phase === 'MATCH_OVER') out.push({ kind: 'matchOver', winner: a.seat });
    }
    return out;
  },

  winners(s) {
    if (s.phase !== 'MATCH_OVER') return null;
    const best = Math.max(...s.roundWins);
    return s.roundWins.map((w, i) => (w === best ? i : -1)).filter((i) => i >= 0);
  },
  settlement: () => null,

  bot: {
    decide(view, rng) {
      const legal = view.legal;
      if (legal.length === 0) throw new Error('bot asked to act with nothing legal');
      return legal[Math.floor(rng() * legal.length)]!;
    },
  },
};
