import type { Colour, OCard } from './cards';
import { legalActions, top, type OsmiceAction, type OsmicePhase, type OsmiceState, type RoundResult } from './state';

/** What one seat may see: its own hand, everyone's counts, the pile and the score. */
export interface OsmiceView {
  seat: number;
  seats: number;
  phase: OsmicePhase;
  dealer: number;
  roundNumber: number;
  hand: OCard[];
  handCounts: number[];
  top: OCard | null;
  colour: Colour;
  direction: 1 | -1;
  /** Whose turn it is; null between rounds. */
  toAct: number | null;
  pendingDraw: number;
  /** Cards still drawable: the draw pile and the discard under the top card. */
  drawPileCount: number;
  /** The card I just drew and may still play (only ever my own). */
  drawn: OCard | null;
  scores: number[];
  matchTarget: number;
  /** Per seat, the colours they drew on this round (public). */
  drewOn: Colour[][];
  lastRound: RoundResult | null;
  legalActions: OsmiceAction[];
}

export function publicView(s: OsmiceState, seat: number): OsmiceView {
  return {
    seat,
    seats: s.seats,
    phase: s.phase,
    dealer: s.dealer,
    roundNumber: s.roundNumber,
    hand: s.hands[seat]!.map((c) => ({ ...c })),
    handCounts: s.hands.map((h) => h.length),
    top: top(s),
    colour: s.colour,
    direction: s.direction,
    toAct: s.phase === 'PLAY' ? s.turn : null,
    pendingDraw: s.pendingDraw,
    // What can still be drawn: the pile, plus the discard under the top card,
    // which is shuffled back in when the pile runs out. The pile alone read 0
    // on a deck that could still be tapped.
    drawPileCount: s.drawPile.length + Math.max(0, s.discard.length - 1),
    drawn: s.turn === seat && s.drawn ? { ...s.drawn } : null,
    scores: s.scores.slice(),
    matchTarget: s.config.matchTarget,
    drewOn: s.drewOn.map((d) => d.slice()),
    lastRound: s.lastRound ? { ...s.lastRound, left: s.lastRound.left.slice() } : null,
    legalActions: legalActions(s, seat),
  };
}
