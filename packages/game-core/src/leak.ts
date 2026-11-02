import type { AnyGame, StateOf } from './definition';

/**
 * The hidden-information guarantee, for any game: no seat's view may contain a
 * token the game says that seat cannot see. Returns one line per leak, so a
 * test can print exactly which seat saw what.
 *
 * Tokens are matched as JSON string values (`"7h"` inside the serialised
 * view), and a token is only a leak for seats outside its `visibleTo`. A game
 * whose views spell a hidden card some other way than its token must make the
 * token match that spelling, or this check proves nothing for it.
 */
export function findLeaks<D extends AnyGame>(
  def: D,
  state: StateOf<D>,
  seats: number,
  spell: (token: string) => string[] = (t) => [JSON.stringify(t)],
): string[] {
  const leaks: string[] = [];
  const secrets = def.secrets(state);
  for (let seat = 0; seat < seats; seat++) {
    const text = JSON.stringify(def.view(state, seat));
    for (const secret of secrets) {
      if (secret.visibleTo.includes(seat)) continue;
      for (const token of secret.tokens) {
        if (spell(token).some((needle) => text.includes(needle))) {
          leaks.push(`seat ${seat} sees ${token} (visible to ${secret.visibleTo.join(',') || 'nobody'})`);
        }
      }
    }
  }
  return leaks;
}
