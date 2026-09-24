import type { ClipPlayback } from './clipPlayer';

export type { ClipPlayback };

/**
 * One clip in a browser, always on the same <audio> element. Safari lets an
 * element play by itself only once the player's own touch has played it, and
 * a clip arrives when nobody is touching anything: so the element is played
 * (silent, empty) inside the first touch or key press, and every clip after
 * reuses it. A new element per clip would stay mute on an iPhone.
 */
let el: HTMLAudioElement | null = null;
/** A silent WAV: something to play while unlocking. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

function element(): HTMLAudioElement | null {
  if (el || typeof Audio === 'undefined') return el;
  el = new Audio();
  el.preload = 'auto';
  return el;
}

function unlockOnce(): void {
  const win = typeof window === 'undefined' ? null : window;
  if (!win) return;
  const events = ['pointerup', 'touchend', 'keydown'] as const;
  const unlock = () => {
    const a = element();
    if (!a) return;
    for (const ev of events) win.removeEventListener(ev, unlock);
    // Only while no clip is on it.
    if (!a.paused || (a.src && a.src !== SILENCE)) return;
    a.src = SILENCE;
    a.muted = true;
    const p = a.play();
    // A clip may have taken the element meanwhile: leave that one playing.
    const after = () => {
      if (a.src !== SILENCE) return;
      a.pause();
      a.removeAttribute('src');
      a.muted = false;
    };
    if (p) p.then(after, after);
    else after();
  };
  for (const ev of events) win.addEventListener(ev, unlock, { passive: true });
}
unlockOnce();

export function playClip(uri: string, volume: number, onEnd: () => void, onStart?: () => void): ClipPlayback {
  const a = element();
  if (!a) throw new Error('no audio element');
  let done = false;
  const finished = () => {
    if (done) return;
    stop();
    onEnd();
  };
  // Really playing, not merely asked to (a refusal never gets here).
  const playing = () => {
    a.removeEventListener('playing', playing);
    if (!done) onStart?.();
  };
  const stop = () => {
    if (done) return;
    done = true;
    a.removeEventListener('ended', finished);
    a.removeEventListener('error', finished);
    a.removeEventListener('playing', playing);
    a.pause();
    a.removeAttribute('src');
    a.load();
  };
  a.addEventListener('ended', finished);
  a.addEventListener('error', finished);
  a.addEventListener('playing', playing);
  a.muted = false;
  a.volume = Math.max(0, Math.min(1, volume));
  a.src = uri;
  // A refusal (the page never touched) ends the clip at once, not after its length.
  void a.play()?.catch(finished);
  return { stop };
}
