import { REVEAL_MS } from '../anim/director';

/**
 * When the zvanja reveal comes down.
 *
 * The cards are up for REVEAL_MS (the director holds the table exactly that
 * long, under every motion policy — remembering them is a skill of the game)
 * and they LEAVE inside that window: the exit starts REVEAL_EXIT_MS before
 * the end so the row is empty at REVEAL_MS, when it unmounts. A tap starts the
 * same exit early. Pure, so the timeline is a test rather than a hope.
 */
export const REVEAL_EXIT_MS = 300;

/** One card's flight back to the announcer. */
export const REVEAL_OUT_MS = 200;
/** The bar's fade on the way out. */
export const REVEAL_BAR_FADE_MS = 200;
/**
 * Headroom inside the exit for the render, commit and effect between
 * setRevealPhase('leaving') and the first animated frame.
 */
export const REVEAL_EXIT_SLACK_MS = 40;
const OUT_STAGGER_MS = 20;

/**
 * When card `index` of `count` sets off back to the announcer: 20 ms apart,
 * squeezed so the LAST card is home before the row unmounts. A carre keeps
 * its 20 ms; a 20-card reveal shares the same 60 ms. (At a fixed 20 ms, card
 * 3 onwards was still flying, half visible, when the row went.)
 */
export function revealExitDelay(index: number, count: number): number {
  if (count <= 1) return 0;
  const room = Math.max(0, REVEAL_EXIT_MS - REVEAL_EXIT_SLACK_MS - REVEAL_OUT_MS);
  return index * Math.min(OUT_STAGGER_MS, room / (count - 1));
}

export type RevealPhase = 'showing' | 'leaving' | 'gone';

/** When the exit starts, given a tap at `tappedAt` ms (or none). */
export function revealExitAt(tappedAt: number | null): number {
  const natural = REVEAL_MS - REVEAL_EXIT_MS;
  return tappedAt === null ? natural : Math.min(Math.max(0, tappedAt), natural);
}

export function revealPhase(elapsed: number, tappedAt: number | null): RevealPhase {
  const exitAt = revealExitAt(tappedAt);
  if (elapsed >= exitAt + REVEAL_EXIT_MS) return 'gone';
  if (elapsed >= exitAt) return 'leaving';
  return 'showing';
}
