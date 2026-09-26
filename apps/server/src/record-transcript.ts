import './ws-polyfill';
import WsWebSocket from 'ws';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { Client, type Room } from 'colyseus.js';
import type { Action, PublicView } from '@belot/engine';
import { MSG, ROOM_NAME, ROOM_NAME_MODES, type RoomMessage } from './protocol';

/**
 * Records what a 1.5.x app and the server say to each other, byte for byte,
 * so a later server (Colyseus 0.18 and its legacy container, R6a of the plan)
 * can be checked against the wire the shipped apps speak. Everything a real
 * client does is captured: the matchmaking HTTP calls and their answers, every
 * websocket frame in both directions (raw bytes, base64), and the decoded
 * messages beside them. Four scenarios, one file each:
 *
 *   full-match      a private table, four people, lobby fiddling, a whole match
 *                   to 501 with emotes, a gift, a voice clip and its receipts,
 *                   pause/resume, away/back, then a rematch and leaving;
 *   bots-reconnect  a host starts with bots, plays a deal, drops the socket
 *                   without leaving and walks back in on the reconnection token;
 *   quick-play      quick play on both room names (an app before the three
 *                   versions, and one after), a second seat from the same
 *                   address refused with 4300, an unknown code refused with 4212;
 *   garbage         what the room answers to malformed frames.
 *
 *   npm run server                                      # in one terminal
 *   npx tsx apps/server/src/record-transcript.ts <dir>  # in another
 *
 * Deterministic where it can be: every choice comes from a seeded generator,
 * so two recordings of the same server differ only in ids, tokens and times.
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const OUT = process.argv[2] ?? join('apps', 'server', 'transcripts', 'current');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- the tape ------------------------------------------------------------------

interface Frame {
  t: number;
  client: string;
  dir: 'in' | 'out';
  /** The raw bytes as base64, exactly as they crossed the socket. */
  bytes: string;
  /** Colyseus's first byte, named. */
  code: string;
}
interface HttpCall {
  t: number;
  client: string;
  method: string;
  path: string;
  body: unknown;
  status: number | null;
  response: unknown;
  error: string | null;
}
interface Decoded {
  t: number;
  client: string;
  dir: 'in' | 'out';
  type: string | number;
  message: unknown;
}
interface Tape {
  meta: Record<string, unknown>;
  http: HttpCall[];
  frames: Frame[];
  messages: Decoded[];
  notes: string[];
}

const CODES: Record<number, string> = {
  9: 'HANDSHAKE',
  10: 'JOIN_ROOM',
  11: 'ERROR',
  12: 'LEAVE_ROOM',
  13: 'ROOM_DATA',
  14: 'ROOM_STATE',
  15: 'ROOM_STATE_PATCH',
  16: 'ROOM_DATA_SCHEMA',
  17: 'ROOM_DATA_BYTES',
};

let tape: Tape = fresh('none');
let currentClient = 'none';
const t0 = Date.now();
const now = () => Date.now() - t0;

function fresh(scenario: string): Tape {
  return {
    meta: {
      scenario,
      recordedAt: new Date().toISOString(),
      endpoint: ENDPOINT,
      sdk: `colyseus.js ${sdkVersion()}`,
      serverCommit: gitSha(),
    },
    http: [],
    frames: [],
    messages: [],
    notes: [],
  };
}
function sdkVersion(): string {
  try {
    return (createRequire(import.meta.url)('colyseus.js/package.json') as { version: string }).version;
  } catch {
    return 'unknown';
  }
}
function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
/** Voice bytes are large and meaningless in a diff: replaced by a digest in the decoded view. */
function digestBytes(v: unknown): unknown {
  if (v instanceof Uint8Array) return { bytes: v.byteLength, sha256: createHash('sha256').update(v).digest('hex').slice(0, 16) };
  if (Array.isArray(v)) return v.map(digestBytes);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, digestBytes(x)]));
  return v;
}

// Every socket the SDK opens is taped: bytes out, bytes in. On the class the
// polyfill installed, not a subclass: colyseus.js reads `globalThis.WebSocket`
// once, when it loads, which is before anything here runs.
const toBuffer = (data: unknown): Buffer =>
  Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? Buffer.from(data) : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(String(data));
