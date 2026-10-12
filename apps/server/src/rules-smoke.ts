import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import type { Action, PublicView } from '@belot/engine';
import { MSG, ROOM_NAME, ROOM_NAME_MODES, type RoomMessage } from './protocol';

/**
 * End-to-end check of a private table's rules, against a running server:
 *
 *  - the host picks the match length (501 / 701 / 1001) and the version
 *    (Učenje / Lagana / Prava bela) in the lobby; nobody else can, only what is
 *    offered is taken, an older app's `hard` switch still works, and quick play
 *    keeps 1001 and Lagana whatever anyone sends;
 *  - the choice is what the game is played to: a 501 match ends at the first
 *    deal a team passes 501 (not at 1001), and a rematch keeps it;
 *  - after the start nothing changes it.
 *
 *   npm run start --workspace @belot/server        # in one terminal
 *   npx tsx apps/server/src/rules-smoke.ts         # in another (under a minute)
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Seatside {
  room: Room;
  seat: number;
  view: PublicView | null;
  last: RoomMessage | null;
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
  room.onMessage(MSG.error, () => {});
  room.onMessage(MSG.emote, () => {});
  room.onMessage(MSG.gift, () => {});
}

const side = (): Seatside => ({ room: null as unknown as Room, seat: -1, view: null, last: null });

function playIfMine(s: Seatside): void {
  const v = s.view;
  if (!v || v.toAct !== s.seat || v.legalActions.length === 0) return;
  s.room.send('action', { action: v.legalActions[0] as Action });
}

/**
 * Play the match out: every human side plays its first legal move and says
 * "ready" at each scored deal. Returns the scores at every scored deal.
 */
async function playMatch(sides: Seatside[], ms: number): Promise<{ over: boolean; totals: [number, number][] }> {
  const totals: [number, number][] = [];
  let seenDeal = -1;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = sides[0]!.view;
    if (v && (v.phase === 'DEAL_OVER' || v.phase === 'MATCH_OVER')) {
      const key = v.matchScores[0] * 10000 + v.matchScores[1];
      if (key !== seenDeal) {
        seenDeal = key;
        totals.push([v.matchScores[0], v.matchScores[1]]);
      }
      if (v.phase === 'MATCH_OVER') return { over: true, totals };
      for (const s of sides) s.room.send('next', {});
    }
    for (const s of sides) playIfMine(s);
    await wait(60);
  }
  return { over: false, totals };
}

