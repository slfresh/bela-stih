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
/** Where along the flight an opponent's card turns face up. */
export const FLIGHT_FLIP_AT = 0.35;

/**
 * Reduce-motion: nothing flies. A card appears where it lands, a trick fades
 * where it lies, the dealt backs fade in at once — each inside the shortest
 * beat REDUCED_TIMINGS allows (250 + 80).
 */
export const FADE_FLIGHT_MS = 200;
export const FADE_SWEEP_MS = 250;
export const FADE_DEAL_MS = 200;
/** A stamp under reduce-motion: in and out, no drop, no ring. */
export const FADE_STAMP_MS = 200;
/** A bubble under reduce-motion: at most this long, fading in and out. */
export const FADE_BUBBLE_MS = 300;
export const FADE_BUBBLE_IN_MS = 60;
export const FADE_BUBBLE_OUT_MS = 80;

export function flightDuration(distancePx: number): number {
  return clamp(FLIGHT_MIN_MS + FLIGHT_PER_PX * distancePx, FLIGHT_MIN_MS, FLIGHT_MAX_MS);
}

// --- the deal ------------------------------------------------------------------

export const DEAL_FLY_MS = 240;
export const DEAL_FADE_MS = 120;
/**
 * The backs start fading this long before the beat ends, so they are half
 * gone as the real cards mount at the end-commit and turn over — one
 * continuous card, not an empty hand between the two.
 */
export const DEAL_FADE_LEAD_MS = 40;
export const DEAL_STAGGER_MIN_MS = 40;
export const DEAL_STAGGER_MAX_MS = 140;
/** How far into its beat the last dealt back has LANDED; every back then holds to the end. */
export const DEAL_DONE_AT = 0.85;

/**
 * The gap between one dealt back and the next, derived from the beat so the
 * deal fills it: eight backs at a fixed 60 ms were done at 660 ms of a
 * 1400 ms beat, and the table sat empty for the rest. The last back has
 * landed with room to sit before the beat ends and the real cards take over.
 */
export function dealStagger(count: number, beatMs: number): number {
  if (count <= 1) return 0;
  const lastStart = beatMs * DEAL_DONE_AT - DEAL_FLY_MS;
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

// --- cues --------------------------------------------------------------------------

/** A ring scaling 1 → 1.6 and fading: one beat of attention, then gone. */
export const PULSE_MS = 500;
/**
 * A pip dropping onto the plaque: 1.6 → 1 with a spring, a flash, then it is
 * the plaque's. Fits inside the call's 350 ms gap, where it lands.
 */
export const STAMP_MS = 340;

// --- rewards ---------------------------------------------------------------------

export const COIN_STAGGER_MS = 50;
export const COIN_FLY_MS = 550;
/** How many coins a scored deal sends to the wallet. */
export const COIN_CASCADE_COUNT = 6;

/**
 * How many coins fly for an award: more for more, so a match's hundred reads
 * bigger than a deal's five (4 to 12). With nothing to fly, the six there
 * always were - that count only times the level-up waiting for them.
 */
export function coinCascadeCount(coins: number): number {
  if (coins <= 0) return COIN_CASCADE_COUNT;
  if (coins <= 5) return 4;
  if (coins <= 25) return 6;
  if (coins <= 60) return 8;
  if (coins <= 110) return 10;
  return 12;
}

/** When the last of `count` coins lands — the moment the wallet may change. */
export function coinsLandedMs(count: number): number {
  return count * COIN_STAGGER_MS + COIN_FLY_MS;
}

/**
 * One ding and one soft tap per coin, as each lands: timers the caller clears
 * on unmount. The sound and haptic modules are reached lazily so this file
 * stays free of them for the tests.
 */
export function coinDingTimers(count: number, delayMs: number): ReturnType<typeof setTimeout>[] {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (let i = 0; i < count; i++) {
    timers.push(
      setTimeout(
        () => {
          void import('../audio').then((m) => m.playSfx('coin', { rate: 1 + i * 0.02 }));
          void import('../haptics').then((m) => m.pattern('coinLand'));
        },
        delayMs + COIN_FLY_MS + i * COIN_STAGGER_MS,
      ),
    );
  }
  return timers;
}

export const CONFETTI_MS = 2100;
/** A radial burst: out in the first third, then falling and fading. */
export const BURST_MS = 1400;
/**
 * The coins set off from the sheet's total this long after the deal is
 * scored: the sheet slides up at the beat's end (700 ms) over 280 ms and its
 * totals count for 600 ms more. Later than the slide, or the total's anchor
 * is measured mid-slide (a viewport low on the web) and the coins set off
 * from nowhere; the screens re-measure once more before they emit.
 */
export const COIN_CASCADE_DELAY_MS = 1400;
/** The last trick's +10 chip, from the felt to the running count. */
export const LAST_TRICK_CHIP_MS = 600;
/**
 * A match's coins wait this much longer: the fanfare lands at the end of the
 * matchOver beat (600 ms after it starts) and runs 1.4 s; the cascade and
 * its dings come after it, not under it.
 */
export const MATCH_CASCADE_HOLD_MS = 1200;

// --- table gifts -------------------------------------------------------------------

/**
 * A gift's flight from the giver's puck to the receiver's. Gifts are not table
 * events — they come between beats, from a tap or a relay — so no beat bounds
 * them; this is simply long enough to be followed across the felt.
 */
export const GIFT_FLY_MS = 700;
/** The gift's size in the air; it shrinks (or grows) to the badge it becomes. */
export const GIFT_FLIGHT_SIZE = 36;
/** The highest a gift arcs, however far it flies. */
export const GIFT_ARC_MAX = 70;

// --- sizes -----------------------------------------------------------------------

/** Card width to draw with when no slot has been measured yet. */
export const FALLBACK_CARD_W = 46;
/** Dealt and swept backs are drawn smaller than a card sitting in its slot. */
export const BACK_SCALE = 0.65;
/** The dealer's "D" and the +10 chip: the puck draws its D at this size, at its ring's top-left corner. */
export const DEALER_BADGE = 18;

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
      // Until the last back has landed; they then hold to the end of the beat.
      if (fx.fade) return FADE_DEAL_MS * fx.speed;
      return ((fx.backs.length - 1) * fx.stagger + DEAL_FLY_MS) * fx.speed;
    case 'trickSweep':
      if (fx.fade) return FADE_SWEEP_MS * fx.speed;
      return (SWEEP_HOLD_MS + (fx.cards.length - 1) * SWEEP_STAGGER_MS + SWEEP_FLY_MS) * fx.speed;
    case 'bubble':
      // The pop and the fade are fixed choreography scaled by speed; a short
      // beat cannot cut them, only the hold in between. A reduce-motion
      // bubble has no pop: it is exactly as long as it says.
      return fx.fade ? fx.duration : Math.max(fx.duration, BUBBLE_MIN_MS * fx.speed);
    case 'pulse':
      return PULSE_MS * fx.speed;
    case 'badge':
      return fx.duration;
    case 'stamp':
      return (fx.fade ? FADE_STAMP_MS : STAMP_MS) * fx.speed;
    case 'coins':
      return coinsLandedMs(fx.count);
    case 'confetti':
      return CONFETTI_MS;
    case 'burst':
      return BURST_MS;
    case 'gift':
      return fx.duration;
  }
}

