import type { LocaleId } from './index';

/**
 * Words for an online table of the games beyond Bela: the turn clock, the
 * countdown to the next round, and going back to my table after a drop.
 * Reconnecting, a table waiting for a dropped player, the rematch votes and
 * the reasons a join failed are Bela's online words already (lang.s.ui), and
 * read the same at any game's table.
 */

export interface OnlineStrings {
  /** The line in the strip under the table's header while the room's clock waits on me: "Your move · 12 s". */
  yourMove: (seconds: number) => string;
  /** ...and what a screen reader says for it. */
  yourMoveLabel: (seconds: number) => string;
  /** Between rounds: the next one starts by itself in this long. */
  nextIn: (seconds: number) => string;
  /**
   * The button after a drop at a table of friends: back in by its code. Not
   * "Try again", which reads as starting over at a new table.
   */
  backToTable: string;
  /** Going back by the code found no seat to go back to: the game went on, or the table is gone. */
  seatGone: string;
  /**
   * The line dropped in the lobby of a table of friends and the seat could
   * not be got back in time, but the table may still be waiting: it sits
   * above "Back to my table" and Back, and names both.
   */
  dropBeforeStart: string;
}

const ONLINE: Record<LocaleId, OnlineStrings> = {
  hr: {
    yourMove: (s) => `Tvoj potez · ${s} s`,
    yourMoveLabel: (s) => `Tvoj potez. Preostalo vrijeme: ${s} s`,
    nextIn: (s) => `Sljedeća runda za ${s} s`,
    backToTable: 'Natrag za moj stol',
    seatGone: 'Ne možeš se vratiti za svoj stol: igra je krenula bez tebe, ili je stol zatvoren.',
    dropBeforeStart: 'Veza se prekinula prije početka igre. Vrati se za svoj stol ili natrag na početak.',
  },
  'sr-Cyrl': {
    yourMove: (s) => `Твој потез · ${s} с`,
    yourMoveLabel: (s) => `Твој потез. Преостало време: ${s} с`,
    nextIn: (s) => `Следећа рунда за ${s} с`,
    backToTable: 'Назад за мој сто',
    seatGone: 'Не можеш да се вратиш за свој сто: игра је кренула без тебе, или је сто затворен.',
    dropBeforeStart: 'Веза се прекинула пре почетка игре. Врати се за свој сто или назад на почетак.',
  },
  en: {
    yourMove: (s) => `Your move · ${s} s`,
    yourMoveLabel: (s) => `Your move. Time left: ${s} s`,
    nextIn: (s) => `Next round in ${s} s`,
    backToTable: 'Back to my table',
    seatGone: 'You cannot get back to your table: the game went on without you, or the table has closed.',
    dropBeforeStart: 'The line dropped before the game began. Go back to your table, or go back to the start.',
  },
};

export function onlineStrings(id: LocaleId): OnlineStrings {
  return ONLINE[id] ?? ONLINE.hr;
}
