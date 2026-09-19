import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import {
  GIFT_GAP_MS,
  MSG,
  ROOM_NAME,
  type GiftMessage,
  type RoomMessage,
  type SeatInfo,
} from './protocol';

/**
 * End-to-end check of the gift relay against a running server.
 *
 * Two clients sit at a private table. Before the start a gift is refused (the
 * lobby has no pucks). After it: a burst lets exactly one through per window,
 * garbage and self-gifts are dropped, a table gift is ONE message naming the
 * three other seats, both directions relay, the seat keeps its gift through a
 * dropped connection and a reconnect, and loses it when its player leaves.
 *
 *   npm run start --workspace @belot/server        # in one terminal
 *   npx tsx apps/server/src/gift-smoke.ts          # in another
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`[gift-smoke] connecting two clients to ${ENDPOINT}`);
  const client = new Client(ENDPOINT);
  const a = await client.create(ROOM_NAME, { name: 'Darežljivi', private: true });
  let b: Room = await client.joinById(a.roomId, { name: 'Primatelj' });
  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    console.log(`[gift-smoke] ${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };

  const seenByA: GiftMessage[] = [];
  const seenByB: GiftMessage[] = [];
  let roomA: RoomMessage | null = null;
  let roomB: RoomMessage | null = null;
  let seatA = -1;
  let seatB = -1;
  const wire = (r: Room, seen: GiftMessage[], who: 'a' | 'b') => {
    r.onMessage(MSG.gift, (m: GiftMessage) => seen.push(m));
    r.onMessage(MSG.room, (m: RoomMessage) => {
      if (who === 'a') roomA = m;
      else roomB = m;
    });
    r.onMessage(MSG.view, (m: { seat: number }) => {
      if (who === 'a') seatA = m.seat;
      else seatB = m.seat;
    });
    r.onMessage(MSG.error, () => {});
    r.onMessage(MSG.emote, () => {});
  };
  wire(a, seenByA, 'a');
  wire(b, seenByB, 'b');
  await wait(400);

  // The lobby: nothing to land on, so nothing is relayed. (The first views can
  // arrive before the handlers above exist; partner-first seating puts the
  // second joiner in seat 2.)
  a.send('gift', { id: 'kava', to: seatB >= 0 ? seatB : 2 });
  await wait(400);
  check(seenByB.length === 0, 'a gift before the start is dropped');

  // The start publishes fresh views, so both seats are known from here.
  a.send('start', {});
  await wait(600);
  check(seatA >= 0 && seatB >= 0 && seatA !== seatB, `seated: A=${seatA} B=${seatB}`);

  // A burst of five: exactly one gets through. Garbage never counts.
  for (let i = 0; i < 5; i++) {
    a.send('gift', { id: 'kava', to: seatB });
    await wait(50);
  }
  await wait(400);
  check(seenByB.length === 1 && seenByA.length === 1, `burst of 5 relayed once (B saw ${seenByB.length}, A saw ${seenByA.length})`);
  const first = seenByB[0];
  check(!!first && first.from === seatA && first.to.length === 1 && first.to[0] === seatB && first.id === 'kava', 'the relayed gift says from, to and id');

  await wait(GIFT_GAP_MS);
  for (const bad of [
    { id: 'zlato', to: seatB },
    { id: 42, to: seatB },
    { id: 'kava', to: seatA },
    { id: 'kava', to: 7 },
    { id: 'kava', to: '1' },
    { id: 'kava', to: 'everyone' },
    { id: 'kava' },
  ]) {
    a.send('gift', bad);
  }
  await wait(400);
  check(seenByB.length === 1, 'unknown ids, self, out-of-range and malformed targets are dropped');

  // Those did not use up the window: a table gift goes straight through, as one message.
  a.send('gift', { id: 'kruna', to: 'table' });
  await wait(400);
  const table = seenByB[1];
  check(
    !!table && table.id === 'kruna' && table.from === seatA && table.to.length === 3 && !table.to.includes(seatA as never),
    `a table gift is one message to the other three (${table ? table.to.join(',') : 'none'})`,
  );

  // And the other way.
  b.send('gift', { id: 'ruza', to: seatA });
  await wait(400);
  check(seenByA.some((m) => m.from === seatB && m.id === 'ruza'), 'B can gift A back');

  // The room remembers: B's seat shows A's kruna on the next publish.
  const seatOf = (m: RoomMessage | null, s: number): SeatInfo | undefined => m?.seats.find((x) => x.seat === s);
  // A drop (not a consented leave): the seat is held, and keeps its gift.
  const token = b.reconnectionToken;
  roomA = null;
  await b.leave(false).catch(() => {});
  await wait(800);
  const held = seatOf(roomA, seatB);
  check(!!held && held.connected === false && held.gift === 'kruna', `a dropped seat keeps its gift (${JSON.stringify(held)})`);

  // Back in on the token: B sees its own gift.
  b = await client.reconnect(token);
  roomB = null;
  seenByB.length = 0;
  wire(b, seenByB, 'b');
  await wait(800);
  check(seatOf(roomB, seatB)?.gift === 'kruna', 'a reconnect sees the seat\'s gift');

  // A consented leave frees the seat and the gift with it.
  roomA = null;
  await b.leave(true).catch(() => {});
  await wait(800);
  const gone = seatOf(roomA, seatB);
  check(!!gone && gone.gift === undefined, `a seat whose player left has no gift (${JSON.stringify(gone)})`);

  console.log(failures.length === 0 ? '[gift-smoke] PASS' : `[gift-smoke] FAIL (${failures.length})`);
  void a.leave(true).catch(() => {});
  await wait(200);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[gift-smoke] error', err);
  process.exit(1);
});
