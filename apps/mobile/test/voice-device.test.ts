import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../assets/sfx/manifest.json';
import { ONE_SHOT_MAX, ONE_SHOT_MS, oneShotsLive, playOnce } from '../src/sfxOnce';
import { RELEASE_SLOP, releasedOn } from '../src/voice/voice';

/**
 * What the phone does with its sound, run rather than read: the one-shot
 * players Android's rare sounds use, the player a voice clip gets, how many
 * audio tracks the app can ever hold, and where a press on the mic ends.
 */

/** A player as expo-audio hands one out, recording what is done to it. */
class FakePlayer {
  isLoaded = false;
  volume = 1;
  rate = 1;
  played = 0;
  paused = 0;
  released = 0;
  removed = 0;
  listeners: ((s: { isLoaded?: boolean; didJustFinish?: boolean }) => void)[] = [];
  addListener(_e: string, l: (s: { isLoaded?: boolean; didJustFinish?: boolean }) => void) {
    this.listeners.push(l);
    return { remove: () => (this.listeners = this.listeners.filter((x) => x !== l)) };
  }
  emit(s: { isLoaded?: boolean; didJustFinish?: boolean }) {
    for (const l of [...this.listeners]) l(s);
  }
  setPlaybackRate(r: number) {
    this.rate = r;
  }
  play() {
    this.played++;
  }
  pause() {
    this.paused++;
  }
  release() {
    this.released++;
  }
  remove() {
    this.removed++;
  }
}

const made: FakePlayer[] = [];
vi.mock('expo-audio', () => ({
  createAudioPlayer: () => {
    const p = new FakePlayer();
    made.push(p);
    return p;
  },
}));

const here = dirname(fileURLToPath(import.meta.url));
const make = () => {
  const p = new FakePlayer();
  made.push(p);
  return p as never;
};

describe("Android's rare sounds, on one-shot players", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    made.length = 0;
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('waits for the sound to load, plays it once, and releases the player when it ends', () => {
    playOnce(make, 0.5, 1.1);
    const p = made[0]!;
    expect(p.played).toBe(0);
    p.emit({ isLoaded: true });
    expect([p.played, p.volume, p.rate]).toEqual([1, 0.5, 1.1]);
    // A later status saying it is loaded does not play it twice.
    p.emit({ isLoaded: true });
    expect(p.played).toBe(1);
    expect(oneShotsLive()).toBe(1);
    p.emit({ isLoaded: true, didJustFinish: true });
    expect([p.released, p.removed, oneShotsLive(), p.listeners.length]).toEqual([1, 0, 0, 0]);
  });

  it('plays at once when the player has loaded already', () => {
    playOnce(() => {
      const p = new FakePlayer();
      p.isLoaded = true;
      made.push(p);
      return p as never;
    }, 1, 1);
    expect(made[0]!.played).toBe(1);
    made[0]!.emit({ didJustFinish: true });
  });

  it('lets a player that never finishes go all the same', () => {
    playOnce(make, 1, 1);
    made[0]!.emit({ isLoaded: true });
    vi.advanceTimersByTime(ONE_SHOT_MS - 1);
    expect(made[0]!.released).toBe(0);
    vi.advanceTimersByTime(1);
    expect(made[0]!.released).toBe(1);
    expect(oneShotsLive()).toBe(0);
    // Finishing after that changes nothing.
    made[0]!.emit({ didJustFinish: true });
    expect(made[0]!.released).toBe(1);
  });

  it('holds no more than ONE_SHOT_MAX tracks, however many sounds come at once', () => {
    for (let i = 0; i < ONE_SHOT_MAX + 3; i++) playOnce(make, 1, 1);
    expect(made).toHaveLength(ONE_SHOT_MAX);
    expect(oneShotsLive()).toBe(ONE_SHOT_MAX);
    made[0]!.emit({ didJustFinish: true });
    playOnce(make, 1, 1);
    expect(made).toHaveLength(ONE_SHOT_MAX + 1);
  });
});

