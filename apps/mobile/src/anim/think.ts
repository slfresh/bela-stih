import type { PublicView } from '@belot/engine';
import type { TableEvent } from '@belot/table';

/**
 * How long a bot seems to think before its move shows, in ms at full pace,
 * for a draw `r` in [0, 1). Timing only - the bots' choices are untouched.
 *
 * Every bot card used to land exactly 400 ms after the last, a metronome no
 * table of people keeps. Now a follow is quick and sometimes instant (it is
 * often forced), a lead takes longer (it is a real choice), and calling trump
 * takes longest of all.
 */
export function botThinkMs(e: TableEvent, view: PublicView, r: number): number {
  switch (e.kind) {
    case 'cardPlayed':
      return Math.round((view.currentTrick.length === 0 ? 100 : 0) + r * (view.currentTrick.length === 0 ? 300 : 200));
    case 'bidPassed':
      return Math.round(150 + r * 350);
    case 'bidCalled':
      return Math.round(350 + r * 450);
    case 'doubled':
      return Math.round(400 + r * 400);
    case 'doublePassed':
      return Math.round(80 + r * 220);
    default:
      return 0;
  }
}
