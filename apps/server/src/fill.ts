import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import type { PublicView, Seat } from '@belot/engine';
import { MSG, ROOM_NAME } from './protocol';

/**
 * Fills the spare seats at a table with headless players, so one real device can
 * be tested against a full table without three more phones.
 *
 * They play the first legal action after a short pause — good enough to exercise
 * the room, and slow enough to watch on screen.
 *
 *   npm run fill --workspace @belot/server            # 3 seats, quick-play
 *   npm run fill --workspace @belot/server -- <roomId> [count]
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const args = process.argv.slice(2);
const roomId = args[0] && !/^\d+$/.test(args[0]) ? args[0] : null;
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const THINK_MS = 800;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function seatOne(client: Client, index: number): Promise<void> {
  // Wear a preset face so the avatar echo path gets exercised end to end.
  const AVATARS = ['baka', 'sofer', 'profesorica', 'gazda'];
  const opts = { name: `Bot ${index + 1}`, avatar: AVATARS[index % AVATARS.length] };
  const room: Room = roomId
    ? await client.joinById(roomId, opts)
    // Private: several bots from one machine are the same shape as a cheat, and
    // the public matchmaker now seats those apart on purpose.
    : await client.create(ROOM_NAME, { ...opts, private: true });

  let mySeat: Seat | null = null;

  room.onMessage(MSG.view, (msg: { seat: Seat; view: PublicView }) => {
    mySeat = msg.seat;
    const view = msg.view;
    if (view.toAct !== msg.seat || view.legalActions.length === 0) return;
    // Deliberately naive: the point is to keep the table moving, not to play well.
    void wait(THINK_MS).then(() => {
      room.send('action', { action: view.legalActions[0] });
      // The occasional emote, so a device test sees incoming bubbles.
      if (Math.random() < 0.15) {
        const EMOTES = ['smile', 'laugh', 'clap', 'wow', 'bravo', 'hvala'];
        void wait(600).then(() =>
          room.send('emote', { id: EMOTES[Math.floor(Math.random() * EMOTES.length)] }),
        );
      }
    });
  });

  room.onMessage(MSG.room, (msg: { status: string }) => {
    if (msg.status === 'finished') console.log(`[fill] seat ${mySeat}: match over`);
  });

  // Registering this keeps colyseus.js from warning on every refused action.
  room.onMessage(MSG.error, (msg: { reason: string }) => {
    console.log(`[fill] seat ${mySeat} refused: ${msg.reason}`);
  });

  room.onLeave((code) => console.log(`[fill] seat ${mySeat} left (${code})`));
  console.log(`[fill] joined ${room.roomId} as ${room.sessionId}`);
}

async function main(): Promise<void> {
  console.log(`[fill] ${count} filler(s) -> ${ENDPOINT}${roomId ? ` room ${roomId}` : ''}`);
  const client = new Client(ENDPOINT);
  for (let i = 0; i < count; i++) {
    await seatOne(client, i);
    await wait(250);
  }
  console.log('[fill] seated; ctrl-c to stop');
  // Hold the process open so the sockets stay connected.
  setInterval(() => {}, 1 << 30);
}

main().catch((err: unknown) => {
  console.error('[fill] failed', err);
  process.exit(1);
});
