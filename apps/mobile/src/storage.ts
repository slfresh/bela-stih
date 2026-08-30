import { createMMKV } from 'react-native-mmkv';
import { emptyProfile, ensureQuests, isoDay, type PlayerProfile } from '@belot/progression';

/**
 * Local persistence.
 *
 * Deliberately the ONLY place that knows where progress lives, so moving it
 * server-side later touches this file and nothing else. Beta keeps everything on
 * the device with no account, which also keeps the Play data-safety declaration
 * honest and close to "no data collected".
 */

// react-native-mmkv v4 exposes a factory; `MMKV` is only a type now.
const store = createMMKV({ id: 'bela-stih' });

const KEY = {
  profile: 'profile.v1',
  settings: 'settings.v1',
} as const;

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
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  haptics: true,
  locale: 'hr',
  nickname: '',
  hardMode: false,
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