describe("the app's audio tracks", () => {
  // Android's AudioFlinger gives one app 40 (kMaxTracksPerUid); every loaded
  // player holds one, playing or not. 1.5.0's first build held all 40 with
  // 55 players, and a voice clip found none.
  const ANDROID_TRACKS = 40;
  const eager = Object.values(manifest).reduce((n, m) => n + (m.rare ? 0 : m.poly), 0);

  it('stay well under what Android allows, a voice clip and a burst of rare sounds included', () => {
    expect(eager + ONE_SHOT_MAX + 1).toBeLessThanOrEqual(ANDROID_TRACKS - 8);
    expect(eager).toBe(24);
  });

  it('are spent as budgeted: Android preloads only the pools, and plays a rare sound on its own player', () => {
    const audio = readFileSync(join(here, '../src/audio.ts'), 'utf8');
    expect(audio).toMatch(/const ONE_SHOTS = Platform\.OS === 'android';/);
    expect(audio).toMatch(/if \(ONE_SHOTS && manifest\[name\]\.rare\) continue;/);
    expect(audio).toMatch(/if \(ONE_SHOTS && rare\) \{\s*playOnce\(\(\) => makePlayer\(name\), volume, rate\);\s*return;/);
    // Nothing else in the app makes a player that is not released.
    const voice = readFileSync(join(here, '../src/voice/clipPlayer.ts'), 'utf8');
    expect(voice).not.toMatch(/player\.remove\(\)/);
    expect(voice).toMatch(/player\.release\(\);/);
  });
});

describe("a voice clip on a phone", () => {
  beforeEach(() => {
    made.length = 0;
  });

  it('gets a player of its own, released - track and all - when it ends', async () => {
    const { playClip } = await import('../src/voice/clipPlayer');
    let ended = 0;
    playClip('file:///cache/voice-1-2.m4a', 0.7, () => ended++);
    const p = made[0]!;
    expect([p.played, p.volume]).toEqual([1, 0.7]);
    p.emit({ didJustFinish: true });
    expect([ended, p.released, p.removed, p.listeners.length]).toEqual([1, 1, 0, 0]);
  });

  it('is released when stopped too, and a second stop does nothing', async () => {
    const { playClip } = await import('../src/voice/clipPlayer');
    let ended = 0;
    const c = playClip('file:///cache/voice-2-2.m4a', 1, () => ended++);
    c.stop();
    c.stop();
    const p = made[0]!;
    expect([p.paused, p.released, ended]).toEqual([1, 1, 0]);
    // A finish that arrives after the stop is nobody's business.
    p.emit({ didJustFinish: true });
    expect(ended).toBe(0);
  });
});

describe('where a press on the mic ends', () => {
  const box = { x: 100, y: 500, w: 40, h: 40 };

  it('sends when the finger lifts on the button or near it', () => {
    expect(releasedOn(box, { pageX: 120, pageY: 520 })).toBe(true);
    expect(releasedOn(box, { pageX: 100 - RELEASE_SLOP, pageY: 500 - RELEASE_SLOP })).toBe(true);
    expect(releasedOn(box, { pageX: 140 + RELEASE_SLOP, pageY: 540 + RELEASE_SLOP })).toBe(true);
  });

  it('takes it back when the finger slid off, any way', () => {
    expect(releasedOn(box, { pageX: 100 - RELEASE_SLOP - 1, pageY: 520 })).toBe(false);
    expect(releasedOn(box, { pageX: 141 + RELEASE_SLOP, pageY: 520 })).toBe(false);
    expect(releasedOn(box, { pageX: 120, pageY: 499 - RELEASE_SLOP })).toBe(false);
    expect(releasedOn(box, { pageX: 120, pageY: 541 + RELEASE_SLOP })).toBe(false);
  });

  it('takes it back when the browser took the touch away', () => {
    expect(releasedOn(box, { pageX: 120, pageY: 520, type: 'touchcancel' })).toBe(false);
    expect(releasedOn(box, { pageX: 120, pageY: 520, type: 'pointercancel' })).toBe(false);
    expect(releasedOn(box, { pageX: 120, pageY: 520, type: 'touchend' })).toBe(true);
  });

  it('sends when the button could not be measured in time (a lift that fast was on it)', () => {
    expect(releasedOn(null, { pageX: 0, pageY: 0 })).toBe(true);
  });

  it('claims the long press, so a phone browser neither opens its menu nor ends the touch', () => {
    const b = readFileSync(join(here, '../src/table/MicButton.tsx'), 'utf8');
    expect(b).toMatch(/onLongPress=\{\(\) => \{\}\}/);
    // No send is left to a "press": a long touch in a phone browser never clicks.
    expect(b).not.toMatch(/onPress=\{/);
    expect(b).toMatch(/onFinish\(releasedOn\(box\.current, n\)\);/);
  });

  it('ends the take when the button leaves the screen under the finger (the phone turned)', () => {
    const b = readFileSync(join(here, '../src/table/MicButton.tsx'), 'utf8');
    expect(b).toMatch(/useEffect\(\s*\(\) => \(\) => \{\s*if \(pressing\.current\) onFinishRef\.current\(true\);\s*\},\s*\[\],\s*\);/);
    expect(b).toMatch(/onPressIn=\{\(\) => \{\s*pressing\.current = true;/);
    expect(b).toMatch(/onPressOut=\{\(e: GestureResponderEvent\) => \{\s*pressing\.current = false;/);
  });
});
