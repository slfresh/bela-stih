import type { Cause } from '@belot/game-core';
import type { Colour, OCard } from './cards';
import { top, type OsmiceAction, type OsmiceState } from './state';

/** What a table hears, in order: the animation script, and nothing in it is hidden. */
export type OsmiceEvent =
  | { kind: 'matchStarted'; matchNumber: number }
  | { kind: 'roundStarted'; roundNumber: number; dealer: number; first: number; top: OCard; colour: Colour; handSize: number }
  | { kind: 'cardPlayed'; seat: number; card: OCard; colour: Colour }
  /** How many, never which: a drawn card is the drawer's secret. */
  | { kind: 'drew'; seat: number; count: number; penalty: boolean }
  | { kind: 'passed'; seat: number }
  | { kind: 'skipped'; seat: number }
  | { kind: 'reversed'; direction: 1 | -1 }
  | { kind: 'reshuffled'; count: number }
  /** One card left: the table says it out loud ("zadnja!"). */
  | { kind: 'lastCard'; seat: number }
  | { kind: 'roundOver'; winner: number; points: number; left: number[]; scores: number[] }
  | { kind: 'matchOver'; winner: number; scores: number[] };

export function deriveOsmiceEvents(before: OsmiceState, after: OsmiceState, cause: Cause<OsmiceAction>): OsmiceEvent[] {
  const out: OsmiceEvent[] = [];
  if (cause.kind === 'newMatch') out.push({ kind: 'matchStarted', matchNumber: cause.matchNumber });
  if (cause.kind === 'startRound' || cause.kind === 'newMatch') {
    out.push({
      kind: 'roundStarted',
      roundNumber: after.roundNumber,
      dealer: after.dealer,
      first: after.turn,
      top: { ...top(after)! },
      colour: after.colour,
      handSize: after.config.handSize,
    });
    return out;
  }
  if (cause.kind !== 'action') return out;
  const a = cause.action;
  const note = after.note;
  if (!note) return out;

  if (note.kind === 'played' && note.card) {
    out.push({ kind: 'cardPlayed', seat: a.seat, card: { ...note.card }, colour: after.colour });
    if (note.reversed) out.push({ kind: 'reversed', direction: after.direction });
    if (note.reshuffled) out.push({ kind: 'reshuffled', count: note.reshuffled });
    if (note.penalty) out.push({ kind: 'drew', seat: note.penalty.seat, count: note.penalty.count, penalty: true });
    if (note.skipped !== undefined) out.push({ kind: 'skipped', seat: note.skipped });
  } else if (note.kind === 'drew') {
    if (note.reshuffled) out.push({ kind: 'reshuffled', count: note.reshuffled });
    out.push({ kind: 'drew', seat: a.seat, count: note.drewCount ?? 0, penalty: before.pendingDraw > 0 });
  } else if (note.kind === 'passed') {
    out.push({ kind: 'passed', seat: a.seat });
  }

  // Down to one card: said for every seat it happens to (a played card, never a draw).
  for (let seat = 0; seat < after.seats; seat++) {
    if (after.hands[seat]!.length === 1 && before.hands[seat]!.length !== 1) out.push({ kind: 'lastCard', seat });
  }

  if (before.phase === 'PLAY' && after.phase !== 'PLAY' && after.lastRound) {
    out.push({
      kind: 'roundOver',
      winner: after.lastRound.winner,
      points: after.lastRound.points,
      left: after.lastRound.left.slice(),
      scores: after.scores.slice(),
    });
  }
  if (after.phase === 'MATCH_OVER' && before.phase !== 'MATCH_OVER') {
    out.push({ kind: 'matchOver', winner: after.lastRound!.winner, scores: after.scores.slice() });
  }
  return out;
}
