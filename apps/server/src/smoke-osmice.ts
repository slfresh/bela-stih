import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import { makeDeck, type OsmiceAction, type OsmiceEvent, type OsmiceView } from '@belot/games-osmice';
import { MSG, ROOM_NAMES, type GameRoomMessage } from './protocol';

/**
 * Osmice over real websockets, against a running server (`npm run server`):
 * a private table of three, every client playing its first legal move, a whole
 * match to 200 with the next-round votes in between.
 *
 * The hidden-information check is adversarial by design, like Bela's smoke:
 * every client keeps ITS OWN set of cards it has been told are public (a card
 * played onto the pile, a round's first card), and every card id a client is
 * ever sent, in a view or anywhere else, must be in its own hand or in that
 * set. A drawn card is the drawer's secret: the stream says how many, never
 * which. A self-test first proves the check catches planted leaks.
 *
 *   npm run server                     # in one terminal
 *   npm run smoke:osmice -w @belot/server
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const SEATS = 3;
const ALL_IDS = new Set(makeDeck().map((c) => c.id));
const ID = /"((?:red|gold|green|blue)-(?:\d|skip|reverse|draw2)-\d|wild4?-\d)"/g;

/** Every card id named anywhere in a payload. */
function idsIn(payload: unknown): Set<string> {
  const out = new Set<string>();
  for (const m of JSON.stringify(payload).matchAll(ID)) if (ALL_IDS.has(m[1]!)) out.add(m[1]!);
  return out;
}

/** Cards an event stream makes public. */
function announced(events: OsmiceEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.kind === 'cardPlayed') out.add(e.card.id);
    if (e.kind === 'roundStarted') out.add(e.top.id);
  }
  return out;
}

/** The verdict on one payload: the ids in it that are neither mine nor public. */
function leaks(payload: unknown, myHand: Set<string>, publicIds: Set<string>): string[] {
  return [...idsIn(payload)].filter((id) => !myHand.has(id) && !publicIds.has(id));
}

function selfTest(): void {
  const mine = new Set(['red-5-0']);
  const pub = new Set(['blue-7-1']);
  const planted: unknown[] = [
    { hand: [{ id: 'red-5-0' }], peek: { id: 'gold-3-1' } },
    { events: [{ kind: 'drew', seat: 1, count: 1, card: { id: 'wild-2' } }] },
    { view: { drawn: { id: 'green-skip-0' } } },
    { deep: [[[{ x: 'wild4-3' }]]] },
  ];
  for (const p of planted) if (leaks(p, mine, pub).length === 0) throw new Error(`self-test: planted leak missed in ${JSON.stringify(p)}`);
  if (leaks({ hand: [{ id: 'red-5-0' }], top: { id: 'blue-7-1' } }, mine, pub).length !== 0) throw new Error('self-test: an honest payload was flagged');
  console.log(`[smoke-osmice] self-test: ${planted.length} planted leaks all caught, an honest view passed`);
}

interface Seated {
  room: Room;
  seat: number;
  view: OsmiceView | null;
  publicIds: Set<string>;
  lastRoom: GameRoomMessage | null;
  /**
   * Views not yet judged. The room sends each client its view FIRST and the
   * broadcast that announces the move right after, so a view is judged
   * against what was public once that next broadcast is in — no later.
   */
  pending: { msg: unknown; mine: Set<string> }[];
}