const frame = (client: string, dir: 'in' | 'out', data: unknown) => {
  const buf = toBuffer(data);
  tape.frames.push({ t: now(), client, dir, bytes: buf.toString('base64'), code: CODES[buf[0] ?? -1] ?? String(buf[0]) });
};
type Taped = WsWebSocket & { __client?: string };
const proto = WsWebSocket.prototype as unknown as {
  send: (this: Taped, data: unknown, ...rest: unknown[]) => void;
  addEventListener: (this: Taped, type: string, handler: (ev: { data: unknown }) => void, options?: unknown) => void;
};
const origSend = proto.send;
proto.send = function (this: Taped, data: unknown, ...rest: unknown[]) {
  frame(this.__client ?? currentClient, 'out', data);
  return origSend.call(this, data, ...rest);
};
const origAdd = proto.addEventListener;
proto.addEventListener = function (this: Taped, type: string, handler: (ev: { data: unknown }) => void, options?: unknown) {
  if (type !== 'message') return origAdd.call(this, type, handler, options);
  // The SDK sets `onmessage` while joining, so the client of the moment is this socket's.
  this.__client = this.__client ?? currentClient;
  const client = this.__client;
  return origAdd.call(
    this,
    type,
    (ev: { data: unknown }) => {
      frame(client, 'in', ev.data);
      handler(ev);
    },
    options,
  );
};

/** A client whose matchmaking calls are taped too. */
function tapedClient(name: string): Client {
  const client = new Client(ENDPOINT);
  const http = (client as unknown as { http: { request: (m: string, p: string, o?: { body?: unknown }) => Promise<{ statusCode?: number; status?: number; data?: unknown }> } }).http;
  const request = http.request.bind(http);
  http.request = async (method, path, options = {}) => {
    currentClient = name;
    const call: HttpCall = { t: now(), client: name, method, path, body: options.body ?? null, status: null, response: null, error: null };
    tape.http.push(call);
    try {
      const res = await request(method, path, options);
      call.status = res?.statusCode ?? res?.status ?? null;
      call.response = res?.data ?? null;
      return res;
    } catch (e) {
      call.error = String((e as { message?: string })?.message ?? e);
      throw e;
    }
  };
  return client;
}

interface Player {
  name: string;
  room: Room;
  seat: number;
  view: PublicView | null;
  /** Something was sent for the view in hand; nothing more until the next view arrives. */
  pending: boolean;
  last: RoomMessage | null;
  errors: unknown[];
  closed: number | null;
}

function tapeRoom(name: string, room: Room): Player {
  const s: Player = { name, room, seat: -1, view: null, pending: false, last: null, errors: [], closed: null };
  room.onMessage('*', (type: string | number, message: unknown) => {
    tape.messages.push({ t: now(), client: name, dir: 'in', type, message: digestBytes(message) });
    if (type === MSG.view) {
      const m = message as { seat: number; view: PublicView };
      s.seat = m.seat;
      s.view = m.view;
      s.pending = false;
    } else if (type === MSG.room) s.last = message as RoomMessage;
    else if (type === MSG.error) s.errors.push(message);
  });
  room.onLeave((code) => {
    s.closed = code;
    tape.messages.push({ t: now(), client: name, dir: 'in', type: 'onLeave', message: { code } });
  });
  const send = room.send.bind(room) as (type: string | number, message?: unknown) => void;
  room.send = ((type: string | number, message?: unknown) => {
    tape.messages.push({ t: now(), client: name, dir: 'out', type, message: digestBytes(message) });
    send(type, message);
  }) as typeof room.send;
  return s;
}

async function sitDown(name: string, f: (c: Client) => Promise<Room>): Promise<Player> {
  currentClient = name;
  const room = await f(tapedClient(name));
  return tapeRoom(name, room);
}

// --- playing -------------------------------------------------------------------

function rngOf(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x1_0000_0000;
  };
}

/** Everyone plays from their own view until `until` holds (or `maxSteps` pass). */
async function play(seats: Player[], rng: () => number, until: () => boolean, maxSteps = 5000): Promise<void> {
  for (let step = 0; step < maxSteps && !until(); step++) {
    let acted = false;
    for (const s of seats) {
      const v = s.view;
      if (!v || s.closed !== null || s.pending) continue;
      if (v.toAct === s.seat && v.legalActions.length > 0) {
        const a = v.legalActions[Math.floor(rng() * v.legalActions.length)] as Action;
        s.pending = true;
        s.room.send('action', { action: a });
        acted = true;
      } else if (v.phase === 'DEAL_OVER') {
        s.pending = true;
        s.room.send('next', {});
        acted = true;
      }
    }
    await wait(acted ? 60 : 120);
  }
}

