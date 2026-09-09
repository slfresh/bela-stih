/**
 * Two characters for the far side of the home table: never the player's own,
 * never the same one twice, and a different pair each calendar day. Pure, so
 * the test needs no card art.
 */
export function guestsFor(day: string, avatar: string, ids: readonly string[]): [string, string] {
  const others = ids.filter((id) => id !== avatar);
  if (others.length === 0) return [avatar, avatar];
  if (others.length === 1) return [others[0]!, others[0]!];
  // FNV-1a over the date. A polynomial hash modulo the eleven others gave
  // every 9th → 10th of the month the same remainder (the step is 22), and
  // picked the second seat as a function of the first: eleven pairs a year.
  let seed = 0x811c9dc5;
  for (const ch of day) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  const n = others.length;
  const a = seed % n;
  // The second from the rest, chosen independently of the first.
  const b = (a + 1 + (Math.floor(seed / n) % (n - 1))) % n;
  return [others[a]!, others[b]!];
}