/** How long the overlay keeps a sprite mounted, including its fade-out. */
export function lifetimeOf(fx: Fx): number {
  switch (fx.kind) {
    case 'flight':
      return fx.duration + FLIGHT_SETTLE_MS * fx.speed;
    case 'deal':
      // The backs fade out across the end of the beat (see DEAL_FADE_LEAD_MS);
      // under reduce-motion they are gone by it.
      if (fx.fade) return fx.beat * fx.speed + 40;
      return (fx.beat - DEAL_FADE_LEAD_MS + DEAL_FADE_MS) * fx.speed + 40;
    case 'trickSweep':
      return motionOf(fx) + SWEEP_SETTLE_MS * fx.speed;
    case 'bubble':
      // A fading bubble is gone when its motion is; the pop's tail is the settle.
      return motionOf(fx) + (fx.fade ? 40 : BUBBLE_SETTLE_MS);
    case 'pulse':
      return motionOf(fx) + 50;
    case 'badge':
      // The dealer's D lands as the puck's own D appears (the end-commit):
      // any tail would show two. The +10 chip may linger on the count.
      return motionOf(fx) + (fx.tone === 'points' ? 60 : 0);
    case 'stamp':
      return motionOf(fx) + 60;
    case 'coins':
      return motionOf(fx) + 250;
    case 'confetti':
      return CONFETTI_MS;
    case 'burst':
      return BURST_MS + 100;
    case 'gift':
      // It lands on the badge, the same size, as the badge appears: a short
      // overlap hides the hand-over and shows nothing twice.
      return motionOf(fx) + 60;
  }
}

/**
 * Where the i-th of n confetti pieces falls, 0..1 across the overlay: one
 * piece per n-th of the width, jittered by the seed. The old walk
 * (seed·131 + i·197) mod 100 stepped −3 per piece, so 18 pieces filled one
 * band over half the width and left the rest dry.
 */
export function confettiX(seed: number, i: number, n: number): number {
  const jitter = ((seed * 131 + i * 197) % 100) / 100;
  return (i + jitter) / n;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
