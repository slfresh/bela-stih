import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import { MSG, ROOM_NAME, ROOM_NAME_MODES, VOICE_MAX_BYTES, type RoomMessage, type VoiceMessage } from './protocol';

/**
 * End-to-end check of push-to-talk against a running server.
 *
 * A host and a guest whose apps speak voice, and a third playing an older app
 * (no `voice: true`), sit at a private table. A clip from the host reaches the
 * guest whole, never the older app, and never comes back to the host - who
 * gets an echo without the audio. Garbage (a wrong container, a lying name, too
 * short, too long, too big for the room but inside the frame, bigger than the
 * length it claims allows) is dropped and the socket stays open; clips less
 * than a second apart are refused; a guest cannot switch voice off, the host
 * can, and then nothing goes; a player who switches voice off in Settings
 * ('hears') gets nothing and sends nothing until they switch it back, an app
 * that joined with it off likewise, and an older app cannot claim it; quick
 * play has voice on. The room keeps nothing: there is nothing here to read back.
 *
 *   npm run start --workspace @belot/server        # in one terminal
 *   npx tsx apps/server/src/voice-smoke.ts         # in another
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An MP4's first box ('ftyp' at byte 4) and a body to fill `size`. */
function mp4(size: number, fill = 7): Uint8Array {
  const b = new Uint8Array(size).fill(fill);
  b.set([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
  return b;
}

interface Side {
  room: Room;
  clips: VoiceMessage[];
  last: RoomMessage | null;
  closed: boolean;
}

function side(room: Room): Side {
  const s: Side = { room, clips: [], last: null, closed: false };
  room.onMessage(MSG.voice, (m: VoiceMessage) => s.clips.push(m));
  room.onMessage(MSG.room, (m: RoomMessage) => (s.last = m));
  room.onMessage(MSG.view, () => {});
  room.onMessage(MSG.error, () => {});
  room.onMessage(MSG.emote, () => {});
  room.onMessage(MSG.gift, () => {});
  room.onLeave(() => (s.closed = true));
  return s;
}

async function main(): Promise<void> {
  console.log(`[voice-smoke] ${ENDPOINT}`);
  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    console.log(`[voice-smoke] ${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  const client = new Client(ENDPOINT);

  const host = side(await client.create(ROOM_NAME_MODES, { name: 'Govornik', private: true, gifts: true, voice: true }));
  const guest = side(await client.joinById(host.room.roomId, { name: 'Slušatelj', gifts: true, voice: true }));
  const old = side(await client.joinById(host.room.roomId, { name: 'Stari', gifts: true }));
  await wait(600);

  check(host.last?.voice === true, 'a new private table has voice on');
  const seats = host.last?.seats ?? [];
  check(seats.filter((s) => s.hearsVoice).length === 2, `the two apps that speak voice say so (${seats.filter((s) => s.hearsVoice).length})`);

  // ---- a clip, relayed ----
  const clip = mp4(30_000);
  host.room.send('voice', { mime: 'audio/mp4', ms: 4200, data: clip });
  await wait(800);
  const got = guest.clips[0];
  check(guest.clips.length === 1 && got?.mime === 'audio/mp4' && got.ms === 4200, 'the guest gets the clip');
  const bytes = got?.data ? new Uint8Array(got.data) : new Uint8Array(0);
  check(bytes.length === clip.length && bytes.every((v, i) => v === clip[i]), `whole, byte for byte (${bytes.length} of ${clip.length})`);
  check(typeof got?.from === 'number' && got.from === host.last?.seats.findIndex((s) => s.name === 'Govornik'), 'from the host\'s seat');
  check(old.clips.length === 0, 'the older app is sent nothing');
  const echo = host.clips[0];
  check(host.clips.length === 1 && echo?.data === undefined && echo?.id === got?.id, 'the host gets an echo without the audio');

  // ---- what the room drops ----
  const before = guest.clips.length;
  await wait(1100);
  host.room.send('voice', { mime: 'audio/mp4', ms: 3000, data: new Uint8Array(3000).fill(1) });
  host.room.send('voice', { mime: 'audio/webm', ms: 3000, data: mp4(3000) });
  host.room.send('voice', { mime: 'text/plain', ms: 3000, data: mp4(3000) });
  host.room.send('voice', { mime: 'audio/mp4', ms: 3000, data: mp4(100) });
  host.room.send('voice', { mime: 'audio/mp4', ms: 16_000, data: mp4(3000) });
  host.room.send('voice', { mime: 'audio/mp4', ms: 3000, data: 'AAAA' });
  host.room.send('voice', { mime: 'audio/mp4', ms: 3000, data: mp4(VOICE_MAX_BYTES + 1000) });
  // 30 KB is seconds of speech: claiming 0.4 s of it would cheat the limiter.
  host.room.send('voice', { mime: 'audio/mp4', ms: 400, data: mp4(30_000) });
  await wait(900);
  check(guest.clips.length === before, `garbage is dropped (${guest.clips.length - before} got through)`);
  check(!host.closed && !guest.closed, 'and nobody\'s socket was closed for it');

  // ---- clips too close together ----
  await wait(1100);
  host.room.send('voice', { mime: 'audio/mp4', ms: 1000, data: mp4(4000, 1) });
  host.room.send('voice', { mime: 'audio/mp4', ms: 1000, data: mp4(4000, 2) });
  await wait(800);
  check(guest.clips.length === before + 1, `one of two clips a moment apart goes (${guest.clips.length - before})`);

  // ---- the other way, and the older app still silent ----
  guest.room.send('voice', { mime: 'audio/mp4', ms: 2000, data: mp4(5000, 3) });
  await wait(800);
  check(host.clips.some((c) => c.data !== undefined), 'the guest speaks to the host');
  check(old.clips.length === 0, 'the older app still hears nothing');
  // An app without the flag cannot send either.
  const hostHeard = host.clips.length;
  old.room.send('voice', { mime: 'audio/mp4', ms: 2000, data: mp4(5000, 4) });
  await wait(800);
  check(host.clips.length === hostHeard, 'nor does it speak');

  // ---- the host's switch ----
  guest.room.send('rules', { voice: false });
  await wait(500);
  check(host.last?.voice === true, 'a guest cannot switch voice off');
  host.room.send('rules', { voice: false });
  await wait(500);
  check(guest.last?.voice === undefined, 'the host switches it off, and the table says so');
  const heard = guest.clips.length;
  await wait(1100);
  host.room.send('voice', { mime: 'audio/mp4', ms: 2000, data: mp4(5000, 5) });
  await wait(800);
  check(guest.clips.length === heard, 'then nothing goes');
  host.room.send('rules', { voice: true });
  await wait(500);
  check(guest.last?.voice === true, 'and back on');

  // ---- a player's own switch, in Settings ----
  guest.room.send('hears', { on: false });
  await wait(500);
  const guestHeard = guest.clips.length;
  host.room.send('voice', { mime: 'audio/mp4', ms: 1500, data: mp4(5000, 6) });
  await wait(800);
  check(guest.clips.length === guestHeard, 'a player with voice switched off is sent nothing');
  const hostBefore = host.clips.filter((c) => c.data !== undefined).length;
  guest.room.send('voice', { mime: 'audio/mp4', ms: 1500, data: mp4(5000, 7) });
  await wait(800);
  check(host.clips.filter((c) => c.data !== undefined).length === hostBefore, 'and what they send is not taken');
  guest.room.send('hears', { on: true });
  await wait(1100);
  host.room.send('voice', { mime: 'audio/mp4', ms: 1500, data: mp4(5000, 8) });
  await wait(800);
  check(guest.clips.length === guestHeard + 1, 'switched back on, they hear again');
  old.room.send('hears', { on: true });
  await wait(1100);
  host.room.send('voice', { mime: 'audio/mp4', ms: 1500, data: mp4(5000, 9) });
  await wait(800);
  check(old.clips.length === 0, 'an older app cannot claim to hear');
  // An app whose player had voice off at the door, then switches it on.
  const quiet = side(await client.joinById(host.room.roomId, { name: 'Tihi', gifts: true, voice: false }));
  await wait(1100);
  host.room.send('voice', { mime: 'audio/mp4', ms: 1500, data: mp4(5000, 10) });
  await wait(800);
  check(quiet.clips.length === 0, 'an app that joined with voice off is sent nothing');
  quiet.room.send('hears', { on: true });
  await wait(1100);
  host.room.send('voice', { mime: 'audio/mp4', ms: 1500, data: mp4(5000, 11) });
  await wait(800);
  check(quiet.clips.length === 1, 'until it says it hears');

  // ---- quick play ----
  const stranger = side(await client.joinOrCreate(ROOM_NAME_MODES, { name: 'Stranac', gifts: true, voice: true }));
  await wait(600);
  check(stranger.last?.voice === true, 'quick play has voice on');
  const oldQuick = side(await client.joinOrCreate(ROOM_NAME, { name: 'StariBrzi', gifts: true }));
  await wait(600);
  check(oldQuick.last !== null, 'an older app\'s quick play still works');

  for (const s of [host, guest, old, quiet, stranger, oldQuick]) await s.room.leave(true).catch(() => {});
  await wait(300);
  console.log(failures.length === 0 ? '[voice-smoke] PASS' : `[voice-smoke] FAIL (${failures.length})`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[voice-smoke] error', err);
  process.exit(1);
});
