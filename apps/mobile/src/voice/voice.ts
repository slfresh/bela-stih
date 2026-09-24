import type { AudioQuality, IOSOutputFormat, RecordingOptions } from 'expo-audio';
import type { Seat } from '@belot/engine';

/**
 * Push-to-talk voice messages: the part with no device in it, so it is
 * tested without a microphone. A clip is recorded while a button is held,
 * sent whole, relayed by the room to the others at the table and played there
 * by itself; nothing keeps it anywhere.
 */

/** The room's bounds (apps/server/src/protocol.ts; a test holds the two together). */
export const VOICE_MAX_MS = 15_000;
export const VOICE_MAX_BYTES = 64 * 1024;
/** A shorter press was not meant as speech: nothing is sent. */
export const VOICE_MIN_MS = 400;

export type VoiceMime = 'audio/mp4' | 'audio/webm';

/**
 * What a recording is, by its first bytes: AAC in MP4 (Android, Safari:
 * 'ftyp' at byte 4) or Opus in WebM (Chrome, Firefox: the EBML magic). The
 * room checks the same, so a take is named by what it is, not by what a
 * recorder reported.
 */
export function sniffMime(b: Uint8Array): VoiceMime | null {
  if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'audio/mp4';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  return null;
}

/**
 * A browser records Opus in WebM where it can (Chrome, Firefox): that recorder
 * keeps to the bit rate asked for. Chrome's MP4 recorder ignores it (96 kbps,
 * so 15 s came to ~165 KB, over the room's limit, and was dropped). MP4 only
 * where WebM cannot record at all (Safari). Android plays both.
 */
export function webRecordingMime(isSupported: (type: string) => boolean): string | undefined {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    try {
      if (isSupported(t)) return t;
    } catch {
      // An engine that throws for a type it does not know simply lacks it.
    }
  }
  return undefined;
}

/** Speech, not music: mono, 16 kHz, 24 kbps - 15 s is about 45 KB, inside the room's limit. */
export const VOICE_BIT_RATE = 24_000;

export function recordingOptions(webMime: string | undefined): RecordingOptions {
  return {
    extension: '.m4a',
    sampleRate: 16_000,
    numberOfChannels: 1,
    bitRate: VOICE_BIT_RATE,
    android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac', sampleRate: 16_000 },
    // No iOS build ships; the type requires the fields (MPEG4AAC, AudioQuality.LOW),
    // written as values so this module loads no native code under test.
    ios: { extension: '.m4a', outputFormat: 'aac ' as IOSOutputFormat, audioQuality: 32 as AudioQuality },
    web: { ...(webMime ? { mimeType: webMime } : {}), bitsPerSecond: VOICE_BIT_RATE },
  };
}

/** A clip as it arrives, with the time it did: a queue must not play yesterday's news. */
export interface HeardClip {
  from: Seat;
  id: number;
  ms: number;
  mime: VoiceMime;
  data: Uint8Array;
  at: number;
}

/** At most this many wait their turn; a flood beyond it is not heard. */
export const QUEUE_MAX = 3;
/** A clip that has waited this long is dropped: the moment it was about has gone. */
export const STALE_MS = 20_000;

/** A clip joins the queue unless its speaker is muted or the queue is full. */
export function enqueue(queue: readonly HeardClip[], clip: HeardClip, blocked: (s: Seat) => boolean): HeardClip[] {
  if (blocked(clip.from) || queue.length >= QUEUE_MAX) return [...queue];
  return [...queue, clip];
}

/**
 * The next clip to play, in the order they came, skipping any whose speaker
 * has been muted meanwhile and any grown stale.
 */
export function nextClip(
  queue: readonly HeardClip[],
  now: number,
  blocked: (s: Seat) => boolean,
): { clip: HeardClip | null; rest: HeardClip[] } {
  const rest = queue.filter((c) => !blocked(c.from) && now - c.at <= STALE_MS);
  const [clip, ...more] = rest;
  return { clip: clip ?? null, rest: more };
}

/** "0:04 / 0:15": how long a take has run, against the limit. */
export function takeClock(ms: number): string {
  const s = Math.min(Math.floor(ms / 1000), VOICE_MAX_MS / 1000);
  return `0:${String(s).padStart(2, '0')} / 0:${VOICE_MAX_MS / 1000}`;
}

/** A finger lifted this close to the button still sends; further off, the take is taken back. */
export const RELEASE_SLOP = 24;

/** Where a press ended, against the button's box on the screen: on it (or near), or slid off. */
export function releasedOn(
  box: { x: number; y: number; w: number; h: number } | null,
  at: { pageX: number; pageY: number; type?: string },
): boolean {
  // The browser took the touch away (a scroll, a system gesture): nothing was meant.
  if (at.type === 'touchcancel' || at.type === 'pointercancel') return false;
  if (!box) return true;
  return (
    at.pageX >= box.x - RELEASE_SLOP &&
    at.pageX <= box.x + box.w + RELEASE_SLOP &&
    at.pageY >= box.y - RELEASE_SLOP &&
    at.pageY <= box.y + box.h + RELEASE_SLOP
  );
}
