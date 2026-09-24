import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkClip, VOICE_BUDGET_MS, VOICE_GAP_MS, VoiceLimiter } from '../../server/src/voice';
import { MAX_FRAME_BYTES, VOICE_MAX_BYTES, VOICE_MAX_MS, VOICE_MIMES, VOICE_MIN_BYTES } from '../../server/src/protocol';

/**
 * The room's side of push-to-talk: what clip it relays, how often, and to
 * whom. A clip is relayed and dropped - nothing stores, decodes or logs it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const server = (p: string) => readFileSync(join(here, '../../server/src', p), 'utf8');

/** An MP4's first box ('ftyp' at byte 4), padded to `size`. */
const mp4 = (size = 4000) => {
  const b = new Uint8Array(size);
  b.set([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
  return b;
};
/** A WebM's EBML magic, padded. */
const webm = (size = 4000) => {
  const b = new Uint8Array(size);
  b.set([0x1a, 0x45, 0xdf, 0xa3]);
  return b;
};

describe('a clip the room relays', () => {
  it('is AAC-in-MP4 or a WebM, as its first bytes say, of a sane size and length', () => {
    expect(checkClip('audio/mp4', mp4(), 3000)).toEqual({ mime: 'audio/mp4', data: mp4(), ms: 3000 });
    expect(checkClip('audio/webm', webm(), 3000)?.mime).toBe('audio/webm');
    // A name that lies about the bytes.
    expect(checkClip('audio/mp4', webm(), 3000)).toBeNull();
    expect(checkClip('audio/webm', mp4(), 3000)).toBeNull();
    // Anything else it is not.
    expect(checkClip('text/plain', mp4(), 3000)).toBeNull();
    expect(checkClip('audio/mp4', 'AAAA', 3000)).toBeNull();
    expect(checkClip('audio/mp4', [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70], 3000)).toBeNull();
    expect(checkClip('audio/mp4', mp4(VOICE_MIN_BYTES - 1), 3000)).toBeNull();
    expect(checkClip('audio/mp4', mp4(VOICE_MAX_BYTES + 1), 3000)).toBeNull();
    expect(checkClip('audio/mp4', mp4(VOICE_MAX_BYTES), 3000)).not.toBeNull();
    expect(checkClip('audio/mp4', mp4(), VOICE_MAX_MS + 501)).toBeNull();
    expect(checkClip('audio/mp4', mp4(), VOICE_MAX_MS + 400)?.ms).toBe(VOICE_MAX_MS + 400);
    expect(checkClip('audio/mp4', mp4(), 100)).toBeNull();
    expect(checkClip('audio/mp4', mp4(), Number.NaN)).toBeNull();
    expect(checkClip('audio/mp4', mp4(), '3000')).toBeNull();
    expect([...VOICE_MIMES]).toEqual(['audio/mp4', 'audio/webm']);
  });

  it('fits a frame the transport takes, with room for its envelope', () => {
    expect(MAX_FRAME_BYTES).toBeGreaterThanOrEqual(VOICE_MAX_BYTES + 16 * 1024);
    // ...and the server is really built with it: the default 4 KB closed the socket.
    expect(server('index.ts')).toMatch(/new WebSocketTransport\(\{ server: httpServer, maxPayload: MAX_FRAME_BYTES \}\)/);
  });
});

describe("one connection's allowance", () => {
  it('takes clips a second apart, and no more than a minute of audio a minute', () => {
    const l = new VoiceLimiter();
    expect(l.take(0, 5000)).toBe(true);
    expect(l.take(VOICE_GAP_MS - 1, 5000)).toBe(false);
    expect(l.take(VOICE_GAP_MS, 5000)).toBe(true);
    // Fill the minute: 10 s used, then three 15 s clips at 2, 17 and 32 s: 55 s.
    for (const t of [2000, 17_000, 32_000]) expect(l.take(t, 15_000)).toBe(true);
    // At 47 s a 15 s clip would go over the minute; a 5 s one fits exactly.
    expect(l.take(47_000, 15_000)).toBe(false);
    expect(l.take(47_000, 5000)).toBe(true);
    // At 61 s the two 5 s clips have left the window (a minute old), the one
    // sent at 2 s has not: 50 s used, no room for 15.
    expect(l.take(61_000, 15_000)).toBe(false);
    // At 62 s it has gone too: 35 s used, room again.
    expect(l.take(62_000, 15_000)).toBe(true);
    expect(VOICE_BUDGET_MS).toBe(60_000);
  });

  it('a refused clip costs nothing', () => {
    const l = new VoiceLimiter();
    expect(l.take(0, 15_000)).toBe(true);
    expect(l.take(10, 15_000)).toBe(false);
    expect(l.take(1000, 15_000)).toBe(true);
  });
});

describe('the room', () => {
  const room = server('BelaRoom.ts');
  const relay = room.slice(room.indexOf("if (packet.type === 'voice') {"), room.indexOf("if (packet.type === 'gift') {"));

  it('relays only where voice is on, from an app that records, what checkClip takes, within the allowance', () => {
    expect(relay).toMatch(/if \(!this\.voiceOn \|\| !this\.occupants\[seat\]!\.voice\) return;/);
    expect(relay).toMatch(/const clip = checkClip\(m\?\.mime, m\?\.data, m\?\.ms\);\s*if \(clip === null\) return;/);
    expect(relay).toMatch(/if \(!limiter\.take\(Date\.now\(\), clip\.ms\)\) return;/);
  });

  it('sends the clip to the others whose apps play it, and the speaker only an echo without it', () => {
    expect(relay).toMatch(/if \(s === null \|\| s === seat \|\| !this\.hearsVoice\(s\)\) continue;\s*other\.send\(MSG\.voice, out\);/);
    expect(relay).toMatch(/const echo: VoiceMessage = \{ from: seat, id, ms: clip\.ms, mime: clip\.mime \};\s*client\.send\(MSG\.voice, echo\);/);
    expect(relay).not.toMatch(/broadcast/);
    // Nothing keeps it, nothing prints it.
    expect(relay).not.toMatch(/console\./);
    expect(room).toMatch(/return o\.sessionId !== null && o\.connected && o\.voice;/);
  });

  it('lets a private table\'s host switch voice off before the start, and quick play keep it', () => {
    expect(room).toMatch(/private voiceOn = true;/);
    const rules = room.slice(room.indexOf("if (packet.type === 'rules') {"), room.indexOf("if (packet.type === 'pause') {"));
    expect(rules).toMatch(/if \(this\.started \|\| this\.isPublic \|\| seat !== this\.actingHostSeat\(\)\) return;\s*\/\/[^\n]*\n\s*const voiceChanged = typeof m\?\.voice === 'boolean'/);
    expect(room).toMatch(/\.\.\.\(this\.voiceOn \? \{ voice: true as const \} : \{\}\),/);
  });

  it('forgets a connection that has gone for good, voice allowance and all', () => {
    expect(room).toMatch(/private release\(seat: Seat\): void \{\s*const wasHost = [^\n]*\n\s*this\.forget\(this\.occupants\[seat\]!\.sessionId\);/);
    const forget = room.slice(room.indexOf('private forget('), room.indexOf('private forget(') + 500);
    for (const map of ['lastEmoteAt', 'lastSitAt', 'lastVoteAt', 'lastGiftAt', 'voiceLimits']) expect(forget).toContain(`this.${map}.delete(sessionId)`);
  });
});
