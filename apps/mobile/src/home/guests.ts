/**
 * Two characters for the far side of the home table: never the player's own,
 * never the same one twice, and a different pair each calendar day. Pure, so
 * the test needs no card art.
 */
export function guestsFor(day: string, avatar: string, ids: readonly string[]): [string, string] {
  const others = ids.filter((id) => id !== avatar);
  if (others.length === 0) return [avatar, avatar];
  if (others.length === 1) return [others[0]!, others[0]!];
  let seed = 0;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) % 100003;
  const a = others[seed % others.length]!;
  const b = others[(seed * 7 + 3) % others.length]!;
  return [a, b === a ? others[(seed + 1) % others.length]! : b];
}
