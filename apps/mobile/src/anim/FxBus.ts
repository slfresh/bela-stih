import type { Card, Seat } from '@belot/engine';

/**
 * A tiny imperative channel from game logic to the effects overlay.
 *
 * The director decides WHEN something happens; the screen decides WHAT sprite
 * that means; the overlay owns HOW it is drawn. This bus is the thin pipe
 * between the last two — a plain observable, no React, so spawning an effect
 * can never trigger a render cascade by itself.
 */

export interface XY {
  x: number;
  y: number;
}

/**
 * `speed` is the director's current pace (1, or 0.5 with a batch waiting) so a
 * sprite shrinks with the beat it fills; `width` is the measured card width at
 * the destination, so a flight lands the size of the card it becomes instead
 * of popping from a fixed 46px.
 */
export type Fx =
  | {
      kind: 'flight';
      card: Card;
      from: XY;
      to: XY;
      /** Already scaled by the pace. */
      duration: number;
      speed: number;
      /** Face up throughout (my own card), or face down until `flipAt`. */
      faceUp: boolean;
      /** Card width at the destination slot. */
      width: number;
      /** Width where it sets off — the fan's card, for my own — if different. */
      fromWidth?: number;
    }
  | {
      kind: 'deal';
      from: XY;
      /** Where each back lands, in the order it is dealt. */
      backs: XY[];
      /** Gap between one back and the next at speed 1, derived from the beat. */
      stagger: number;
      speed: number;
      width: number;
    }
  /** The real cards of a won trick, from their slots to the winner's puck. */
  | {
      kind: 'trickSweep';
      cards: { seat: Seat; card: Card; from: XY }[];
      to: XY;
      winner: Seat;
      speed: number;
      width: number;
    }
  | {
      kind: 'bubble';
      at: XY;
      text: string;
      tone: 'plain' | 'gold';
      /** Total time on screen at this speed; the hold is what gives. */
      duration: number;
      /** The director's pace, so the pop and fade shrink with the beat. */
      speed: number;
      big?: boolean;
    }
  /** A ring of light bursting from a point — the "your turn" cue's visible twin. */
  | { kind: 'pulse'; at: XY; speed: number }
  /** The dealer's button passing to the next seat over the scoring beat. */
  | { kind: 'badge'; from: XY; to: XY; duration: number }
  | { kind: 'coins'; from: XY; to: XY; count: number }
  | { kind: 'confetti' };

export type FxWithId = Fx & { id: number };

type Listener = (fx: FxWithId) => void;

export class FxBus {
  private nextId = 1;
  private listeners = new Set<Listener>();

  emit(fx: Fx): void {
    const withId = { ...fx, id: this.nextId++ } as FxWithId;
    for (const l of this.listeners) l(withId);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** Convenience: seat-keyed anchor ids used across the table scene. */
export const anchorId = {
  seat: (s: Seat) => `seat:${s}`,
  slot: (s: Seat) => `slot:${s}`,
  deck: 'deck',
  plaque: 'plaque',
  wallet: 'wallet',
  /**
   * The one card just tapped in the fan — set by the card at press time and
   * deleted by the spawner on its one read. The single exception to "no
   * per-card anchors": a fan of eight measured anchors would cost a layout
   * pass per tick, and only the tapped card's rect is ever wanted.
   */
  card: (id: string) => `card:${id}`,
} as const;
