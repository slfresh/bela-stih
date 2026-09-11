import type { DeclarationSummary, PublicView } from '@belot/engine';

/**
 * The zvanja the table shows as chips: only while the table is still being
 * asked.
 *
 * A zvanje is said once, at the start of the deal, and from then on it is the
 * players' to remember — a chip that stood for the whole deal turned that
 * memory into a reference sheet. So each call gets its chip as it is said, and
 * every chip goes when the round closes: the winning side's cards go up for
 * REVEAL_MS instead (the reveal row), and once the first card leaves a hand
 * nothing about the zvanja is on screen. A cancelled tie has no reveal; its
 * chips go with the lead. Bela never has a chip: its gold bubble and the glow
 * on the king and queen say it once, as it is called.
 *
 * The close is read from what the presentation view carries. Not the asking:
 * the paced view clears `declareTurn` on every intermediate frame. Not the
 * trick either: a trick's sweep empties the slots a beat before its count
 * lands, and in that beat the first trick looked like no trick at all — the
 * chips came back for the length of the sweep. Three things are never
 * ambiguous:
 *  - the winners' cards on the table (the reveal beat has begun);
 *  - a hand short of eight: every hand holds eight until the first card is
 *    led, and the paced view takes a card out the moment it sets off;
 *  - the dealer's own call: the asking starts at the seat after the dealer
 *    and goes round (packages/engine/src/state.ts, completeDeal and
 *    applyDeclare), so the dealer always answers last. Their chip would stand
 *    for one beat's gap and then go with the reveal — a flash — so the round
 *    closes on it instead.
 */
export function callsOnTable(
  view: Pick<PublicView, 'announcedDeclarations' | 'revealedDeclarations' | 'handCounts' | 'dealer'>,
): DeclarationSummary[] {
  const roundOpen =
    view.revealedDeclarations.length === 0 &&
    view.handCounts.every((n) => n === 8) &&
    !view.announcedDeclarations.some((d) => d.seat === view.dealer);
  return roundOpen ? view.announcedDeclarations : [];
}
