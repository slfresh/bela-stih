/**
 * The turn clocks a private table's host may pick, in seconds. The server's
 * TURN_CHOICES (apps/server/src/protocol.ts) is the authority - it refuses
 * anything else - and a test keeps the two lists the same.
 */
export const TURN_CHOICES_S: readonly number[] = [30, 60, 90];