async function main(): Promise<void> {
  selfTest();
  const problems: string[] = [];
  let moves = 0;
  let rounds = 0;
  let matchOver = false;

  const seated: Seated[] = [];
  const act = (s: Seated) => {
    const v = s.view;
    if (!v || v.toAct !== s.seat || v.legalActions.length === 0) return;
    // A wild's first colour, a card before a draw: whatever is first is legal.
    const a: OsmiceAction = v.legalActions[0]!;
    s.room.send('move', { action: a });
    moves++;
  };

  const sit = (room: Room) => {
    const s: Seated = { room, seat: -1, view: null, publicIds: new Set(), lastRoom: null, pending: [] };
    seated.push(s);
    s.room.onMessage(MSG.view, (msg: { seat: number; view: OsmiceView | null }) => {
      s.seat = msg.seat;
      // Withheld in the lobby, until the table fills.
      if (msg.view === null) return;
      s.view = msg.view;
      // Mine: my hand (my drawn card is in it) is mine to see; nobody else's is.
      // The pile's top card lies face up for the whole table, so it is public as
      // shown — including the round's first card, turned up before the table filled.
      if (msg.view.top) s.publicIds.add(msg.view.top.id);
      s.pending.push({ msg, mine: new Set(msg.view.hand.map((c) => c.id)) });
      setTimeout(() => act(s), 5);
    });
    s.room.onMessage(MSG.room, (msg: GameRoomMessage) => {
      for (const id of announced(msg.events as OsmiceEvent[])) s.publicIds.add(id);
      for (const p of s.pending.splice(0)) {
        for (const id of leaks(p.msg, p.mine, s.publicIds)) problems.push(`seat ${s.seat} was sent ${id} in a view`);
      }
      const mine = new Set(s.view?.hand.map((c) => c.id) ?? []);
      for (const id of leaks(msg, mine, s.publicIds)) problems.push(`seat ${s.seat} was sent ${id} in a room message`);
      if (msg.game !== 'osmice' || msg.seatCount !== SEATS || msg.players.length !== SEATS) problems.push(`room message shape: ${JSON.stringify({ game: msg.game, seatCount: msg.seatCount, players: msg.players.length })}`);
      s.lastRoom = msg;
      for (const e of msg.events as OsmiceEvent[]) {
        if (e.kind === 'drew' && Object.keys(e).sort().join() !== 'count,kind,penalty,seat') problems.push(`a drew event says more than how many: ${JSON.stringify(e)}`);
        if (e.kind === 'roundOver' && s.seat === 0) rounds++;
        if (e.kind === 'matchOver') matchOver = true;
      }
      // Between rounds, everyone votes for the next one.
      if (s.view && (s.view.phase === 'ROUND_OVER') && msg.status === 'playing') s.room.send('next', {});
    });
    s.room.onMessage('*', () => {});
  };

  const clients = Array.from({ length: SEATS }, () => new Client(ENDPOINT));
  const host = await clients[0]!.create(ROOM_NAMES.osmice, { private: true, seats: SEATS, target: 200, name: 'A' });
  // Alone in the lobby, walk every free seat: no hand may be read before the table fills.
  const lobbyViews: unknown[] = [];
  host.onMessage(MSG.view, (msg: { view: unknown }) => lobbyViews.push(msg.view));
  host.onMessage(MSG.room, () => {});
  for (let target = 1; target < SEATS; target++) {
    await new Promise((r) => setTimeout(r, 300));
    host.send('sit', { seat: target });
  }
  await new Promise((r) => setTimeout(r, 400));
  if (lobbyViews.length < SEATS) problems.push(`the lobby walk saw ${lobbyViews.length} views, expected ${SEATS}`);
  for (const v of lobbyViews) if (v !== null) problems.push(`a lobby seat was sent a view before the table filled: ${JSON.stringify(v).slice(0, 80)}`);
  console.log(`[smoke-osmice] lobby walk: ${lobbyViews.length} seats visited, every view withheld`);
  host.removeAllListeners();
  sit(host);
  for (let i = 1; i < SEATS; i++) sit(await clients[i]!.joinById(host.roomId, { name: String.fromCharCode(65 + i) }));
  console.log(`[smoke-osmice] room ${host.roomId}: ${SEATS} clients`);

  const deadline = Date.now() + 120_000;
  while (!matchOver && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));

  const last = seated[0]!.lastRoom;
  for (const s of seated) await s.room.leave(true);

  if (!matchOver) problems.push('the match did not finish in time');
  if (last && last.series.reduce((a, b) => a + b, 0) !== 1) problems.push(`series after one match: ${JSON.stringify(last.series)}`);
  console.log(`[smoke-osmice] ${moves} moves, ${rounds} rounds, match over: ${matchOver}`);
  if (problems.length > 0) {
    for (const p of problems.slice(0, 20)) console.error(`[smoke-osmice] FAIL ${p}`);
    process.exit(1);
  }
  console.log('[smoke-osmice] PASS — a whole match over websockets, no client was sent a card it was not entitled to');
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke-osmice] crashed:', err);
  process.exit(1);
});
