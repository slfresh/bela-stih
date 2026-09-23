import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import { EMOTE_GAP_MS, MSG, ROOM_NAME, type EmoteMessage } from './protocol';

/**
 * End-to-end check of the emote relay against a running server.
 *
 * Two clients join one room. Client A spams: the server must let exactly one
 * emote through per rate-limit window, drop invalid ids outright, and relay
 * accepted ones to everybody (sender included). Client B answers once, so the
 * exchange is verified in both directions.
 *
 *   npm run start --workspace @belot/server        # in one terminal
 *   npx tsx src/emote-smoke.ts                     # in another
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`[emote-smoke] connecting two clients to ${ENDPOINT}`);
  const client = new Client(ENDPOINT);

  const a = await client.create(ROOM_NAME, { name: 'Spammer', private: true });
  const b = await client.joinById(a.roomId, { name: 'Partner' });
  const rooms: Room[] = [a, b];

  const seenByA: EmoteMessage[] = [];
  const seenByB: EmoteMessage[] = [];
  a.onMessage(MSG.emote, (m: EmoteMessage) => seenByA.push(m));
  b.onMessage(MSG.emote, (m: EmoteMessage) => seenByB.push(m));
  // Ignore the game traffic; this test is only about the emote channel.
  for (const r of rooms) {
    r.onMessage(MSG.view, () => {});
    r.onMessage(MSG.room, () => {});
    r.onMessage(MSG.error, () => {});
  }
  await wait(300);

  // A burst of five from A: the rate limit must let exactly ONE through.
  for (let i = 0; i < 5; i++) {
    a.send('emote', { id: 'laugh' });
    await wait(50);
  }
  // Garbage must be dropped silently, and must not count against anything.
  a.send('emote', { id: 'free text!!' });
  a.send('emote', { id: 42 });
  await wait(400);

  const afterBurst = seenByB.length;
  console.log(`[emote-smoke] burst of 5 + 2 invalid -> B received ${afterBurst}`);

  // After the window passes, the next one goes through again.
  await wait(EMOTE_GAP_MS);
  a.send('emote', { id: 'bravo' });
  // And B can answer.
  b.send('emote', { id: 'hvala' });
  await wait(400);
  // The phrases added in 1.4 go through like the old ones.
  await wait(EMOTE_GAP_MS);
  a.send('emote', { id: 'dobro' });
  b.send('emote', { id: 'idemo' });
  await wait(400);

  const ok =
    afterBurst === 1 &&
    seenByB.length === 5 &&
    seenByA.length === 5 &&
    seenByB[0]!.id === 'laugh' &&
    seenByB[1]!.id === 'bravo' &&
    seenByB[2]!.id === 'hvala' &&
    seenByB[3]!.id === 'dobro' &&
    seenByB[4]!.id === 'idemo' &&
    seenByA[2]!.seat !== seenByA[0]!.seat;

  console.log(`[emote-smoke] A saw: ${seenByA.map((m) => `${m.seat}:${m.id}`).join(' ')}`);
  console.log(`[emote-smoke] B saw: ${seenByB.map((m) => `${m.seat}:${m.id}`).join(' ')}`);
  console.log(
    ok
      ? '[emote-smoke] PASS — rate limit holds, invalid ids dropped, both directions relayed'
      : '[emote-smoke] FAIL',
  );

  for (const r of rooms) void r.leave(true).catch(() => {});
  await wait(200);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[emote-smoke] error', err);
  process.exit(1);
});
