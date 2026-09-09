import type { Card, PublicView, Seat } from '@belot/engine';
import { cardId } from '@belot/engine';
import type { TableEvent } from '@belot/table';

/**
 * Things the table itself does in reaction to an event — a puck nodding, the
 * felt shaking, a card glowing — as opposed to a sprite the overlay draws.
 * The games compute one per event as it starts and hand it to the table
 * screen, which plays it once; `n` makes each one new even when two are
 * otherwise identical.
 */
export type TableCue =
  | { kind: 'nod'; seat: Seat; n: number }
  | { kind: 'pulse'; seat: Seat; n: number }
  | { kind: 'shake'; amp: number; n: number }
  | { kind: 'glow'; cardIds: string[]; n: number }
  /** Every trick to one side: the felt shakes and a burst goes up from its centre. */
  | { kind: 'stiglja'; n: number };

/** A declaration's weight, 1–4, from its summed value: 20 / 50 / 100 / 150 and up. */
export function declarationWeight(values: number[]): 1 | 2 | 3 | 4 {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum >= 150) return 4;
  if (sum >= 100) return 3;
  if (sum >= 50) return 2;
  return 1;
}

/**
 * The cue an event calls for as it starts, if any. `view` is the presentation
 * view before the event's start patch — a bela's partner card is still in
 * the hand there.
 */
export function cueFor(e: TableEvent, mySeat: Seat, view: PublicView | null, n: number): TableCue | null {
  switch (e.kind) {
    case 'bidPassed':
    case 'doublePassed':
      return { kind: 'nod', seat: e.seat, n };
    case 'doubled':
      return { kind: 'shake', amp: e.multiplier === 4 ? 5 : 3, n };
    case 'dealScored':
      return e.result.valatTeam !== null ? { kind: 'stiglja', n } : null;
    case 'declared':
      return declarationWeight(e.declarations.map((d) => d.value)) >= 3
        ? { kind: 'pulse', seat: e.seat, n }
        : null;
    case 'belaCalled': {
      if (e.seat !== mySeat) return { kind: 'pulse', seat: e.seat, n };
      // My own bela: the king and queen of trumps glow — the one still in my
      // hand, and the one leaving it in the same beat.
      const trump = view?.context.trumpSuit ?? null;
      if (!trump) return null;
      const royals = (view?.hand ?? []).filter(
        (c: Card) => c.suit === trump && (c.rank === 'K' || c.rank === 'Q'),
      );
      return royals.length > 0 ? { kind: 'glow', cardIds: royals.map(cardId), n } : null;
    }
    default:
      return null;
  }
}
