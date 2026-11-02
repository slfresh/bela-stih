import type { LocaleId } from './index';

/**
 * Words for an online table of the games beyond Bela: reconnecting, the turn
 * clock, votes for the next round, a table waiting for a dropped player.
 */

export interface OnlineStrings {
  /** Placeholder until the online table needs its own words. */
  online: string;
}

const ONLINE: Record<LocaleId, OnlineStrings> = {
  hr: { online: 'Online' },
  'sr-Cyrl': { online: 'Онлајн' },
  en: { online: 'Online' },
};

export function onlineStrings(id: LocaleId): OnlineStrings {
  return ONLINE[id] ?? ONLINE.hr;
}
