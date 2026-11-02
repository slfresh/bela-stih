import { OSMICE, type OsmiceConfig } from '@belot/games-osmice';
import { GameRoom, type CreateOptions } from './room/GameRoom';

/**
 * An authoritative Osmice table: everything a table does is GameRoom's; this
 * room only reads how many sit at it and how long the match runs.
 *
 * Quick play is four at a table, to 500. A private table's host picks the
 * number of seats (2 to 6) when creating it, and the match length.
 */

/** Match lengths a private table's host may choose; quick play keeps the last. */
export const OSMICE_TARGETS: readonly number[] = [200, 300, 500];
const QUICK_SEATS = 4;

export class OsmiceRoom extends GameRoom<typeof OSMICE> {
  protected readonly def = OSMICE;
  private target = 500;

  protected override seatsFor(options: CreateOptions): number {
    const n = options.seats;
    return options.private === true && Number.isInteger(n) && (n as number) >= OSMICE.meta.minPlayers && (n as number) <= OSMICE.meta.maxPlayers
      ? (n as number)
      : QUICK_SEATS;
  }

  protected override readOptions(options: CreateOptions): void {
    if (options.private === true && typeof options.target === 'number' && OSMICE_TARGETS.includes(options.target)) {
      this.target = options.target;
    }
  }

  protected override sessionConfig(): Partial<OsmiceConfig> {
    return { matchTarget: this.target };
  }

  protected override rulesPublic(): Record<string, unknown> {
    return { matchTarget: this.target };
  }
}
