import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import type { Action, PublicView } from '@belot/engine';
import { MSG, ROOM_NAME, type RoomMessage } from './protocol';

/**
 * End-to-end check of the things friends asked for after a real evening at a
 * private table, against a running server:
 *
 *  - the host picks the turn clock before the start, nobody else can, and only
 *    from the offered lengths;
 *  - a pause stops the table for everyone (no clock, no moves), anyone resumes;
 *  - a dropped friend is WAITED for - nobody plays their cards - and coming
 *    back carries on from exactly there; "play on" hands them to a bot instead;
 *  - the next deal waits for everyone's "ready", or starts by itself after the
 *    countdown - never on one player's press - and a pause holds the countdown;
 *  - while the host is off the line, the next player may start the table;
 *  - quick play is unchanged: no pausing, and a dropped stranger's cards are
 *    played by a bot at once;
 *  - and the bug that started it: a player who drops for more than a minute
 *    mid-match gets their own seat back instead of the lobby.
 *
 *   npm run start --workspace @belot/server        # in one terminal
 *   npx tsx apps/server/src/hold-smoke.ts          # in another (about two minutes)
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Seatside {
  room: Room;
  seat: number;
  view: PublicView | null;
  last: RoomMessage | null;
  errors: string[];
}

function wire(room: Room, side: Seatside): void {
  side.room = room;
  room.onMessage(MSG.view, (m: { seat: number; view: PublicView }) => {
    side.seat = m.seat;
    side.view = m.view;
  });
  room.onMessage(MSG.room, (m: RoomMessage) => {
    side.last = m;
  });
  room.onMessage(MSG.error, (m: { reason: string }) => side.errors.push(m.reason));
  room.onMessage(MSG.emote, () => {});
  room.onMessage(MSG.gift, () => {});
}

const side = (): Seatside => ({ room: null as unknown as Room, seat: -1, view: null, last: null, errors: [] });

/** Play this side's turn with its first legal action, if it is on turn. */
function playIfMine(s: Seatside): boolean {
  const v = s.view;
  if (!v || v.toAct !== s.seat || v.legalActions.length === 0) return false;
  const action = v.legalActions[0] as Action;
  s.room.send('action', { action });
  return true;
}

/** Drive the given sides until `done` says so, or give up after `ms`. */
async function drive(sides: Seatside[], done: () => boolean, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (done()) return true;
    for (const s of sides) playIfMine(s);
    await wait(120);
  }
  return done();
}

