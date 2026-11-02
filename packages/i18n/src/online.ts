import type { LocaleId } from './index';

/**
 * Words for an online table of the games beyond Bela: the turn clock and the
 * countdown to the next round. Reconnecting, a table waiting for a dropped
 * player, the rematch votes and the reasons a join failed are Bela's online
 * words already (lang.s.ui), and read the same at any game's table.
 */

export interface OnlineStrings {
  /** The pill over the table while the room's clock waits on me: "Your move · 12 s". */
  yourMove: (seconds: number) => string;
  /** ...and what a screen reader says for it. */
  yourMoveLabel: (seconds: number) => string;
  /** Between rounds: the next one starts by itself in this long. */
  nextIn: (seconds: number) => string;
}

const ONLINE: Record<LocaleId, OnlineStrings> = {
  hr: {
    yourMove: (s) => `Tvoj potez · ${s} s`,
    yourMoveLabel: (s) => `Tvoj potez. Preostalo vrijeme: ${s} s`,
    nextIn: (s) => `Sljedeća runda za ${s} s`,
  },
  'sr-Cyrl': {
    yourMove: (s) => `Твој потез · ${s} с`,
    yourMoveLabel: (s) => `Твој потез. Преостало време: ${s} с`,
    nextIn: (s) => `Следећа рунда за ${s} с`,
  },
  en: {
    yourMove: (s) => `Your move · ${s} s`,
    yourMoveLabel: (s) => `Your move. Time left: ${s} s`,
    nextIn: (s) => `Next round in ${s} s`,
  },
};

export function onlineStrings(id: LocaleId): OnlineStrings {
  return ONLINE[id] ?? ONLINE.hr;
}
