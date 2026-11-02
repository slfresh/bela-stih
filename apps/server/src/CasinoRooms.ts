import { BACCARAT, type BaccaratConfig } from '@belot/games-baccarat';
import { BLACKJACK, type BlackjackConfig } from '@belot/games-blackjack';
import { HOLDEM, type HoldemConfig } from '@belot/games-holdem';
import type { AnyGame } from '@belot/game-core';
import { GameRoom, type CreateOptions } from './room/GameRoom';

/**
 * The casino tables online. Everything a table does is GameRoom's; these
 * rooms only say how many sit at quick play, and let a private table's host
 * pick the number of seats when creating it.
 *
 * Stacks are the table's own play chips: the server knows nothing of anyone's
 * balance (there are no accounts), and a seat's app settles its own balance
 * from what it stood up with.
 */

function seats(def: AnyGame, options: CreateOptions, quick: number): number {
  const n = options.seats;
  return options.private === true && Number.isInteger(n) && (n as number) >= def.meta.minPlayers && (n as number) <= def.meta.maxPlayers
    ? (n as number)
    : quick;
}

export class BaccaratRoom extends GameRoom<typeof BACCARAT> {
  protected readonly def = BACCARAT;
  protected override seatsFor(options: CreateOptions): number {
    return seats(BACCARAT, options, 5);
  }
  protected override readOptions(): void {}
  protected override sessionConfig(): Partial<BaccaratConfig> {
    return {};
  }
}

export class BlackjackRoom extends GameRoom<typeof BLACKJACK> {
  protected readonly def = BLACKJACK;
  protected override seatsFor(options: CreateOptions): number {
    return seats(BLACKJACK, options, 4);
  }
  protected override readOptions(): void {}
  protected override sessionConfig(): Partial<BlackjackConfig> {
    return {};
  }
}

export class HoldemRoom extends GameRoom<typeof HOLDEM> {
  protected readonly def = HOLDEM;
  protected override seatsFor(options: CreateOptions): number {
    return seats(HOLDEM, options, 6);
  }
  protected override readOptions(): void {}
  protected override sessionConfig(): Partial<HoldemConfig> {
    return {};
  }
}
