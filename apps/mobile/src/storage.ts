import { Platform } from 'react-native';
import { emptyProfile, ensureQuests, isoDay, type PlayerProfile } from '@belot/progression';

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
} as const;

export type ConfirmPlay = 'off' | 'ambiguous' | 'always';
/** Animation: follow the system's reduce-motion switch, or force either way. */
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
  /**
   * Misclick guard. 'ambiguous' (default) arms a card on the first tap only
   * when there is a genuine choice — a forced card still plays on one tap.
   */
  confirmPlay: ConfirmPlay;
  motion: MotionSetting;
  /** Master volume, 0–1. */
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
  confirmPlay: 'ambiguous',
  motion: 'system',
  volume: 0.8,
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

export function loadSettings(): Settings {
  return read(KEY.settings, DEFAULT_SETTINGS);
}

export function saveSettings(settings: Settings): void {
  write(KEY.settings, settings);
}

/** Wipes local progress. Exposed in settings so testers can start clean. */
export function resetProfile(): PlayerProfile {
  const fresh = ensureQuests(emptyProfile(), isoDay(new Date()));
  saveProfile(fresh);
  return fresh;
}
