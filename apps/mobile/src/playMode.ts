import { HARD_CONFIG_OVERRIDES, type EngineConfig } from '@belot/engine';
import type { Lang } from '@belot/i18n';

/**
 * The three versions of the game, each a set of the engine's own switches
 * (the rules themselves are untouched):
 *
 *  - `learn` (Učenje): the app finds your zvanja, never lets a wrong card go,
 *    and coaches - what to call, what to play, when štiglja is on.
 *  - `easy` (Lagana): real bela at the table - you find and call your own
 *    zvanja and bela ("blind"), but a wrong card is refused, with the reason.
 *  - `hard` (Prava bela): no help at all - blind zvanja, and a wrong card
 *    loses the deal (renons); afterwards the app says what should have gone.
 *
 * The server keeps the same table (apps/server/src/protocol.ts, cross-checked
 * by a test); quick play is always `easy`.
 */
export type PlayMode = 'learn' | 'easy' | 'hard';

export const PLAY_MODES: readonly PlayMode[] = ['learn', 'easy', 'hard'];

export const MODE_CONFIG: Record<PlayMode, Partial<EngineConfig>> = {
  learn: {},
  easy: { declarationMode: 'blind' },
  hard: HARD_CONFIG_OVERRIDES,
};

/** Zvanja and bela are the player's to find: the engine tells nobody what they hold. */
export const blindZvanja = (m: PlayMode): boolean => m !== 'learn';
/** Every card may be sent, and a wrong one is a renons (only Prava bela). */
export const freePlay = (m: PlayMode): boolean => m === 'hard';
/** The coach speaks (only Učenje). */
export const coaches = (m: PlayMode): boolean => m === 'learn';
/**
 * A tap on a card the rules forbid: Učenje says why in a bubble over the hand
 * ("Moraš odgovoriti na boju"); Lagana only dims and shakes the card - the
 * player asked for no bubbles there. (Prava bela forbids no card.)
 */
export const explainsRefusals = (m: PlayMode): boolean => m === 'learn';

export function isPlayMode(x: unknown): x is PlayMode {
  return x === 'learn' || x === 'easy' || x === 'hard';
}

/**
 * A server (or a record) from before the three versions knew only "hard":
 * its not-hard tables were today's Učenje rules (the engine announced zvanja).
 */
export function modeFromLegacy(hard: boolean | undefined): PlayMode {
  return hard === true ? 'hard' : 'learn';
}

/** The version's name as the player reads it. */
export function modeName(lang: Lang, m: PlayMode): string {
  return m === 'learn' ? lang.s.difficultyLearn : m === 'hard' ? lang.s.difficultyHard : lang.s.difficultyEasy;
}
