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
import { computeTableMetrics, EMOTE_TOGGLE, LAND_TRAY_W } from '../src/table/metrics';
import { Lang, LOCALE_IDS } from '@belot/i18n';

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

  it('in a browser, Opus in WebM (it keeps the bit rate), MP4 only where WebM cannot record', () => {
    expect(webRecordingMime(() => true)).toBe('audio/webm;codecs=opus');
    expect(webRecordingMime((t) => t === 'audio/webm')).toBe('audio/webm');
    expect(webRecordingMime((t) => t === 'audio/mp4')).toBe('audio/mp4');
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
  it("every join tells the room this app speaks voice, and whether its player has it on", () => {
    const n = src('net/useNetGame.ts');
    const joins = n.match(/c\.(joinOrCreate|create|joinById)\(.*\{[^}]*\}\)/g) ?? [];
    expect(joins.length).toBe(4);
    for (const j of joins) expect(j, j).toMatch(/gifts: true,\s*voice: voiceRef\.current\b/);
    expect(n).toMatch(/const voiceRef = useRef\(settings\.voice\);\s*voiceRef\.current = settings\.voice;/);
    // Switched in Settings at the table: the room hears of it at once.
    expect(n).toMatch(/useEffect\(\(\) => \{\s*roomRef\.current\?\.send\('hears', \{ on: settings\.voice \}\);\s*\}, \[settings\.voice\]\);/);
    // The server's side of both, typed.
    const hears: room.ClientMessage = { type: 'hears', on: false };
    expect(hears.type).toBe('hears');
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

  it("plays each clip at the game's volume, lets it go when it ends, the game sounds dipped meanwhile", () => {
    const p = src('voice/useVoicePlayback.ts');
    expect(p).toMatch(/playback = playClip\(src\.uri, masterVolume\(\), stop\);/);
    expect(p).toMatch(/playback\?\.stop\(\);\s*src\?\.release\(\);/);
    // What a killed app left in the cache goes as the screen opens, before any clip can come.
    expect(p).toMatch(/useEffect\(\(\) => sweepVoiceFiles\(\), \[\]\);/);
    expect(p).toMatch(/setSfxDuck\(SFX_UNDER_VOICE\);/);
    expect(p).toMatch(/setSfxDuck\(1\);/);
    // A clip that never says it is done still lets the next one go.
    expect(p).toMatch(/timer = setTimeout\(stop, clip\.ms \+ FINISH_SLACK_MS\);/);
    expect(src('audio.ts')).toMatch(/gain \* master \* duck \* \(opts\.gain \?\? 1\)/);
  });

  it("keeps the recorder with the online screen, so the table's rows cannot take a take with them", () => {
    const o = src('net/OnlineGame.tsx');
    expect(o).toMatch(/const mic = useVoiceRecorder\(/);
    expect(o).toMatch(/mic=\{voiceHere \? mic : undefined\}/);
    // Voice switched off mid-take: dropped, and never sent.
    expect(o).toMatch(/if \(voiceHereRef\.current\) sendVoice\(take\);/);
    expect(o).toMatch(/if \(!voiceHere\) void finishTake\(false\);/);
    const t = src('TableScreen.tsx');
    expect(t).not.toMatch(/useVoiceRecorder\(/);
    expect(src('table/MicButton.tsx')).not.toMatch(/useVoiceRecorder\(/);
    // The button leaving the screen sends what was said.
    expect(t).toMatch(/const micLive = mic !== undefined && micShown && !settled;/);
    expect(t).toMatch(/if \(!micLive\) void finishTake\?\.\(true\);/);
  });

  it('never leaves a microphone open or a take on the phone', () => {
    const r = src('voice/useVoiceRecorder.ts');
    // Opened but would not record: closed again.
    expect(r).toMatch(/if \(prepared\) \{\s*try \{\s*await recorder\.stop\(\);/);
    // The screen closing mid-take: the file by the name kept at the start, whatever the recorder says.
    expect(r).toMatch(/takeUri\.current = Platform\.OS === 'web' \? null : recorder\.uri;/);
    expect(r).toMatch(/void recorder\.stop\(\)\.catch\(\(\) => \{\}\);[\s\S]{0,120}dropTake\(takeUri\.current\);/);
    const f = src('voice/clipFiles.ts');
    expect(f).toMatch(/sweep\(new Directory\(Paths\.cache, 'Audio'\), TAKE_FILE\);/);
    expect(f).toMatch(/sweep\(Paths\.cache, HEARD_FILE\);/);
  });

  it('drops a take that is cut short, slid off, or interrupted, unread', () => {
    const r = src('voice/useVoiceRecorder.ts');
    expect(r).toMatch(/if \(!send \|\| ms < VOICE_MIN_MS \|\| !uri\) \{\s*dropTake\(uri\);/);
    expect(r).toMatch(/if \(s !== 'active'\) void finish\(false\);/);
    expect(r).toMatch(/limit\.current = setTimeout\(\(\) => void finish\(true\), VOICE_MAX_MS\);/);
  });
});

describe('the table, with voice', () => {
  const t = src('TableScreen.tsx');

  it('offers the mic only while nothing is asked, so no row grows', () => {
    expect(t).toMatch(/const micShown = !asking && !belaOffered && !shed && micFits;/);
    expect(t).toMatch(/const micButton = micLive \? \(/);
  });

  it("leaves the faces' toggle where it was before there was a mic", () => {
    // Portrait: the mic left of it, a spacer as wide right of it, the row centred.
    expect(t).toMatch(/<View style=\{styles\.actionsRow\}>\s*\{micButton\}\s*\{emoteToggle\}\s*\{micButton && <View style=\{styles\.micBalance\} \/>\}/);
    expect(t).toMatch(/micBalance: \{ width: EMOTE_TOGGLE, height: EMOTE_TOGGLE \}/);
    // Sideways: the toggle keeps the rail's left edge.
    expect(t).toMatch(/<View style=\{styles\.railToggles\}>\s*\{emoteToggle\}\s*\{micButton\}\s*<\/View>/);
    // Neither touch area reaches past the gap's middle.
    expect(t).toMatch(/hitSlop=\{land \? \{ top: 8, bottom: 8, left: RAIL_GAP \/ 2, right: 8 \} : \{ top: 8, bottom: 8, left: 8, right: ROW_GAP \/ 2 \}\}/);
    expect(t).toMatch(/!micButton \? 8 : land \? \{ top: 8, bottom: 8, left: 8, right: RAIL_GAP \/ 2 \} : \{ top: 8, bottom: 8, left: ROW_GAP \/ 2, right: 8 \}/);
    expect(t).toMatch(/gap: ROW_GAP,\s*justifyContent: 'center'/);
    expect(t).toMatch(/railToggles: \{ flexDirection: 'row', gap: RAIL_GAP,/);
  });

  it('fits a landscape rail beside the toggle at the narrowest rail there is', () => {
    expect(t).toMatch(/const RAIL_MIC = 34;/);
    for (const [w, h] of [[568, 320], [640, 320], [723, 336], [915, 412]]) {
      const m = computeTableMetrics(w, h);
      expect(34 + 4 + EMOTE_TOGGLE, `${w}x${h}`).toBeLessThanOrEqual(m.railW);
    }
    // Where a rail is narrower (a very short screen on its side), the mic stands down.
    expect(computeTableMetrics(500, 270).railW).toBeLessThan(34 + 4 + EMOTE_TOGGLE);
    expect(t).toMatch(/const micFits = !land \|\| m\.railW >= RAIL_MIC \+ 4 \+ EMOTE_TOGGLE;/);
    expect(LAND_TRAY_W).toBeGreaterThan(0);
  });

  it('sends waves from whoever speaks, me while I record', () => {
    expect(t).toMatch(/if \(recording\) set\.add\(mySeat\);/);
    expect(t).toMatch(/giftN=\{giftLanded\?\.\[s\] \?\? 0\}\s*speaking=\{speakingSeats\.has\(s\)\}/);
    expect(t).toMatch(/giftN=\{giftLanded\?\.\[mySeat\] \?\? 0\}\s*speaking=\{speakingSeats\.has\(mySeat\)\}/);
    const puck = src('table/SeatPuck.tsx');
    expect(puck).toMatch(/\(reduced \? \[0\] : \[0, VOICE_WAVE_GAP_MS\]\)/);
    expect(puck).toMatch(/reduced \? styles\.waveStill : \{ \.\.\.voiceWave, animationDelay: delay \}/);
  });

  it('lets one player be muted in the player view, unless already hidden', () => {
    const g = src('table/GiftPicker.tsx');
    expect(g).toMatch(/\{moderate\.onMute && !moderate\.hidden && \(/);
    expect(t).toMatch(/\.\.\.\(onMute && mic\s*\?/);
  });

  it('hears nothing where voice is off, at the table or in Settings', () => {
    const o = src('net/OnlineGame.tsx');
    expect(o).toMatch(/const voiceHere = settings\.voice && net\.voiceOn;/);
    expect(o).toMatch(/mic=\{voiceHere \? mic : undefined\}/);
    expect(o).toMatch(/\(s\) => net\.hidden\.includes\(s\) \|\| net\.muted\.includes\(s\),/);
    // The host's switch in the lobby, as the other rules.
    expect(o).toMatch(/label=\{ui\.voiceRule\}\s*host=\{isHost\}/);
    expect(o).toMatch(/onPick=\{\(k\) => net\.setRules\(\{ voice: k === 'on' \}\)\}/);
    expect(src('screens/SettingsScreen.tsx')).toMatch(/toggleRow\(ui\.voiceSetting, settings\.voice,/);
  });

  it('says it all in every language, without a gendered word about the player', () => {
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      for (const k of ['micLabel', 'micHint', 'micTooShort', 'micDenied', 'micFailed', 'voiceRule', 'voiceOn', 'voiceOff', 'voiceSetting', 'voiceSettingHint', 'muteVoice', 'unmuteVoice', 'muteVoiceNote'] as const) {
        expect(ui[k].length, `${id} ${k}`).toBeGreaterThan(1);
      }
      expect(ui.voiceOn).not.toBe(ui.voiceOff);
      expect(ui.muteVoice).not.toBe(ui.unmuteVoice);
    }
    const hr = new Lang('hr').s.ui;
    expect(`${hr.hidePlayerNote} ${hr.muteVoiceNote}`).not.toMatch(/\b(njegov\w*|njezin\w*|mu|joj)\b/);
    expect(hr.hidePlayerNote).toMatch(/glasovne poruke/);
  });
});
