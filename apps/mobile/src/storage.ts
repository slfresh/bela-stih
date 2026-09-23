import { Platform } from 'react-native';
import { emptyProfile, ensureQuests, isoDay, type PlayerProfile } from '@belot/progression';
import { localeFor } from './locale';
import type { MatchRecord } from './net/history';

/**
 * Local persistence.
 *
 * Deliberately the ONLY place that knows where progress lives, so moving it
 * server-side later touches this file and nothing else. Beta keeps everything on
 * the device with no account, which also keeps the Play data-safety declaration
 * honest and close to "no data collected".
 */

// react-native-mmkv v4 exposes a factory; `MMKV` is only a type now. On web the
// same two calls back onto localStorage — the try/catch keeps private-mode
// browsers (where localStorage throws) playable with in-memory defaults.
interface KV {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

const store: KV =
  Platform.OS === 'web'
    ? {
        getString: (key) => {
          try {
            return window.localStorage.getItem(`bela-stih.${key}`) ?? undefined;
          } catch {
            return undefined;
          }
        },
        set: (key, value) => {
          try {
            window.localStorage.setItem(`bela-stih.${key}`, value);
          } catch {
            /* private mode: play on, forget on reload */
          }
        },
      }
    : // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-only module
      (require('react-native-mmkv') as typeof import('react-native-mmkv')).createMMKV({
        id: 'bela-stih',
      });

const KEY = {
  profile: 'profile.v1',
  settings: 'settings.v1',
  series: 'series.v1',
  history: 'history.v1',
} as const;

export type ConfirmPlay = 'off' | 'ambiguous' | 'always';
/** Animation: follow the system's reduce-motion switch, or force either way. */
/** The three volumes Settings offers; the default must be one of them, or no chip is lit. */
export const VOLUME_OPTIONS = [0.35, 0.7, 1] as const;

export type MotionSetting = 'system' | 'full' | 'reduced';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  locale: 'hr' | 'sr-Cyrl' | 'en';
  /**
   * What other players see online. Purely local — there is no account, no
   * sign-in and no server-side identity, which is what keeps the Play
   * data-safety declaration honest at "no data collected".
   */
  nickname: string;
  /**
   * "Prava bela": renons punishes instead of being blocked, and zvanja must be
   * spotted by the player. Applies to offline games and private tables you host.
   */
  hardMode: boolean;
  /** Card face style: mađarice (default), vintage photos, French suits, or big-and-simple. */
  deckStyle: 'madarice' | 'starinske' | 'francuske' | 'simple';
  /** How the hand is laid out. 'manual' keeps whatever the player arranged. */
  handSort: 'auto' | 'suits' | 'manual';
  /** How many matches have shown the arranging tip; 2 once it is learned or said twice. */
  arrangeTips: number;
  /**
   * Misclick guard. 'ambiguous' (default) arms a card on the first tap only
   * when there is a genuine choice — a forced card still plays on one tap.
   */
  confirmPlay: ConfirmPlay;
  motion: MotionSetting;
  /** Master volume, 0–1: one of VOLUME_OPTIONS. */
  volume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  haptics: true,
  locale: 'hr',
  nickname: '',
  hardMode: false,
  deckStyle: 'madarice',
  handSort: 'auto',
  arrangeTips: 0,
  confirmPlay: 'ambiguous',
  motion: 'system',
  volume: 0.7,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = store.getString(key);
    if (!raw) return fallback;
    // Merge over the default so a profile saved by an older build gains any new
    // fields instead of arriving with them undefined.
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    store.set(key, JSON.stringify(value));
  } catch {
    // A failed save must never take the game down; progress is not that precious.
  }
}

/** The stored profile, with today's quests already rolled in. */
export function loadProfile(today = isoDay(new Date())): PlayerProfile {
  return ensureQuests(read(KEY.profile, emptyProfile()), today);
}

export function saveProfile(profile: PlayerProfile): void {
  write(KEY.profile, profile);
}

/** The system's locale tag through Intl: Hermes has it on Android, and every browser. */
function deviceTag(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

export function loadSettings(): Settings {
  // First launch - nothing stored at all - speaks the phone's language. Saved
  // at once: were it left to the default, the first saved profile would make
  // the next launch look like an old install and flip the app to Croatian.
  // An existing install keeps what it had.
  if (store.getString(KEY.settings) === undefined && store.getString(KEY.profile) === undefined) {
    const first = { ...DEFAULT_SETTINGS, locale: localeFor(deviceTag()) };
    write(KEY.settings, first);
    return first;
  }
  const s = read(KEY.settings, DEFAULT_SETTINGS);
  // A volume saved by a build with other steps snaps to the nearest chip, or
  // Settings would light none.
  const volume = (VOLUME_OPTIONS as readonly number[]).reduce((best, v) =>
    Math.abs(v - s.volume) < Math.abs(best - s.volume) ? v : best,
  );
  return volume === s.volume ? s : { ...s, volume };
}

export function saveSettings(settings: Settings): void {
  write(KEY.settings, settings);
}

/**
 * The series between the same four people, across evenings - on this device
 * only, like everything else. Keyed by who played with whom (groupKey), from
 * this player's side; `seen` names the matches already counted, so a
 * reconnect or a relaunch never counts one twice.
 */
export interface SeriesEntry {
  us: number;
  them: number;
  seen: string[];
}
export type SeriesBook = Record<string, SeriesEntry>;

export function loadSeries(): SeriesBook {
  return read<SeriesBook>(KEY.series, {});
}

export function saveSeries(book: SeriesBook): void {
  write(KEY.series, book);
}

/**
 * The matches played with friends, newest first (net/history.ts), on this
 * device only. A list, so it is not merged over a default like the others:
 * anything that is not a list reads as none.
 */
export function loadHistory(): MatchRecord[] {
  try {
    const raw = store.getString(KEY.history);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? (list as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(list: readonly MatchRecord[]): void {
  write(KEY.history, list);
}

/** Wipes local progress. Exposed in settings so testers can start clean. */
export function resetProfile(): PlayerProfile {
  const fresh = ensureQuests(emptyProfile(), isoDay(new Date()));
  saveProfile(fresh);
  return fresh;
}
