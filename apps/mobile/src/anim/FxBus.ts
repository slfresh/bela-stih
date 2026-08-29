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

export type Fx =
  | { kind: 'flight'; card: Card; from: XY; to: XY; duration: number; faceUp: boolean }
  | { kind: 'deal'; from: XY; to: XY[]; rounds: number }
  | { kind: 'sweep'; from: XY[]; to: XY }
  | { kind: 'bubble'; at: XY; text: string; tone: 'plain' | 'gold'; duration: number; big?: boolean }
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
  wallet: 'wallet',
} as const;
