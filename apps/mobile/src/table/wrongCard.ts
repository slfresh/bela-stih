import { cardId, type Action, type Card, type Suit, type TrickPlay } from '@belot/engine';
import type { Lang } from '@belot/i18n';
import { illegalReason, type IllegalReason } from './illegal';

/**
 * Prava bela lets a card the rules do not allow go, and the deal is lost for
 * it. The sheet then says what happened, the way a partner would: the card
 * that went, the duty it broke, and the cards that could have gone. Pure, so
 * it is tested without a screen.
 */

/** A wrong card as it was sent: the card, the plays the engine allowed, the trick it went on. */
export interface WrongCard {
  card: Card;
  legal: readonly Card[];
  trick: readonly TrickPlay[];
  trump: Suit | null;
}

/**
 * The card an action sends, when the rules do not allow it: null for any card
 * they do, for anything that is not a card, and when no card may go at all.
 * The legal cards are the plain plays (a bela call is the same card again).
 */
export function wrongCardOf(
  a: Action,
  options: readonly Action[],
  trick: readonly TrickPlay[],
  trump: Suit | null,
): WrongCard | null {
  if (a.type !== 'PLAY_CARD') return null;
  const legal = options.flatMap((o) => (o.type === 'PLAY_CARD' && o.announceBela !== true ? [o.card] : []));
  if (legal.length === 0 || legal.some((c) => cardId(c) === cardId(a.card))) return null;
  return { card: a.card, legal, trick: [...trick], trump };
}

/** The duty a card broke, in the words the dimmed card's shake uses. */
export function dutyText(lang: Lang, why: IllegalReason | null): string | null {
  if (why === null) return null;
  const ui = lang.s.ui;
  return why.kind === 'follow'
    ? `${ui.mustFollow}: ${lang.suitName(why.suit)}`
    : why.kind === 'trump'
      ? ui.mustTrump
      : why.kind === 'beat'
        ? ui.mustBeat
        : null;
}

/** The sheet's lines: the card, the duty it broke (when one can be named), and what could have gone. */
export function wrongCardLines(lang: Lang, w: WrongCard): string[] {
  const duty = dutyText(lang, illegalReason(w.card, w.legal, w.trick, w.trump));
  return [
    lang.s.ui.wrongCardWas(lang.cardName(w.card)),
    ...(duty ? [`${duty}.`] : []),
    lang.s.ui.wrongCardShould(w.legal.map((c) => lang.cardName(c))),
  ];
}
