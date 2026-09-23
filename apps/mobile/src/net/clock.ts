/**
 * The turn clocks a private table's host may pick, in seconds. The server's
 * TURN_CHOICES (apps/server/src/protocol.ts) is the authority - it refuses
 * anything else - and a test keeps the two lists the same.
 */
export const TURN_CHOICES_S: readonly number[] = [30, 60, 90];

/**
 * The match lengths a private table's host may pick. The server's
 * MATCH_TARGETS is the authority, and the same test keeps these in step.
 */
export const MATCH_TARGETS_P: readonly number[] = [501, 701, 1001];