async function main(): Promise<void> {
  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    console.log(`[hold-smoke] ${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  const client = new Client(ENDPOINT);
  console.log(`[hold-smoke] ${ENDPOINT}`);

  // ---- the clock, chosen before the start -------------------------------------
  const A = side();
  const B = side();
  wire(await client.create(ROOM_NAME, { name: 'Domaćin', private: true, gifts: true }), A);
  wire(await client.joinById(A.room.roomId, { name: 'Gost', gifts: true }), B);
  await wait(500);
  check(A.last?.turnSeconds === 30, `a new private table starts on 30 s (${A.last?.turnSeconds})`);
  check(A.last?.private === true, 'the room says it is private');
  check(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(A.room.roomId), `its code is five readable capitals (${A.room.roomId})`);
  B.room.send('clock', { seconds: 90 });
  await wait(300);
  check(A.last?.turnSeconds === 30, 'a guest cannot choose the clock');
  A.room.send('clock', { seconds: 45 });
  await wait(300);
  check(A.last?.turnSeconds === 30, 'only the offered lengths are taken');
  A.room.send('clock', { seconds: 60 });
  await wait(300);
  check(A.last?.turnSeconds === 60 && B.last?.turnSeconds === 60, 'the host sets 60 s, and both see it');

  A.room.send('start', {});
  await wait(800);
  check(A.last?.status === 'playing', 'the host starts with bots');
  // Reach a human decision so a clock is running.
  await drive([], () => (A.last?.turnMsLeft ?? 0) > 0, 4000);
  check(A.last?.turnTotalMs === 60_000, `the running clock is the chosen one (${A.last?.turnTotalMs})`);

  // ---- pause ------------------------------------------------------------------
  B.room.send('pause', {});
  await wait(400);
  check(A.last?.hold?.paused?.by === B.seat, `a guest pauses, and the host sees who (${JSON.stringify(A.last?.hold)})`);
  check(A.last?.turnMsLeft === undefined, 'no turn clock runs while paused');
  const onTurn = [A, B].find((s) => s.view?.toAct === s.seat);
  if (onTurn) {
    const before = onTurn.errors.length;
    playIfMine(onTurn);
    await wait(400);
    check(onTurn.errors.slice(before).includes('paused'), 'a move while paused is refused');
  } else {
    console.log('[hold-smoke] note: neither human was on turn, so the refused move was not tried');
  }
  A.room.send('resume', {});
  await wait(400);
  check(A.last?.hold === undefined, 'anyone resumes, and the hold is gone');
  check((A.last?.turnMsLeft ?? 0) > 0, 'the clock runs again after the pause');

  // ---- a dropped friend is waited for -------------------------------------------
  const reachedB = await drive([A], () => B.view?.toAct === B.seat, 20_000);
  check(reachedB, 'play reaches the guest-s turn');
  const handBefore = B.view?.hand.length ?? -1;
  let token = B.room.reconnectionToken;
  await B.room.leave(false).catch(() => {});
  await wait(600);
  check(A.last?.hold?.waiting.some((w) => w.seat === B.seat) === true, `the table waits for the dropped guest (${JSON.stringify(A.last?.hold)})`);
  check((A.last?.hold?.waiting[0]?.msLeft ?? 0) > 9 * 60_000, 'for about ten minutes');
  await wait(3000);
  check(A.view?.toAct === B.seat && A.view?.handCounts[B.seat as 0] === handBefore, 'nobody played the dropped guest-s cards');
  wire(await client.reconnect(token), B);
  await wait(800);
  check(A.last?.hold === undefined, 'coming back ends the wait');
  check(B.view?.toAct === B.seat && (B.view?.hand.length ?? -1) === handBefore, 'and the guest carries on from exactly there, same cards');
  check(A.last?.seats[B.seat]?.bot === false, 'still a person, not a bot');

  // ---- or the others play on without them ----------------------------------------
  playIfMine(B);
  const reachedB2 = await drive([A], () => B.view?.toAct === B.seat, 20_000);
  check(reachedB2, 'play reaches the guest-s turn again');
  token = B.room.reconnectionToken;
  await B.room.leave(false).catch(() => {});
  await wait(600);
  A.room.send('playOn', {});
  await wait(1200);
  check(A.last?.hold === undefined, '"play on" ends the wait');
  check(A.last?.seats[B.seat]?.bot === true, 'a bot now holds the guest-s cards');
  check(A.view?.toAct !== B.seat, 'and it played for them');
  wire(await client.reconnect(token), B);
  await wait(800);
  check(A.last?.seats[B.seat]?.bot === false, 'the guest takes the seat back from the bot');

  // ---- away: a call that does NOT drop the connection ----
  B.room.send('away', {});
  await wait(400);
  check(A.last?.hold?.waiting.some((w) => w.seat === B.seat) === true, 'an app gone to the background is waited for, like a drop');
  B.room.send('back', {});
  await wait(400);
  check(A.last?.hold === undefined, '"back" carries on');
  B.room.send('away', {});
  await wait(300);
  B.room.send('emote', { id: 'smile' });
  await wait(400);
  check(A.last?.hold === undefined, 'any word from them means back, should "back" be lost');

  // ---- the next deal: everyone ready, or the countdown ----------------------------
  const scored = await drive([A, B], () => A.view?.phase === 'DEAL_OVER', 60_000);
  check(scored, 'the deal is played out');
  await wait(300);
  const left = A.last?.nextMsLeft ?? 0;
  // Ten seconds to read, plus three for the app to land the last trick.
  check(left > 11_000 && left <= 13_000, `a countdown of about thirteen seconds starts (${left})`);
  A.room.send('next', {});
  await wait(500);
  check(A.view?.phase === 'DEAL_OVER', 'one player-s press no longer deals for everyone');
  check(JSON.stringify(A.last?.nextVotes) === JSON.stringify([A.seat]), `the others see who is ready (${JSON.stringify(A.last?.nextVotes)})`);
  B.room.send('next', {});
  await wait(600);
  check(A.view?.phase !== 'DEAL_OVER', 'when everyone is ready it deals at once');

  const scored2 = await drive([A, B], () => A.view?.phase === 'DEAL_OVER', 60_000);
  check(scored2, 'the next deal is played out');
  // A pause holds the countdown.
  A.room.send('pause', {});
  await wait(11_000);
  check(A.view?.phase === 'DEAL_OVER' && A.last?.nextMsLeft === undefined, 'a pause holds the countdown');
  A.room.send('resume', {});
  const t0 = Date.now();
  const dealt = await drive([], () => A.view?.phase !== 'DEAL_OVER', 17_000);
  const took = Date.now() - t0;
  check(dealt && took > 11_000 && took < 16_000, `and after it, nobody pressing, the deal starts by itself (${took} ms)`);

  // ---- quick play is unchanged ------------------------------------------------------
  // One player: a public table refuses a second seat from the same address
  // (the anti-cheat rule), and one person is enough to show what matters.
  const P = side();
  wire(await client.create(ROOM_NAME, { name: 'Stranac', gifts: true }), P);
  await wait(500);
  check(P.last?.private === undefined, 'a quick-play table is not private');
  check(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/.test(P.room.roomId), `but its code is as readable (${P.room.roomId})`);
  P.room.send('clock', { seconds: 90 });
  await wait(300);
  check(P.last?.turnSeconds === 30, 'and its clock cannot be changed');
  P.room.send('start', {});
  await wait(800);
  P.room.send('pause', {});
  await wait(400);
  check(P.last?.hold === undefined, 'quick play cannot be paused');
  P.room.send('away', {});
  await wait(400);
  check(P.last?.hold === undefined, 'nor is anyone waited for there when their app goes to the background');
  const pToken = P.room.reconnectionToken;
  const pHand = P.view?.hand.length ?? -1;
  await P.room.leave(false).catch(() => {});

  // ---- the acting host ----------------------------------------------------------------
  const H = side();
  const G = side();
  wire(await client.create(ROOM_NAME, { name: 'Host', private: true, gifts: true }), H);
  wire(await client.joinById(H.room.roomId, { name: 'Friend', gifts: true }), G);
  await wait(500);
  await H.room.leave(false).catch(() => {});
  await wait(600);
  check(G.last?.hostSeat === G.seat, `with the host off the line, the next player may start (${G.last?.hostSeat})`);
  G.room.send('clock', { seconds: 90 });
  await wait(300);
  check(G.last?.turnSeconds === 90, 'and pick the clock');

  // ---- the bug itself: back after more than a minute -------------------------------
  console.log('[hold-smoke] the quick-play player has been away since before the host check; waiting past the old 60 s hold...');
  await wait(65_000);
  try {
    wire(await client.reconnect(pToken), P);
    await wait(900);
    check(P.view !== null && P.last?.status === 'playing', 'back after 65 s: at the table, not the lobby');
    check(P.last?.seats[P.seat]?.bot === false, 'in their own seat, as a person again');
    // Quick play does not wait: a bot played their cards meanwhile.
    check(P.view?.phase === 'DEAL_OVER' || (P.view?.hand.length ?? 99) < pHand, `a bot played for them while they were away (hand ${pHand} -> ${P.view?.hand.length}, ${P.view?.phase})`);
    if (P.view?.phase === 'DEAL_OVER') {
      check((P.last?.nextMsLeft ?? 0) > 0, 'and the scored deal counts down again now someone is back');
    }
  } catch (err) {
    check(false, `back after 65 s: the reconnect was refused (${(err as Error).message})`);
  }

  console.log(failures.length === 0 ? '[hold-smoke] PASS' : `[hold-smoke] FAIL (${failures.length})`);
  for (const s of [A, B, P, H, G]) void s.room?.leave(true).catch(() => {});
  await wait(300);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[hold-smoke] error', err);
  process.exit(1);
});