async function main(): Promise<void> {
  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    console.log(`[rules-smoke] ${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  const client = new Client(ENDPOINT);
  console.log(`[rules-smoke] ${ENDPOINT}`);

  // ---- the lobby ----
  const host = side();
  wire(await client.create(ROOM_NAME_MODES, { name: 'Domacin', private: true }), host);
  await wait(500);
  check(host.last?.target === 1001, `a new private table plays to 1001 (${host.last?.target})`);
  check(host.last?.mode === 'easy', `and is Lagana unless asked (${host.last?.mode})`);
  check(host.last?.hard === true, 'which older apps are told as blind zvanja');

  const guest = side();
  wire(await client.joinById(host.room.roomId, { name: 'Gost' }), guest);
  await wait(500);

  guest.room.send('rules', { target: 501, mode: 'hard' });
  await wait(400);
  check(host.last?.target === 1001 && host.last?.mode === 'easy', 'a guest cannot change the rules');

  host.room.send('rules', { target: 777 });
  await wait(400);
  check(host.last?.target === 1001, 'only the offered lengths are taken');

  host.room.send('rules', { target: 501, mode: 'hard' });
  await wait(400);
  check(guest.last?.target === 501 && guest.last?.mode === 'hard', 'the host sets 501 and Prava bela, and the guest sees both');

  host.room.send('rules', { mode: 'learn' });
  await wait(400);
  check(guest.last?.target === 501 && guest.last?.mode === 'learn' && guest.last?.hard !== true, 'one rule at a time: Učenje, 501 kept, no blind zvanja for older apps');

  host.room.send('rules', { mode: 'nonsense' });
  await wait(400);
  check(guest.last?.mode === 'learn', 'only the offered versions are taken');

  // An app from before the three versions: its switch still works.
  host.room.send('rules', { hard: true });
  await wait(400);
  check(guest.last?.mode === 'hard' && guest.last?.hard === true, 'an older host\'s `hard: true` is Prava bela');
  host.room.send('rules', { hard: false });
  await wait(400);
  check(guest.last?.mode === 'learn' && guest.last?.hard !== true, 'and `hard: false` the rules it always meant (zvanja announced)');
  host.room.send('rules', { mode: 'easy' });
  await wait(400);
  check(guest.last?.mode === 'easy', 'Lagana again');
  check((guest.view?.hand.length ?? 0) === 0, 'the lobby still shows nobody a card');

  // ---- the double win: the full game's rule only ----
  check(guest.last?.doubleWin !== true, 'a new table has no double win');
  host.room.send('rules', { doubleWin: true });
  await wait(400);
  check(guest.last?.doubleWin !== true, 'at 501 the double win is not taken');
  host.room.send('rules', { target: 1001 });
  await wait(400);
  host.room.send('rules', { doubleWin: true });
  await wait(400);
  check(guest.last?.target === 1001 && guest.last?.doubleWin === true, 'at 1001 the host switches it on and the guest sees it');
  guest.room.send('rules', { doubleWin: false });
  await wait(400);
  check(guest.last?.doubleWin === true, 'a guest cannot switch it off');
  host.room.send('rules', { target: 501 });
  await wait(400);
  check(guest.last?.target === 501 && guest.last?.doubleWin !== true, 'a shorter match drops it');
  const dbl = side();
  wire(await client.create(ROOM_NAME_MODES, { name: 'Dupli', private: true, doubleWin: true }), dbl);
  await wait(500);
  check(dbl.last?.doubleWin === true, 'a table created with it starts with it');
  await dbl.room.leave(true);

  // ---- the strength of the bots that fill a seat ----
  check(guest.last?.botLevel === 'medium', `a new table's bots are of middle strength (${guest.last?.botLevel})`);
  guest.room.send('rules', { botLevel: 'hard' });
  await wait(400);
  check(guest.last?.botLevel === 'medium', 'a guest cannot change it');
  host.room.send('rules', { botLevel: 'hard' });
  await wait(400);
  check(guest.last?.botLevel === 'hard', 'the host picks strong bots and the guest sees it');
  host.room.send('rules', { botLevel: 'brutal' });
  await wait(400);
  check(guest.last?.botLevel === 'hard', 'only the three strengths are taken');
  host.room.send('rules', { botLevel: 'easy' });
  await wait(400);
  check(guest.last?.botLevel === 'easy', 'and easy');
  const strong = side();
  wire(await client.create(ROOM_NAME_MODES, { name: 'Jaki', private: true, botLevel: 'hard' }), strong);
  await wait(500);
  check(strong.last?.botLevel === 'hard', 'a table created with strong bots starts with them');
  await strong.room.leave(true);

  // ---- quick play keeps the full game ----
  const stranger = side();
  wire(await client.joinOrCreate(ROOM_NAME_MODES, { name: 'Stranac' }), stranger);
  await wait(500);
  check(stranger.last?.mode === 'easy', `quick play is Lagana (${stranger.last?.mode})`);
  stranger.room.send('rules', { target: 501, mode: 'hard', botLevel: 'hard', doubleWin: true });
  await wait(400);
  check(stranger.last?.target === 1001 && stranger.last?.mode === 'easy', 'and stays 1001 and Lagana whatever anyone sends');
  check(stranger.last?.botLevel === 'medium' && stranger.last?.doubleWin !== true, 'with middle bots and no double win');

  // ---- an app from before the three versions ----
  // Its quick play is what it always was (zvanja announced), and never at a
  // Lagana table it would read as Prava bela.
  const old = side();
  wire(await client.joinOrCreate(ROOM_NAME, { name: 'Stari' }), old);
  await wait(500);
  check(old.last?.mode === 'learn' && old.last?.hard !== true, `an older app's quick play keeps zvanja announced (${old.last?.mode}, hard ${old.last?.hard})`);
  check(old.room.roomId !== stranger.room.roomId, 'and is not the newer apps\' table, free seats and all');
  const oldHost = side();
  wire(await client.create(ROOM_NAME, { name: 'StariDomacin', private: true, hard: false }), oldHost);
  await wait(500);
  check(oldHost.last?.mode === 'learn' && oldHost.last?.hard !== true, `an older host's table with hard: false is what it always was (${oldHost.last?.mode})`);
  const oldHard = side();
  wire(await client.create(ROOM_NAME, { name: 'StariTvrdi', private: true, hard: true }), oldHard);
  await wait(500);
  check(oldHard.last?.mode === 'hard' && oldHard.last?.hard === true, `and with hard: true, Prava bela (${oldHard.last?.mode})`);
  // A code reaches a table under either name.
  const across = side();
  wire(await client.joinById(oldHost.room.roomId, { name: 'Novi' }), across);
  await wait(500);
  check(across.last?.mode === 'learn', 'a newer app joins an older host\'s table by its code');
  for (const s of [stranger, old, oldHost, oldHard, across]) await s.room.leave(true);

  // ---- the game is played to what was chosen ----
  host.room.send('start', {});
  await wait(800);
  check(host.last?.status === 'playing', 'the host starts with bots');
  host.room.send('rules', { target: 1001 });
  await wait(400);
  check(host.last?.target === 501, 'after the start the length cannot change');

  const first = await playMatch([host, guest], 90_000);
  const last = first.totals.at(-1);
  console.log(`[rules-smoke] first match, by deal: ${first.totals.map((t) => t.join(':')).join('  ')}`);
  check(first.over, 'the first match ends');
  check(!!last && Math.max(...last) >= 501 && Math.max(...last) < 1001, `...at 501, not 1001 (${last?.join(':')})`);
  const early = first.totals.slice(0, -1).find((t) => Math.max(...t) >= 501 && t[0] !== t[1]);
  check(early === undefined, 'and at the first deal a team passed it');

  host.room.send('rematchStart', {});
  await wait(800);
  check(host.last?.status === 'playing' && host.last?.target === 501, 'a rematch keeps 501');
  const second = await playMatch([host, guest], 90_000);
  const last2 = second.totals.at(-1);
  console.log(`[rules-smoke] rematch, by deal: ${second.totals.map((t) => t.join(':')).join('  ')}`);
  check(second.over && !!last2 && Math.max(...last2) >= 501 && Math.max(...last2) < 1001, `the rematch ends at 501 too (${last2?.join(':')})`);

  await guest.room.leave(true);
  await host.room.leave(true);
  if (failures.length > 0) {
    console.log(`[rules-smoke] FAIL (${failures.length})`);
    process.exit(1);
  }
  console.log('[rules-smoke] PASS');
  process.exit(0);
}

main().catch((err) => {
  console.error('[rules-smoke] crashed:', err);
  process.exit(1);
});