/** An MP4's first box and a body: what a phone's clip looks like to the room. */
function mp4(size: number, fill = 7): Uint8Array {
  const b = new Uint8Array(size).fill(fill);
  b.set([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
  return b;
}

/** Compact and gzipped: a whole match is ~6 MB of views spelled out, well under 1 MB packed. */
function save(name: string): void {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${name}.json.gz`);
  const packed = gzipSync(Buffer.from(JSON.stringify(tape) + '\n'), { level: 9 });
  writeFileSync(file, packed);
  console.log(
    `[record] ${file}: ${tape.http.length} http calls, ${tape.frames.length} frames, ${tape.messages.length} messages, ${(packed.length / 1024).toFixed(0)} KB`,
  );
}

async function leaveAll(seats: Player[]): Promise<void> {
  for (const s of seats) if (s.closed === null) await s.room.leave(true).catch(() => {});
  await wait(300);
}

// --- scenarios -----------------------------------------------------------------

async function fullMatch(): Promise<void> {
  tape = fresh('full-match');
  const rng = rngOf(41);
  const host = await sitDown('host', (c) => c.create(ROOM_NAME_MODES, { name: 'Domaćin', avatar: 'ana', private: true, mode: 'easy', gifts: true, voice: true, receipts: true }));
  await wait(400);
  const code = host.room.roomId;
  const g1 = await sitDown('guest1', (c) => c.joinById(code, { name: 'Gost Jedan', avatar: 'brko', gifts: true, voice: true, receipts: true }));
  const g2 = await sitDown('guest2', (c) => c.joinById(code, { name: 'Gost Dva', avatar: 'teta', gifts: true, voice: true }));
  // A 1.4.x app: gifts, but no idea of voice.
  const g3 = await sitDown('guest3', (c) => c.joinById(code, { name: 'Gost Tri', avatar: 'kapetan', gifts: true }));
  await wait(500);
  tape.notes.push('lobby: a guest moves seat; the host sets the clock, the target, the version, voice off and on; emotes');
  g1.room.send('sit', { seat: 3 });
  await wait(300);
  host.room.send('clock', { seconds: 60 });
  await wait(200);
  host.room.send('rules', { target: 501, mode: 'easy' });
  await wait(200);
  host.room.send('rules', { voice: false });
  await wait(200);
  host.room.send('rules', { voice: true });
  await wait(200);
  g2.room.send('emote', { id: 'smile' });
  await wait(300);
  host.room.send('start', {});
  await wait(800);
  const seats = [host, g1, g2, g3];
  tape.notes.push('the first deal, with an emote, a gift, a voice clip and its receipt, a pause and an absence during it');
  let poked = false;
  await play(seats, rng, () => {
    const v = host.view;
    if (!poked && v && v.phase === 'PLAY') {
      poked = true;
      g1.room.send('emote', { id: 'laugh' });
      host.room.send('gift', { id: 'kava', to: 'table' });
      host.room.send('voice', { mime: 'audio/mp4', ms: 2000, data: mp4(5000, 3) });
      host.room.send('pause', {});
      setTimeout(() => host.room.send('resume', {}), 700);
      setTimeout(() => g2.room.send('away', {}), 900);
      setTimeout(() => g2.room.send('back', {}), 1500);
    }
    return seats.some((s) => s.view?.phase === 'DEAL_OVER');
  });
  await wait(1200);
  for (const s of [g1, g2]) {
    const clip = tape.messages.find((m) => m.client === s.name && m.dir === 'in' && m.type === MSG.voice && (m.message as { data?: unknown })?.data);
    if (clip) s.room.send('heard', { id: (clip.message as { id: number }).id });
  }
  await wait(400);
  tape.notes.push('the rest of the match to 501');
  await play(seats, rng, () => seats.some((s) => s.view?.phase === 'MATCH_OVER'), 20_000);
  await wait(800);
  tape.notes.push('rematch: three ask, the host forces the start, a deal, then everyone leaves');
  g1.room.send('rematch', {});
  g2.room.send('rematch', {});
  g3.room.send('rematchCancel', {});
  g3.room.send('rematch', {});
  await wait(400);
  host.room.send('rematch', {});
  await wait(1500);
  await play(seats, rng, () => seats.some((s) => s.view?.phase === 'DEAL_OVER'), 3000);
  await leaveAll(seats);
  save('full-match');
}

async function botsReconnect(): Promise<void> {
  tape = fresh('bots-reconnect');
  const rng = rngOf(7);
  const host = await sitDown('host', (c) => c.create(ROOM_NAME_MODES, { name: 'Sam', avatar: 'ana', private: true, mode: 'learn', gifts: true, voice: true, receipts: true }));
  await wait(400);
  host.room.send('start', {});
  await wait(800);
  tape.notes.push('a deal against three bots');
  await play([host], rng, () => host.view?.phase === 'DEAL_OVER' || host.view?.phase === 'MATCH_OVER');
  await wait(600);
  const token = host.room.reconnectionToken;
  tape.notes.push(`the socket drops without a leave; the seat is held; reconnect on the token ${token ? '(present)' : '(missing!)'}`);
  // The SDK's socket, cut without a leave: the server holds the seat for TABLE_RECONNECT_SECONDS.
  const ws = (host.room.connection as unknown as { transport: { ws: { terminate: () => void } } }).transport.ws;
  ws.terminate();
  await wait(1500);
  currentClient = 'host-again';
  const again = tapeRoom('host-again', await tapedClient('host-again').reconnect(token));
  await wait(800);
  tape.notes.push('the next deal after the reconnect, then leave');
  await play([again], rng, () => {
    const p = again.view?.phase;
    return p === 'DEAL_OVER' || p === 'MATCH_OVER';
  });
  await leaveAll([again]);
  tape.notes.push('the same token after leaving for good: refused with 4214 (what an app sees when its hold has lapsed)');
  try {
    currentClient = 'host-late';
    await tapedClient('host-late').reconnect(token);
    tape.notes.push('NOT refused');
  } catch (e) {
    tape.notes.push(`refused: code ${(e as { code?: number }).code}, message ${String((e as { message?: string }).message)}`);
  }
  save('bots-reconnect');
}

async function quickPlay(): Promise<void> {
  tape = fresh('quick-play');
  tape.notes.push('an app from before the three versions, on the old room name, with no voice key');
  const old = await sitDown('old-app', (c) => c.joinOrCreate(ROOM_NAME, { name: 'Stari', avatar: 'brko', gifts: true }));
  await wait(400);
  tape.notes.push('a 1.5.x app on the modes room name');
  const fresh1 = await sitDown('new-app', (c) => c.joinOrCreate(ROOM_NAME_MODES, { name: 'Novi', avatar: 'teta', gifts: true, voice: true, receipts: true }));
  await wait(400);
  tape.notes.push('a second seat from the same address at the same public table is refused with 4300 (the app then creates its own table)');
  try {
    await sitDown('same-origin', (c) => c.joinById(fresh1.room.roomId, { name: 'Dvojnik', avatar: 'ana', gifts: true, voice: true, receipts: true }));
    tape.notes.push('NOT refused');
  } catch (e) {
    tape.notes.push(`refused: code ${(e as { code?: number }).code}, message ${String((e as { message?: string }).message)}`);
  }
  tape.notes.push('a code nobody has: 4212');
  try {
    await sitDown('bad-code', (c) => c.joinById('NOSUCH', { name: 'Nitko', avatar: 'ana', gifts: true, voice: true, receipts: true }));
  } catch (e) {
    tape.notes.push(`refused: code ${(e as { code?: number }).code}, message ${String((e as { message?: string }).message)}`);
  }
  await leaveAll([old, fresh1]);
  save('quick-play');
}

async function garbage(): Promise<void> {
  tape = fresh('garbage');
  const host = await sitDown('host', (c) => c.create(ROOM_NAME_MODES, { name: 'Test', avatar: 'ana', private: true, gifts: true, voice: true, receipts: true }));
  await wait(400);
  tape.notes.push('malformed messages: the room answers each with an error message or silence, and the socket stays open');
  host.room.send('action', { action: { type: 'PLAY_CARD', seat: 0, card: { rank: 'A', suit: 'hearts' } } });
  host.room.send('sit', { seat: 9 });
  host.room.send('gift', { id: 'nope', to: 'table' });
  host.room.send('voice', { mime: 'audio/mp4', ms: 2000, data: 'not bytes' });
  host.room.send('rules', { target: 999 });
  host.room.send('no-such-type', { a: 1 });
  host.room.send('__proto__', { polluted: true });
  await wait(800);
  tape.notes.push(`socket open: ${host.closed === null}; errors received: ${host.errors.length}`);
  await leaveAll([host]);
  save('garbage');
}

async function main(): Promise<void> {
  console.log(`[record] ${ENDPOINT} -> ${OUT}`);
  await fullMatch();
  await botsReconnect();
  await quickPlay();
  await garbage();
  process.exit(0);
}

main().catch((err) => {
  console.error('[record] error', err);
  process.exit(1);
});
