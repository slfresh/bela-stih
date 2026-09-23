import { detectDeclarations, type Card, type Seat } from '@belot/engine';

/** Anything that names its cards: a view's zvanja, or the engine's own. */
type Held = { readonly cards: readonly Card[] };

/**
 * Which combination to announce for the cards a player has marked.
 *
 * The engine accepts ONE combination the seat holds and then announces the
 * whole holding from it - the side that wins the contest scores every zvanje
 * both partners hold. A player with two zvanja naturally marks both, and that
 * marking used to be refused: the app only armed "Prijavi" when the marked
 * cards were exactly one combination, said "Označene karte nisu zvanje" about
 * two perfectly good ones, and the button did nothing.
 *
 * So a marking is accepted when it is made of whole combinations and nothing
 * else, and any one of them is what goes to the engine.
 *
 * `held` is the seat's zvanja as the view lists them; null in blind mode, where
 * the app refuses to spot them. There the player's own marking is split with
 * the engine's detector - that reveals nothing they did not mark - and a
 * marking that is not made of combinations goes as it is, for the engine to
 * judge: a miss is the honest outcome that mode exists for.
 */
export function pickAnnouncement(
  marked: readonly Card[],
  held: readonly Held[] | null,
  seat: Seat,
): Card[] | null {
  if (marked.length === 0) return null;
  const key = (c: Card) => `${c.suit}${c.rank}`;
  const want = new Set(marked.map(key));
  const covers = (d: Held) => d.cards.every((c) => want.has(key(c)));

  if (held === null) {
    const found = detectDeclarations([...marked], seat);
    const covered = new Set(found.flatMap((d) => d.cards.map(key)));
    if (found.length > 0 && covered.size === want.size) return found[0]!.cards.slice();
    return marked.slice();
  }

  // Every combination the marking contains whole - and not one card more.
  const whole = held.filter(covers);
  if (whole.length === 0) return null;
  const covered = new Set(whole.flatMap((d) => d.cards.map(key)));
  if (covered.size !== want.size) return null;
  return whole[0]!.cards.slice();
}
