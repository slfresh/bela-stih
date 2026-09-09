import type { Fx } from './FxBus';

/**
 * Every sprite's timing, in one place.
 *
 * The overlay animates with these numbers and the tests bound them against
 * the director's beats, so a sprite can never quietly outlive the event it
 * decorates. Previously each constant lived where it was used — a 260 at the
 * spawn site, a 240 and a 60 inside the overlay — and nothing checked that the
 * sum fitted the beat, or shrank when the director ran at half speed.
 */
export const FLIGHT_MS = 260;
export const FLIGHT_SETTLE_MS = 150;

export const DEAL_STAGGER_MS = 60;
export const DEAL_FLY_MS = 240;
export const DEAL_HOLD_MS = 60;
export const DEAL_FADE_MS = 120;

export const SWEEP_STAGGER_MS = 40;
export const SWEEP_FLY_MS = 320;

/** A bubble pops in, settles, holds for whatever is left of its duration, then fades. */
export const BUBBLE_IN_MS = 160;
export const BUBBLE_SETTLE_IN_MS = 90;
export const BUBBLE_OUT_MS = 180;
export const BUBBLE_SETTLE_MS = 250;
/** The least a bubble can be on screen for at speed 1: in, settle and out with no hold. */
export const BUBBLE_MIN_MS = BUBBLE_IN_MS + BUBBLE_SETTLE_IN_MS + BUBBLE_OUT_MS;

export const COIN_STAGGER_MS = 50;
export const COIN_FLY_MS = 550;

export const CONFETTI_MS = 2100;

/** Card width to draw with when no slot has been measured yet. */
export const FALLBACK_CARD_W = 46;
/** Dealt and swept backs are drawn smaller than a card sitting in its slot. */
export const BACK_SCALE = 0.65;

/**
 * How long a sprite is visibly MOVING — until the last card has landed or the
 * bubble has finished its hold. This is what has to fit inside the director's
 * beat; the fade tail in `lifetimeOf` may spill into the gap that follows.
 */
export function motionOf(fx: Fx): number {
  switch (fx.kind) {
    case 'flight':
      return fx.duration;
    case 'deal':
      return (fx.rounds * fx.to.length * DEAL_STAGGER_MS + DEAL_FLY_MS + DEAL_HOLD_MS) * fx.speed;
    case 'sweep':
      return (fx.from.length * SWEEP_STAGGER_MS + SWEEP_FLY_MS) * fx.speed;
    case 'bubble':
      // The pop and the fade are fixed choreography scaled by speed; a short
      // beat cannot cut them, only the hold in between.
      return Math.max(fx.duration, BUBBLE_MIN_MS * fx.speed);
    case 'coins':
      return fx.count * COIN_STAGGER_MS + COIN_FLY_MS;
    case 'confetti':
      return CONFETTI_MS;
  }
}

/** How long the overlay keeps a sprite mounted, including its fade-out. */
export function lifetimeOf(fx: Fx): number {
  switch (fx.kind) {
    case 'flight':
      return fx.duration + FLIGHT_SETTLE_MS;
    case 'deal':
      return (
        (fx.rounds * fx.to.length * DEAL_STAGGER_MS + DEAL_FLY_MS + DEAL_HOLD_MS + DEAL_FADE_MS) *
          fx.speed +
        100
      );
    case 'sweep':
      return (fx.from.length * SWEEP_STAGGER_MS + SWEEP_FLY_MS) * fx.speed + 100;
    case 'bubble':
      return motionOf(fx) + BUBBLE_SETTLE_MS;
    case 'coins':
      return fx.count * COIN_STAGGER_MS + COIN_FLY_MS + 250;
    case 'confetti':
      return CONFETTI_MS;
  }
}
