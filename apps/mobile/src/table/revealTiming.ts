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
