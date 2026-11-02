import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import { BACCARAT, type BaccaratView } from '@belot/games-baccarat';
import type { BlackjackView } from '@belot/games-blackjack';
import type { HoldemView } from '@belot/games-holdem';
import { CARD52_ID } from '@belot/cards';
import { MSG, ROOM_NAMES, type GameId, type GameRoomMessage } from './protocol';

/**
 * The casino tables over real websockets, against a running server
 * (`npm run server`): Hold'em, Blackjack and Baccarat, three clients each,
 * a few rounds of simple play with the next-round votes between them.
 *
 * Every view each client is sent is checked against the game's privacy rule:
 * no other seat's hole cards before a showdown at Hold'em, no dealer's
 * face-down card while hands are being played at Blackjack, and no card at
 * Baccarat but those of the coup already dealt.
 *
 * Baccarat also proves the clock on a betting window: one seat never answers
 * the first coup and another answers late, and the window must still close
 * for everyone about one clock (Baccarat's own windowMs) after it opened —
 * answering early or late never restarts it.
 *
 *   npm run server
 *   npm run smoke:casino -w @belot/server
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';
const SEATS = 3;
const ROUNDS = 3;
const problems: string[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** When the late seat answers the first coup: well inside the window, late enough that a restart would show. */
const LATE_MS = 12_000;

function idsIn(x: unknown): string[] {
  return [...JSON.stringify(x).matchAll(CARD52_ID)].map((m) => m[1]!);
}

const PRIVACY: Record<string, (view: any) => string | null> = {
  holdem(v: HoldemView) {
    const over = v.phase === 'HAND_OVER' || v.phase === 'MATCH_OVER';
    const shown = new Set(over ? (v.lastResult?.shown.map((x) => x.seat) ?? []) : []);
    for (let s = 0; s < v.seats; s++) {
      if (s !== v.seat && v.players[s]!.hole.length > 0 && !shown.has(s)) return `seat ${v.seat} sees seat ${s}'s hole cards`;
    }
    return null;
  },
  blackjack(v: BlackjackView) {
    if (v.phase === 'PLAYING' && v.dealer.length === 2 && v.dealer[1] !== null) return `seat ${v.seat} sees the dealer's face-down card`;
    return null;
  },
  baccarat(v: BaccaratView) {
    const dealt = new Set([...(v.lastCoup?.player ?? []), ...(v.lastCoup?.banker ?? [])].map((c) => c.id));
    const stray = idsIn(v).filter((id) => !dealt.has(id));
    return stray.length > 0 ? `seat ${v.seat} was sent ${stray[0]} from the shoe` : null;
  },
};

/** One simple move from the legal ones: bet a little and say no more bets, check or call, stand. */
function choose(game: GameId, view: any): unknown | null {
  const legal: { type: string; amount?: number; spot?: string }[] = view.legalActions;
  if (legal.length === 0) return null;
  const find = (type: string, f?: (a: any) => boolean) => legal.find((a) => a.type === type && (!f || f(a)));
  if (game === 'baccarat') {
    const placed = view.bets[view.seat].player + view.bets[view.seat].banker + view.bets[view.seat].tie;
    return placed === 0 ? (find('BET', (a) => a.spot === 'banker' && a.amount === 25) ?? find('READY')) : find('READY');
  }
  if (game === 'blackjack') {
    if (view.phase === 'BETTING') return view.bets[view.seat] === 0 ? (find('BET', (a) => a.amount === 25) ?? find('READY')) : find('READY');
    return find('STAND');
  }
  return find('CHECK') ?? find('CALL') ?? find('FOLD');
}

