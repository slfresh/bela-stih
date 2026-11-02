import type { Card, DealScoreResult, Declaration, DeclarationSummary, GameState, Seat, Suit, TeamId } from '@belot/engine';
import { matchWinner, matchWins, pointValue } from '@belot/engine';
import type { Action } from '@belot/shared-types';
import type { Cause } from '@belot/game-core';

// ---------------------------------------------------------------------------
// Events — the animation script
// ---------------------------------------------------------------------------

export type TableEvent =
  | { kind: 'dealStarted'; dealNumber: number; dealer: Seat }
  | { kind: 'bidPassed'; seat: Seat }
  | { kind: 'bidCalled'; seat: Seat; suit: Suit }
  | { kind: 'doubled'; seat: Seat; multiplier: 2 | 4 }
  | { kind: 'doublePassed'; seat: Seat }
  /** The last two cards are out; zvanja are now fixed and play begins. */
  | { kind: 'handsCompleted'; trumpSuit: Suit; callerSeat: Seat; multiplier: 1 | 2 | 4 }
  | { kind: 'declared'; seat: Seat; declarations: DeclarationSummary[] }
  | { kind: 'declarationSkipped'; seat: Seat }
  /**
   * The asking is over and the winning side lays its combinations face up —
   * cards and all, which is the one place cards legitimately leave a hand
   * before being played. Only the winner's; the losing side keeps theirs.
   */
  | { kind: 'declarationsRevealed'; team: TeamId; declarations: Declaration[] }
  | { kind: 'belaCalled'; seat: Seat }
  | { kind: 'cardPlayed'; seat: Seat; card: Card }
  | { kind: 'trickWon'; seat: Seat; trickNumber: number; points: number; isLastTrick: boolean }
  | { kind: 'dealScored'; result: DealScoreResult; matchScores: [number, number] }
  /** `double` only under the optional rule, when the win counts for two matches (engine matchWins). */
  | { kind: 'matchOver'; winner: TeamId; matchScores: [number, number]; double?: true }
  /** A fresh match at the same table, same seats. */
  | { kind: 'matchStarted'; matchNumber: number };

/**
 * The events one transition produced, in the order a table hears them.
 *
 * This is the body `Table.applyAndRecord` (and its `newMatch` / `startNextDeal`
 * pushes) always had, moved here unchanged so the golden corpus — which hashes
 * every event — cannot tell the difference.
 */
export function deriveBelaEvents(before: GameState, after: GameState, cause: Cause<Action>): TableEvent[] {
  const out: TableEvent[] = [];
  const push = (e: TableEvent) => out.push(e);

  if (cause.kind === 'newMatch') {
    push({ kind: 'matchStarted', matchNumber: cause.matchNumber });
    push({ kind: 'dealStarted', dealNumber: after.dealNumber, dealer: after.dealer });
    return out;
  }
  if (cause.kind === 'startRound') {
    push({ kind: 'dealStarted', dealNumber: after.dealNumber, dealer: after.dealer });
    return out;
  }
  if (cause.kind !== 'action') return out;
  const action = cause.action;

  switch (action.type) {
    case 'BID_PASS':
      push({ kind: 'bidPassed', seat: action.seat });
      break;
    case 'BID_CALL':
      push({ kind: 'bidCalled', seat: action.seat, suit: action.suit });
      break;
    case 'DOUBLE_KONTRA':
    case 'DOUBLE_REKONTRA':
      push({ kind: 'doubled', seat: action.seat, multiplier: after.multiplier as 2 | 4 });
      break;
    case 'DOUBLE_PASS':
      push({ kind: 'doublePassed', seat: action.seat });
      break;
    case 'DECLARE_ANNOUNCE':
      push({
        kind: 'declared',
        seat: action.seat,
        declarations: after.announcedDeclarations[action.seat]!.map((d) => ({
          kind: d.kind,
          value: d.value,
          length: d.length,
          topRank: d.topRank,
          seat: d.seat,
        })),
      });
      pushRevealIfRoundClosed(before, after, push);
      break;
    case 'DECLARE_SKIP':
      push({ kind: 'declarationSkipped', seat: action.seat });
      pushRevealIfRoundClosed(before, after, push);
      break;
    case 'PLAY_CARD':
      // The call lands before the card, exactly as it is said at the table.
      if (before.belaAnnouncedSeat === null && after.belaAnnouncedSeat !== null) {
        push({ kind: 'belaCalled', seat: action.seat });
      }
      push({ kind: 'cardPlayed', seat: action.seat, card: action.card });
      break;
  }

  // A void deal (everyone passed) restarts the bidding on a fresh hand.
  if (before.phase === 'BID' && after.phase === 'BID' && after.passCount === 0) {
    push({ kind: 'dealStarted', dealNumber: after.dealNumber, dealer: after.dealer });
  }

  // The contract is settled, the last two cards are out, play begins. This
  // fires from BID directly when the table plays no kontra, and from DOUBLE
  // when it does.
  if (before.phase !== 'PLAY' && after.phase === 'PLAY') {
    push({
      kind: 'handsCompleted',
      trumpSuit: after.context.trumpSuit!,
      callerSeat: after.callerSeat!,
      multiplier: after.multiplier,
    });
  }

  if (after.completedTricks.length > before.completedTricks.length) {
    const trick = after.completedTricks[after.completedTricks.length - 1]!;
    const trickNumber = after.completedTricks.length;
    push({
      kind: 'trickWon',
      seat: trick.winnerSeat,
      trickNumber,
      points: trick.cards.reduce((sum, c) => sum + pointValue(c, after.context), 0),
      isLastTrick: trickNumber === 8,
    });
  }

  if (before.phase === 'PLAY' && after.phase !== 'PLAY' && after.lastDealResult) {
    push({
      kind: 'dealScored',
      result: after.lastDealResult,
      matchScores: [after.matchScores[0], after.matchScores[1]],
    });
  }

  if (after.phase === 'MATCH_OVER') {
    push({
      kind: 'matchOver',
      winner: matchWinner(after)!,
      matchScores: [after.matchScores[0], after.matchScores[1]],
      // Absent unless earned, so the golden corpus's hashes stay put.
      ...(matchWins(after) === 2 ? { double: true as const } : {}),
    });
  }

  return out;
}

/** Did this action end the asking? Then the winner's cards go on the table. */
function pushRevealIfRoundClosed(before: GameState, after: GameState, push: (e: TableEvent) => void): void {
  if (before.declareTurn === null || after.declareTurn !== null) return;
  if (after.declarationWinner === null) return; // cancelled tie: nobody shows
  push({
    kind: 'declarationsRevealed',
    team: after.declarationWinner,
    declarations: after.revealedDeclarations.map((d) => ({ ...d, cards: d.cards.slice() })),
  });
}
