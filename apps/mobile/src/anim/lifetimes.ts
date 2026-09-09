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

// --- a played card -----------------------------------------------------------

/**
 * A flight lasts longer the further it has to go, within a band: a card from
 * the far puck and a card from my own hand should not arrive at the same
 * instant, but neither may still be in the air when the director commits the
 * card to its slot — so the ceiling IS the `cardPlayed` beat.
 */
export const FLIGHT_MIN_MS = 180;
export const FLIGHT_MAX_MS = 260;
export const FLIGHT_PER_PX = 0.2;
/**
 * How long a landed flight stays drawn over the committed card. Short, and
 * scaled by the pace: the trick sweep can take that card off the felt as
 * little as 70 ms later at half speed.
 */
export const FLIGHT_SETTLE_MS = 100;

export function flightDuration(distancePx: number): number {
  return clamp(FLIGHT_MIN_MS + FLIGHT_PER_PX * distancePx, FLIGHT_MIN_MS, FLIGHT_MAX_MS);
}

// --- the deal ------------------------------------------------------------------

export const DEAL_FLY_MS = 240;
export const DEAL_HOLD_MS = 60;
export const DEAL_FADE_MS = 120;
export const DEAL_STAGGER_MIN_MS = 40;
export const DEAL_STAGGER_MAX_MS = 140;
/** How far into its beat the last dealt back has finished fading. */
export const DEAL_DONE_AT = 0.95;

/**
 * The gap between one dealt back and the next, derived from the beat so the
 * deal fills it: eight backs at a fixed 60 ms were done at 660 ms of a
 * 1400 ms beat, and the table sat empty for the rest. The last back has
 * faded before the beat ends and the real cards land.
 */
export function dealStagger(count: number, beatMs: number): number {
  if (count <= 1) return 0;
  const lastStart = beatMs * DEAL_DONE_AT - DEAL_FLY_MS - DEAL_HOLD_MS - DEAL_FADE_MS;
  return clamp(lastStart / (count - 1), DEAL_STAGGER_MIN_MS, DEAL_STAGGER_MAX_MS);
}

// --- the trick -----------------------------------------------------------------

/** The four cards hold on the felt before they go — long enough to see who took it. */
export const SWEEP_HOLD_MS = 250;
export const SWEEP_STAGGER_MS = 40;
export const SWEEP_FLY_MS = 320;
/** Where along the flight a swept card turns face down. */
export const SWEEP_FLIP_AT = 0.35;
export const SWEEP_SETTLE_MS = 100;

// --- speech ----------------------------------------------------------------------

/** A bubble pops in, settles, holds for whatever is left of its duration, then fades. */
export const BUBBLE_IN_MS = 160;
export const BUBBLE_SETTLE_IN_MS = 90;
export const BUBBLE_OUT_MS = 180;
export const BUBBLE_SETTLE_MS = 250;
/** The least a bubble can be on screen for at speed 1: in, settle and out with no hold. */
export const BUBBLE_MIN_MS = BUBBLE_IN_MS + BUBBLE_SETTLE_IN_MS + BUBBLE_OUT_MS;

// --- rewards ---------------------------------------------------------------------

export const COIN_STAGGER_MS = 50;
export const COIN_FLY_MS = 550;
/** How many coins a scored deal sends to the wallet. */
export const COIN_CASCADE_COUNT = 6;

/** When the last of `count` coins lands — the moment the wallet may change. */
export function coinsLandedMs(count: number): number {
  return count * COIN_STAGGER_MS + COIN_FLY_MS;
}

export const CONFETTI_MS = 2100;

// --- sizes -----------------------------------------------------------------------

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
      return ((fx.rounds * fx.to.length - 1) * fx.stagger + DEAL_FLY_MS + DEAL_HOLD_MS) * fx.speed;
    case 'trickSweep':
      return (SWEEP_HOLD_MS + (fx.cards.length - 1) * SWEEP_STAGGER_MS + SWEEP_FLY_MS) * fx.speed;
    case 'bubble':
      // The pop and the fade are fixed choreography scaled by speed; a short
      // beat cannot cut them, only the hold in between.
      return Math.max(fx.duration, BUBBLE_MIN_MS * fx.speed);
    case 'coins':
      return coinsLandedMs(fx.count);
    case 'confetti':
      return CONFETTI_MS;
  }
}

/** How long the overlay keeps a sprite mounted, including its fade-out. */
export function lifetimeOf(fx: Fx): number {
  switch (fx.kind) {
    case 'flight':
      return fx.duration + FLIGHT_SETTLE_MS * fx.speed;
    case 'deal':
      return motionOf(fx) + DEAL_FADE_MS * fx.speed + 100;
    case 'trickSweep':
      return motionOf(fx) + SWEEP_SETTLE_MS;
    case 'bubble':
      return motionOf(fx) + BUBBLE_SETTLE_MS;
    case 'coins':
      return motionOf(fx) + 250;
    case 'confetti':
      return CONFETTI_MS;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