async function play(game: GameId, opts: { sleepy?: boolean } = {}): Promise<void> {
  const clients = Array.from({ length: SEATS }, () => new Client(ENDPOINT));
  const rooms: Room[] = [];
  let rounds = 0;
  let firstWindow: { opened: number; closed: number | null } | null = null;
  const seatOf = new Map<Room, number>();

  const sit = (room: Room, index: number) => {
    rooms.push(room);
    let lastSent = '';
    room.onMessage(MSG.view, (msg: { seat: number; view: any }) => {
      seatOf.set(room, msg.seat);
      if (msg.view === null) return; // the lobby, withheld
      const v = msg.view;
      // The first coup was dealt when the room opened, so its window opens with the first view of the full table.
      if (game === 'baccarat' && index === 0 && !firstWindow && v.phase === 'BETTING' && v.coupNumber === 1) {
        firstWindow = { opened: Date.now(), closed: null };
      }
      const verdict = PRIVACY[game]!(v);
      if (verdict) problems.push(`${game}: ${verdict}`);
      const a = choose(game, v);
      if (!a) return;
      // One answer per decision: two decisions can offer the same moves (check on the flop, check
      // on the turn), so the decision is the whole view, which changes with every move.
      const key = JSON.stringify(v);
      if (key === lastSent) return;
      lastSent = key;
      // The clock test: in the first coup, the third seat sleeps and the second answers late.
      const firstCoup = game === 'baccarat' && v.coupNumber === 1;
      if (opts.sleepy && firstCoup && index === 2) return;
      const delay = opts.sleepy && firstCoup && index === 1 ? LATE_MS : 20;
      setTimeout(() => room.send('move', { action: a }), delay);
    });
    room.onMessage(MSG.room, (msg: GameRoomMessage) => {
      if (msg.game !== game || msg.seatCount !== SEATS) problems.push(`${game}: room message shape ${msg.game}/${msg.seatCount}`);
      for (const e of msg.events as { kind: string }[]) {
        if (index !== 0) continue;
        if (e.kind === 'dealt' && firstWindow && firstWindow.closed === null && game === 'baccarat') firstWindow.closed = Date.now();
        if (e.kind === 'coupResolved' || e.kind === 'dealerDone' || e.kind === 'potWon') rounds++;
      }
      if (msg.status === 'playing' && msg.nextMsLeft !== undefined) room.send('next', {});
    });
    room.onMessage('*', () => {});
  };

  // The 'More games' app names the games it plays (JoinGame `games`); a casino table refuses one that does not.
  const games: GameId[] = ['osmice', 'baccarat', 'blackjack', 'holdem'];
  const host = await clients[0]!.create(ROOM_NAMES[game], { private: true, seats: SEATS, name: 'A', games });
  sit(host, 0);
  for (let i = 1; i < SEATS; i++) sit(await clients[i]!.joinById(host.roomId, { name: String.fromCharCode(65 + i), games }), i);

  const deadline = Date.now() + 90_000;
  while (rounds < ROUNDS && Date.now() < deadline) await wait(100);
  for (const r of rooms) await r.leave(true);

  if (rounds < ROUNDS) problems.push(`${game}: only ${rounds} rounds in time`);
  if (opts.sleepy) {
    const w = firstWindow as { opened: number; closed: number | null } | null;
    const took = w && w.closed !== null ? w.closed - w.opened : null;
    // The clock is Baccarat's own window (meta.windowMs, 20 s). Restarted by the late answer at 12 s it
    // would close near 32 s, so anything past the window plus a little slack fails.
    const windowMs = BACCARAT.meta.windowMs;
    if (took === null || took < windowMs - 2_000 || took > windowMs + 5_000) {
      problems.push(`baccarat: the first window closed after ${took} ms, expected about ${windowMs / 1000} s`);
    }
    else console.log(`[smoke-casino] baccarat: a seat that never answered was closed out after ${(took / 1000).toFixed(1)} s; a late answer did not restart the clock`);
  }
  console.log(`[smoke-casino] ${game}: ${rounds} rounds over websockets`);
}

async function main(): Promise<void> {
  await play('holdem');
  await play('blackjack');
  await play('baccarat', { sleepy: true });
  if (problems.length > 0) {
    for (const p of [...new Set(problems)].slice(0, 20)) console.error(`[smoke-casino] FAIL ${p}`);
    process.exit(1);
  }
  console.log('[smoke-casino] PASS — every view kept its secrets, and the betting window closed on its clock');
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke-casino] crashed:', err);
  process.exit(1);
});
