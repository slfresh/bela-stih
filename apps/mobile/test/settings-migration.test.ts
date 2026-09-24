import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings saved by older apps, loaded by this one - run for real, on the web
 * build's storage. The three versions replaced a switch, and 1.4.0 put a
 * Ručno set by accident back to the default; each migration must ask what
 * the app that SAVED the settings knew, so neither may read what another
 * has just written (the review found the version's write hiding a 1.3
 * app's Ručno from the reset).
 */

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const mem = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
};

const SETTINGS = 'bela-stih.settings.v1';
const PROFILE = 'bela-stih.profile.v1';

async function load(saved: Record<string, unknown> | null) {
  mem.clear();
  if (saved) {
    mem.set(SETTINGS, JSON.stringify(saved));
    mem.set(PROFILE, JSON.stringify({}));
  }
  vi.resetModules();
  const { loadSettings } = await import('../src/storage');
  return { settings: loadSettings(), stored: JSON.parse(mem.get(SETTINGS) ?? '{}') as Record<string, unknown> };
}

/** How a 1.3 app saved its settings: a switch for Prava bela, no arrangeTips. */
const v13 = { sound: true, haptics: true, locale: 'hr', nickname: 'Ivo', deckStyle: 'madarice' };

describe('settings from an older app', () => {
  beforeEach(() => mem.clear());

  it('a 1.3 app with Prava bela and an accidental Ručno: Prava bela kept, Ručno reset', async () => {
    const { settings, stored } = await load({ ...v13, hardMode: true, handSort: 'manual' });
    expect(settings.difficulty).toBe('hard');
    expect(settings.handSort).toBe('auto');
    // Saved so, once: the next launch reads the same.
    expect(stored.difficulty).toBe('hard');
    expect(stored.handSort).toBe('auto');
  });

  it('a 1.3 app without Prava bela: Lagana', async () => {
    const { settings } = await load({ ...v13, hardMode: false, handSort: 'auto' });
    expect(settings.difficulty).toBe('easy');
  });

  it('a 1.4 app (arrangeTips saved) keeps a Ručno chosen on purpose, and becomes Lagana', async () => {
    const { settings } = await load({ ...v13, hardMode: false, handSort: 'manual', arrangeTips: 1 });
    expect(settings.handSort).toBe('manual');
    expect(settings.difficulty).toBe('easy');
  });

  it('this app\'s own choice stays, and a value no app writes falls back to Lagana', async () => {
    expect((await load({ ...v13, difficulty: 'learn', arrangeTips: 0 })).settings.difficulty).toBe('learn');
    expect((await load({ ...v13, difficulty: 'hard', hardMode: false, arrangeTips: 0 })).settings.difficulty).toBe('hard');
    expect((await load({ ...v13, difficulty: 'xyz', arrangeTips: 0 })).settings.difficulty).toBe('easy');
  });

  it('a first launch is Lagana', async () => {
    const { settings } = await load(null);
    expect(settings.difficulty).toBe('easy');
  });

  it('the mic is held to talk, unless tapping was chosen; anything else on disk is holding', async () => {
    expect((await load(null)).settings.voiceMode).toBe('hold');
    // A 1.5.0 app never saved one.
    expect((await load({ ...v13, arrangeTips: 2, difficulty: 'easy', voice: true })).settings.voiceMode).toBe('hold');
    expect((await load({ ...v13, arrangeTips: 2, difficulty: 'easy', voiceMode: 'tap' })).settings.voiceMode).toBe('tap');
    expect((await load({ ...v13, arrangeTips: 2, difficulty: 'easy', voiceMode: 'shout' })).settings.voiceMode).toBe('hold');
  });
});
