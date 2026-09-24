import { VOICE_MAX_BYTES, VOICE_MAX_MS, VOICE_MIMES, VOICE_MIN_BYTES } from './protocol';

/**
 * Push-to-talk clips, as the room judges them: pure, so they are tested
 * without a socket. A clip is relayed to the others at the table and dropped;
 * nothing here keeps, decodes or logs audio.
 */

/**
 * The most bytes a clip may carry for the length it claims: the limiter
 * counts claimed milliseconds, so a clip that understates its length must
 * not pass. 20 bytes a millisecond is 160 kbps, over anything a recorder
 * here makes (24 kbps asked for, 96 kbps from a browser that ignores it);
 * the allowance covers the container's header.
 */
export const VOICE_BYTES_PER_MS = 20;
export const VOICE_HEADER_BYTES = 4096;

export interface Clip {
  mime: string;
  data: Uint8Array;
  ms: number;
}

/**
 * A clip the room will relay, or null. The container is checked by its first
 * bytes as well as its name: an MP4 carries `ftyp` at byte 4, a WebM starts
 * with the EBML magic - so what goes out is at least the audio it claims to
 * be, whatever a modified client sends.
 */
export function checkClip(mime: unknown, data: unknown, ms: unknown): Clip | null {
  if (typeof mime !== 'string' || !VOICE_MIMES.includes(mime)) return null;
  if (!(data instanceof Uint8Array)) return null;
  if (data.byteLength < VOICE_MIN_BYTES || data.byteLength > VOICE_MAX_BYTES) return null;
  // A take stops at VOICE_MAX_MS; a little over is the recorder's rounding.
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 300 || ms > VOICE_MAX_MS + 500) return null;
  if (data.byteLength > VOICE_HEADER_BYTES + ms * VOICE_BYTES_PER_MS) return null;
  const mp4 = data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70;
  const webm = data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
  if (mime === 'audio/mp4' ? !mp4 : !webm) return null;
  return { mime, data, ms: Math.round(ms) };
}

/** Clips from one connection come at least this far apart. */
export const VOICE_GAP_MS = 1000;
/** And add up to no more than this much audio in any VOICE_WINDOW_MS: someone talking all the time, no more. */
export const VOICE_BUDGET_MS = 60_000;
export const VOICE_WINDOW_MS = 60_000;

/**
 * One connection's voice allowance. Recording takes as long as the clip, so a
 * person never meets these limits; a script flooding the table does.
 */
export class VoiceLimiter {
  private last = -Infinity;
  private sent: { at: number; ms: number }[] = [];

  /** May a clip of `ms` go at `now`? If so it is counted. */
  take(now: number, ms: number): boolean {
    if (now - this.last < VOICE_GAP_MS) return false;
    this.sent = this.sent.filter((s) => now - s.at < VOICE_WINDOW_MS);
    const used = this.sent.reduce((t, s) => t + s.ms, 0);
    if (used + ms > VOICE_BUDGET_MS) return false;
    this.last = now;
    this.sent.push({ at: now, ms });
    return true;
  }
}
