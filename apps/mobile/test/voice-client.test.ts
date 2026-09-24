import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Seat } from '@belot/engine';
import {
  enqueue,
  nextClip,
  QUEUE_MAX,
  recordingOptions,
  sniffMime,
  STALE_MS,
  takeClock,
  VOICE_BIT_RATE,
  VOICE_MAX_BYTES,
  VOICE_MAX_MS,
  webRecordingMime,
  type HeardClip,
} from '../src/voice/voice';
import * as room from '../../server/src/protocol';

/**
 * The app's side of push-to-talk, without a microphone: what a recording is,
 * how it is recorded, and the order clips are heard in.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, '../src', p), 'utf8');

const clip = (from: Seat, id: number, at: number): HeardClip => ({
  from,
  id,
  ms: 2000,
  mime: 'audio/mp4',
  data: new Uint8Array(8),
  at,
});
const none = () => false;

describe('what the app records', () => {
  it('names a take by its bytes, as the room checks it', () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d]);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f]);
    expect(sniffMime(mp4)).toBe('audio/mp4');
    expect(sniffMime(webm)).toBe('audio/webm');
    expect(sniffMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    expect(sniffMime(new Uint8Array(0))).toBeNull();
  });

  it('keeps inside the room: the same length, size and formats', () => {
    expect(VOICE_MAX_MS).toBe(room.VOICE_MAX_MS);
    expect(VOICE_MAX_BYTES).toBe(room.VOICE_MAX_BYTES);
    expect([...room.VOICE_MIMES].sort()).toEqual(['audio/mp4', 'audio/webm']);
    // 15 s at the bit rate, with a quarter for the container, still fits.
    expect(((VOICE_MAX_MS / 1000) * VOICE_BIT_RATE) / 8 * 1.25).toBeLessThan(VOICE_MAX_BYTES);
  });

  it('records speech on a phone as AAC in MP4, mono, 16 kHz', () => {
    const o = recordingOptions(undefined);
    expect(o.android).toMatchObject({ outputFormat: 'mpeg4', audioEncoder: 'aac' });
    expect(o.numberOfChannels).toBe(1);
    expect(o.sampleRate).toBe(16_000);
    expect(o.bitRate).toBe(VOICE_BIT_RATE);
  });

  it('in a browser, AAC in MP4 where it can, else Opus in WebM', () => {
    expect(webRecordingMime(() => true)).toBe('audio/mp4');
    expect(webRecordingMime((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(webRecordingMime((t) => t === 'audio/webm')).toBe('audio/webm');
    expect(webRecordingMime(() => false)).toBeUndefined();
    expect(webRecordingMime(() => {
      throw new Error('no');
    })).toBeUndefined();
    expect(recordingOptions('audio/mp4').web).toEqual({ mimeType: 'audio/mp4', bitsPerSecond: VOICE_BIT_RATE });
    expect(recordingOptions(undefined).web).toEqual({ bitsPerSecond: VOICE_BIT_RATE });
  });

  it('shows how long a take has run against the limit', () => {
    expect(takeClock(0)).toBe('0:00 / 0:15');
    expect(takeClock(4200)).toBe('0:04 / 0:15');
    expect(takeClock(99_000)).toBe('0:15 / 0:15');
  });
});

describe('the order clips are heard in', () => {
  it('as they came, one after another', () => {
    let q = enqueue([], clip(1, 1, 0), none);
    q = enqueue(q, clip(2, 2, 10), none);
    const a = nextClip(q, 100, none);
    expect(a.clip?.id).toBe(1);
    expect(nextClip(a.rest, 100, none).clip?.id).toBe(2);
  });

  it('never a muted or hidden speaker, even one muted while waiting', () => {
    const muted = (s: Seat) => s === 2;
    expect(enqueue([], clip(2, 1, 0), muted)).toEqual([]);
    const q = enqueue(enqueue([], clip(2, 1, 0), none), clip(3, 2, 0), none);
    expect(nextClip(q, 10, muted).clip?.id).toBe(2);
  });

  it('no more than QUEUE_MAX waiting, and nothing stale', () => {
    let q: HeardClip[] = [];
    for (let i = 0; i < QUEUE_MAX + 2; i++) q = enqueue(q, clip(1, i, 0), none);
    expect(q).toHaveLength(QUEUE_MAX);
    expect(nextClip(q, STALE_MS + 1, none).clip).toBeNull();
    expect(nextClip(q, STALE_MS, none).clip?.id).toBe(0);
  });
});

describe('the app around it', () => {
  it('every join tells the room this app speaks voice, as it does gifts', () => {
    const n = src('net/useNetGame.ts');
    const joins = n.match(/c\.(joinOrCreate|create|joinById)\(.*\{[^}]*\}\)/g) ?? [];
    expect(joins.length).toBe(4);
    for (const j of joins) expect(j, j).toMatch(/voice: true/);
  });

  it("drops a clip from a hidden or muted player before it is heard, and never plays my own", () => {
    const n = src('net/useNetGame.ts');
    expect(n).toMatch(/if \(seat === mySeatRef\.current \|\| hiddenRef\.current\.includes\(seat\) \|\| mutedRef\.current\.includes\(seat\)\) return;/);
    expect(n).toMatch(/const mime = data \? sniffMime\(data\) : null;\s*if \(!data \|\| !mime\) return;/);
  });

  it('asks for the microphone and keeps the media sessions away', () => {
    const app = JSON.parse(readFileSync(join(here, '../app.json'), 'utf8'));
    expect(app.expo.android.blockedPermissions).not.toContain('android.permission.RECORD_AUDIO');
    expect(app.expo.android.blockedPermissions).toContain('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK');
    const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'));
    // Exact: the version every shipped build already carried natively.
    expect(pkg.dependencies['expo-file-system']).toBe('57.0.5');
  });

  it('plays each clip on a player of its own, removed when it ends, the game sounds dipped meanwhile', () => {
    const p = src('voice/useVoicePlayback.ts');
    expect(p).toMatch(/player = createAudioPlayer\(src\.uri\);/);
    expect(p).toMatch(/player\?\.remove\(\);/);
    expect(p).toMatch(/src\.release\(\);/);
    expect(p).toMatch(/setSfxDuck\(SFX_UNDER_VOICE\);/);
    expect(p).toMatch(/setSfxDuck\(1\);/);
    // A clip that never says it is done still lets the next one go.
    expect(p).toMatch(/timer = setTimeout\(stop, clip\.ms \+ FINISH_SLACK_MS\);/);
    expect(src('audio.ts')).toMatch(/gain \* master \* duck \* \(opts\.gain \?\? 1\)/);
  });

  it('drops a take that is cut short, slid off, or interrupted, unread', () => {
    const r = src('voice/useVoiceRecorder.ts');
    expect(r).toMatch(/if \(!send \|\| ms < VOICE_MIN_MS \|\| !uri\) \{\s*dropTake\(uri\);/);
    expect(r).toMatch(/if \(s !== 'active'\) void finish\(false\);/);
    expect(r).toMatch(/limit\.current = setTimeout\(\(\) => void finish\(true\), VOICE_MAX_MS\);/);
  });
});
