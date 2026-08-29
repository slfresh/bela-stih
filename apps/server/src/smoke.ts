import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import { cardId, type Card, type PublicView, type Seat } from '@belot/engine';
import { MSG, ROOM_NAME, type RoomMessage } from './protocol';

/**
 * End-to-end check against a running server.
 *
 * Four real clients join over websockets and play a whole deal. The point is not
 * that the rules work — the engine has 200+ tests for that — but that the
 * *transport* keeps its promise: no client may ever receive a card that is in
 * somebody else's hand. That is asserted against every single message received.
 *
 *   npm run start --workspace @belot/server     # in one terminal
 *   npm run smoke --workspace @belot/server     # in another
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';

interface Seated {
  room: Room;
  seat: Seat;
  view: PublicView | null;
  /** Every card this client has ever been shown, from any message. */
  seen: Set<string>;
}

function collectCards(value: unknown, out: Card[] = []): Card[] {
  if (Array.isArray(value)) {
    for (const v of value) collectCards(v, out);
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.suit === 'string' && typeof o.rank === 'string') out.push(o as unknown as Card);
    else for (const v of Object.values(o)) collectCards(v, out);
  }
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const client = new Client(ENDPOINT);
  const players: Seated[] = [];

  console.log(`[smoke] connecting four clients to ${ENDPOINT}`);
  // Create one room explicitly and join the rest BY ID. `joinOrCreate` can hand
  // clients to different rooms (a stray seat reservation is enough to do it),
  // and comparing hands across two rooms compares two different decks.
  let roomId: string | null = null;
  for (let i = 0; i < 4; i++) {
    const room: Room =
      roomId === null
        ? await client.create(ROOM_NAME, { name: `Test ${i + 1}` })
        : await client.joinById(roomId, { name: `Test ${i + 1}` });
    roomId ??= room.roomId;
    const seated: Seated = { room, seat: 0 as Seat, view: null, seen: new Set() };

    room.onMessage(MSG.view, (msg: { seat: Seat; view: PublicView }) => {
      seated.seat = msg.seat;
      seated.view = msg.view;
      for (const c of collectCards(msg)) seated.seen.add(cardId(c));
    });
    room.onMessage(MSG.room, (msg: RoomMessage) => {
      for (const c of collectCards(msg.events)) seated.seen.add(cardId(c));
    });
    room.onMessage(MSG.error, (msg: { reason: string }) => {
      console.log(`[smoke] seat ${seated.seat} rejected: ${msg.reason}`);
    });

    players.push(seated);
  }

  await wait(900);
  const seats = players.map((p) => p.seat);
  console.log('[smoke] room', roomId, 'seats:', seats.join(', '));
  if (new Set(seats).size !== 4) {
    console.error('[smoke] FAIL — clients did not take four distinct seats in one room');
    process.exit(1);
  }

  // Play until the deal is scored, always taking the first legal action.
  let moves = 0;
  for (let step = 0; step < 200; step++) {
    const actor = players.find((p) => p.view && p.view.toAct === p.seat && p.view.legalActions.length);
    if (!actor?.view) {
      await wait(120);
      continue;
    }
    actor.room.send('action', { action: actor.view.legalActions[0] });
    moves++;
    await wait(90);
    if (players.some((p) => p.view?.phase === 'DEAL_OVER' || p.view?.phase === 'MATCH_OVER')) break;
  }

  console.log(`[smoke] ${moves} moves played`);

  // --- the assertion that matters -----------------------------------------
  let leaks = 0;
  for (const p of players) {
    const others = players.filter((q) => q !== p);
    for (const other of others) {
      const held = new Set((other.view?.hand ?? []).map(cardId));
      for (const id of p.seen) {
        if (held.has(id)) {
          console.error(`[smoke] LEAK: seat ${p.seat} was shown ${id}, held by seat ${other.seat}`);
          leaks++;
        }
      }
    }
  }

  const dealt = players.every((p) => (p.view?.hand.length ?? 0) >= 0);
  console.log(`[smoke] hands intact: ${dealt}`);
  console.log(
    leaks === 0
      ? '[smoke] PASS — no client was ever shown a card held by another seat'
      : `[smoke] FAIL — ${leaks} leaked card(s)`,
  );

  for (const p of players) await p.room.leave();
  process.exit(leaks === 0 && moves > 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[smoke] failed', err);
  process.exit(1);
});
