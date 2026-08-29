import type { PublicView, Seat } from '@belot/engine';
import { cardId } from '@belot/engine';
import type { TableEvent } from '@belot/table';

/**
 * Pure per-event patches over a presentation `PublicView`.
 *
 * The animation director renders a view that lags the authoritative one, and
 * these functions advance it one event at a time. They are not a parallel game
 * model: everything they compute is either carried by the event itself
 * (dealer, trump, declarations, scores, played cards) or adopted verbatim from
 * the batch's authoritative `finalView` (my own hand at reveal moments). At the
 * end of every batch the director hard-replaces the whole view with
 * `finalView`, so any error here degrades to a one-frame pop, never to a
 * gameplay bug.
 *
 * Intermediate views always carry `toAct: null` and `legalActions: []` — while
 * a drain is playing out, no prompt and no playable card can appear, by
 * construction.
 *
 * Two-phase commit: `applyEventStart` runs when an event's animation begins
 * (a played card leaves its hand), `applyEventEnd` when it lands (the card
 * joins the trick). Between the two, the card exists only as an overlay sprite.
 */

/** Fields that stay suppressed on every intermediate view. */
export function suppress(view: PublicView): PublicView {
  return {
    ...view,
    toAct: null,
    legalActions: [],
    mustDeclare: false,
    canAnnounceBela: false,
  };
}

export function applyEventStart(view: PublicView, e: TableEvent, mySeat: Seat): PublicView {
  switch (e.kind) {
    case 'dealStarted':
      // The moment the deal begins, the table is swept clean: last deal's
      // trump, calls and trick vanish while the new backs fly. The cards
      // themselves arrive in `applyEventEnd`.
      return suppress({
        ...view,
        phase: 'BID',
        dealer: e.dealer,
        seat: mySeat,
        hand: [],
        handCounts: [0, 0, 0, 0],
        context: { contractType: 'SUIT', trumpSuit: null },
        callerSeat: null,
        multiplier: 1,
        trickLeader: null,
        currentTrick: [],
        announcedDeclarations: [],
        myDeclarations: [],
        belaAnnouncedBy: null,
      });

    case 'cardPlayed': {
      const handCounts = [...view.handCounts] as PublicView['handCounts'];
      handCounts[e.seat] = Math.max(0, handCounts[e.seat] - 1);
      return suppress({
        ...view,
        handCounts,
        hand:
          e.seat === mySeat
            ? view.hand.filter((c) => cardId(c) !== cardId(e.card))
            : view.hand,
      });
    }
    default:
      return suppress(view);
  }
}

export function applyEventEnd(
  view: PublicView,
  e: TableEvent,
  finalView: PublicView,
  mySeat: Seat,
): PublicView {
  switch (e.kind) {
    case 'dealStarted':
      // The table was swept in `applyEventStart`; now the cards land. Six
      // each: the engine deals six and later APPENDS the talon pair, and
      // `publicView` never re-sorts — so the first six of the authoritative
      // hand are exactly the bid-time cards. The remaining two arrive with
      // `handsCompleted`, like the real second wave.
      return suppress({
        ...view,
        hand: finalView.hand.slice(0, 6),
        handCounts: [6, 6, 6, 6],
      });

    case 'bidCalled':
      return suppress({
        ...view,
        context: { contractType: 'SUIT', trumpSuit: e.suit },
        callerSeat: e.seat,
      });

    case 'doubled':
      return suppress({ ...view, multiplier: e.multiplier });

    case 'handsCompleted':
      return suppress({
        ...view,
        phase: 'PLAY',
        context: { contractType: 'SUIT', trumpSuit: e.trumpSuit },
        callerSeat: e.callerSeat,
        multiplier: e.multiplier,
        handCounts: [8, 8, 8, 8],
        hand: finalView.hand.length >= view.hand.length ? finalView.hand : view.hand,
        myDeclarations: finalView.myDeclarations,
        trickLeader: ((view.dealer + 1) % 4) as Seat,
      });

    case 'declared':
      return suppress({
        ...view,
        announcedDeclarations: [...view.announcedDeclarations, ...e.declarations],
      });

    case 'belaCalled':
      return suppress({ ...view, belaAnnouncedBy: e.seat });

    case 'cardPlayed':
      return suppress({
        ...view,
        currentTrick: [...view.currentTrick, { seat: e.seat, card: e.card }],
      });

    case 'trickWon':
      return suppress({ ...view, currentTrick: [], trickLeader: e.seat });

    case 'dealScored':
      return suppress({
        ...view,
        phase: 'DEAL_OVER',
        matchScores: e.matchScores,
        // The engine rotates the dealer as part of scoring the deal.
        dealer: ((view.dealer + 1) % 4) as Seat,
      });

    case 'matchOver':
      return suppress({
        ...view,
        phase: 'MATCH_OVER',
        matchScores: e.matchScores,
      });

    // bidPassed, doublePassed, declarationSkipped: bubbles only, no state.
    default:
      return suppress(view);
  }
}
