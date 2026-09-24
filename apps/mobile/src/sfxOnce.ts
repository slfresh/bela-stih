import type { AudioPlayer } from 'expo-audio';

/**
 * A sound on a player made for one play (audio.ts uses it for Android's rare
 * sounds): started once it has loaded - a play before that is lost - and
 * released, audio track and all, when it ends, or after ONE_SHOT_MS if it
 * never says so. Kept apart from audio.ts, whose asset table only Metro can
 * load, so it is tested as it runs.
 */

/** One-shot players alive at once; a burst past this is not heard. */
export const ONE_SHOT_MAX = 6;
/** A one-shot that never says it finished is released this long after it began. */
export const ONE_SHOT_MS = 4000;

let live = 0;

/** How many one-shot players hold a track right now. */
export function oneShotsLive(): number {
  return live;
}

export function playOnce(make: () => AudioPlayer, volume: number, rate: number): void {
  if (live >= ONE_SHOT_MAX) return;
  const player = make();
  live++;
  let started = false;
  let done = false;
  const start = () => {
    if (started || done) return;
    started = true;
    player.volume = volume;
    player.setPlaybackRate(rate);
    player.play();
  };
  const release = () => {
    if (done) return;
    done = true;
    live--;
    clearTimeout(timer);
    sub.remove();
    try {
      player.release();
    } catch {
      // Released already.
    }
  };
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) release();
    else if (s.isLoaded) start();
  });
  const timer = setTimeout(release, ONE_SHOT_MS);
  if (player.isLoaded) start();
}
