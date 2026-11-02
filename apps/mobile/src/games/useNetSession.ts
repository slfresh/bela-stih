import '../net/polyfills';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Client, type Room } from 'colyseus.js';
import type { ActionOf, AnyGame, EventOf, ViewOf } from '@belot/game-core';
import { SERVER_URL } from '../net/useNetGame';
import { normalizeCode } from '../net/code';
import { PROTO } from '../net/proto';
import { SAME_NETWORK_CODE, troubleOf, type Trouble } from '../net/trouble';
import { APP_VERSION } from '../screens/common';
import type { LocalSession } from './useLocalSession';

/**
 * One table of a game beyond Bela, online: the same shape `useLocalSession`
 * gives a table (a view, whose turn it is, the moves), fed by the shared
 * GameRoom instead of a session on the device — so a table component cannot
 * tell which one it is drawing. Plus what only an online table has: the
 * lobby (who has sat down, the code to share, starting with bots), the
 * clocks and votes the room runs, a table standing still for a dropped
 * friend, and its connection — which it walks back into after a drop.
 *
 * Bela keeps its own client (net/useNetGame.ts), which speaks the room
 * message its shipped apps read; this one speaks GameRoomMessage.
 */

export type NetHow = { kind: 'quick' } | { kind: 'create'; seats: number } | { kind: 'join'; code: string };

/**
 * Why there is no table: the reasons net/trouble.ts reads off a refused join,
 * plus two ways of losing a seat this device had. 'dropped': the line went and
 * the seat could not be got back in time, but the table may still be there.
 * 'gone': the server said the table itself is gone (disposed, or closed under
 * us by a restart or a deploy), so going back to it by its code cannot work.
 */
export type NetTrouble = Trouble | 'dropped' | 'gone';

export interface NetPlayer {
  seat: number;
  name: string;
  avatar: string;
  connected: boolean;
  bot: boolean;
}

/** A table standing still, as the room says it (protocol.ts GameHoldInfo): time LEFT, never a moment. */
export interface NetHold {
  paused?: { by: number; msLeft: number };
  waiting: { seat: number; msLeft: number }[];
}

interface RoomMsg {
  game?: string;
  players: NetPlayer[];
  seatCount: number;
  status: 'waiting' | 'playing' | 'finished';
  events: unknown[];
  window?: { seats: number[]; msLeft: number; totalMs: number };
  hostSeat?: number;
  nextMsLeft?: number;
  nextVotes?: number[];
  rematchVotes?: number[];
  hold?: NetHold;
}

export interface NetSession<D extends AnyGame> extends Omit<LocalSession<D>, 'view'> {
  view: ViewOf<D> | null;
  status: 'connecting' | 'waiting' | 'playing' | 'finished' | 'failed';
  /** Why the status is 'failed'. */
  trouble: NetTrouble | null;
  /** The line dropped and this device is walking back into its seat; the table stays drawn meanwhile. */
  reconnecting: boolean;
  /** The code friends type to sit at this table. */
  code: string | null;
  /**
   * The table has been dealt (the room has said 'playing' at least once). It
   * locks then: after a drop the reconnection token is the only way back, and
   * the code no longer seats anybody, this device included.
   */
  started: boolean;
  /** Which game this room plays, once it has said (a table joined by code learns it here). */
  game: string | null;
  mySeat: number | null;
  players: NetPlayer[];
  seatCount: number;
  isHost: boolean;
  /**
   * When the last room message arrived, on this device's clock. Every time
   * below is time LEFT as of then: the server's clock and ours disagree, and
   * "12 s left" means the same on both.
   */
  receivedAt: number;
  /** The clock the table is waiting on, if one runs. */
  window: { seats: number[]; msLeft: number; totalMs: number } | null;
  /** Between rounds: how long until the next starts by itself, and who has said they are ready. */
  nextMsLeft: number | null;
  nextVotes: number[];
  /** After a match: who has asked for another. */
  rematchVotes: number[];
  /** The table standing still for a dropped friend (or a pause), if it is. */
  hold: NetHold | null;
  /** Host, before the start: fill the empty seats with bots and begin. */
  start(): void;
  /** Stop waiting for a dropped friend: a bot holds their cards until they are back. */
  playOn(): void;
  /** Carry on after a pause. */
  resume(): void;
  /** Host, after a match: begin the next one without waiting for every vote. */
  rematchStart(): void;
  leave(): void;
  error: string | null;
}

/** The server turned this app away for a code of another game's table (protocol.ts WRONG_GAME_CODE). */
const WRONG_GAME_CODE = 4302;
/** Colyseus: the room id is unknown or the room has been disposed (MATCHMAKE_INVALID_ROOM_ID). */
const ROOM_GONE_CODE = 4212;
/** Colyseus: the reconnection token has lapsed (MATCHMAKE_EXPIRED). */
const TOKEN_EXPIRED_CODE = 4214;
/** How long a 4214 still means "the server has not noticed the drop yet" (its ws pings: 3 s x 3). */
const TOKEN_GRACE_MS = 15_000;
/** A close the server chose (Colyseus CONSENTED): sent away, not dropped — "table full", say. */
const SENT_AWAY_CODE = 4000;
/**
 * How long the room holds a dropped seat (GameRoom's TABLE_RECONNECT_SECONDS
 * once the table has started, LOBBY_RECONNECT_SECONDS before): the retry loop
 * covers the window, because the room locks on start and the token is the
 * only way back in.
 */
const TABLE_HOLD_MS = 30 * 60_000;
const LOBBY_HOLD_MS = 60_000;

/** A refused join in the player's terms; a code for another game's table reads as "no such table" here. */
function netTroubleOf(err: unknown): NetTrouble {
  if ((err as { code?: unknown } | null)?.code === WRONG_GAME_CODE) return 'noSuchTable';
  return troubleOf(err);
}

export function useNetSession<D extends AnyGame>(
  roomName: string,
  how: NetHow,
  me: { name: string; avatar: string },
  /** The games this screen can seat its player at: a table of any other game turns the join away. */
  games: readonly string[],
  onEvent?: (e: EventOf<D>, view: ViewOf<D>) => void,
): NetSession<D> {
  const roomRef = useRef<Room | null>(null);
  const [view, setView] = useState<ViewOf<D> | null>(null);
  const viewRef = useRef<ViewOf<D> | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [msg, setMsg] = useState<RoomMsg | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [status, setStatus] = useState<NetSession<D>['status']>('connecting');
  const statusRef = useRef(status);
  statusRef.current = status;
  const [trouble, setTrouble] = useState<NetTrouble | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  // The way back into the seat after a drop; cleared the moment the player
  // leaves on purpose, which also stops a retry loop in flight.
  const tokenRef = useRef<string | null>(null);
  const reconnectRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    let retrying = false;
    const options = {
      name: me.name,
      avatar: me.avatar,
      proto: PROTO,
      appVersion: APP_VERSION,
      games: [...games],
    };

    const fail = (t: NetTrouble, err?: unknown) => {
      if (!alive) return;
      tokenRef.current = null;
      setReconnecting(false);
      setTrouble(t);
      setStatus('failed');
      if (err !== undefined) setError(err instanceof Error ? err.message : String(err));
    };

    const attach = (room: Room) => {
      roomRef.current = room;
      tokenRef.current = room.reconnectionToken;
      setCode(room.roomId);
      // Views first: a client must know its own seat before the event stream arrives.
      room.onMessage('view', (m: { seat: number; view: ViewOf<D> | null }) => {
        setSeat(m.seat);
        viewRef.current = m.view;
        setView(m.view);
      });
      room.onMessage('room', (m: RoomMsg) => {
        // A code reaches a table of any game. A server that seated us anyway
        // (one from before `games`) would leave us in a lobby with no chairs,
        // holding a real seat at somebody's Bela table: get up at once.
        if (typeof m.game !== 'string' || !games.includes(m.game)) {
          tokenRef.current = null;
          roomRef.current = null;
          void room.leave(true).catch(() => {});
          fail('noSuchTable');
          return;
        }
        setMsg(m);
        setReceivedAt(Date.now());
        setStatus(m.status);
        if (m.status !== 'waiting') setStarted(true);
        // The view came first (publish sends it ahead of this), so even the
        // first round's deal, which arrives with the message that starts the
        // table, has one to go with it.
        const v = viewRef.current;
        if (v) for (const e of m.events) onEventRef.current?.(e as EventOf<D>, v);
      });
      room.onMessage('error', (m: { reason?: string }) => setError(m.reason ?? 'error'));
      room.onMessage('*', () => {});
      room.onLeave((closeCode) => {
        if (roomRef.current !== room) return; // we left on purpose
        roomRef.current = null;
        if (!alive) return;
        // Sent away by the room itself: nothing to walk back into. Joining,
        // that is a full table turning the last joiner out; once seated, it is
        // the room closing on everybody (a server shutting down for a deploy
        // closes its rooms this way), so the table is gone.
        if (closeCode === SENT_AWAY_CODE) {
          if (statusRef.current === 'finished') tokenRef.current = null;
          else fail(statusRef.current === 'connecting' ? 'tableClosed' : 'gone');
          return;
        }
        // The line dropped: the room holds the seat (a bot, or the friends
        // waiting, plays it meanwhile), so spend that hold getting back in.
        reconnectRef.current();
      });
    };

    /**
     * Walk back in on the reconnection token, with backoff, inside the
     * room's hold. The table stays drawn under a "reconnecting" panel: taking
     * it down would stand a casino seat up and buy it in again on return.
     */
    const reconnect = async () => {
      const token = tokenRef.current;
      if (!token || retrying || !alive) return;
      retrying = true;
      setReconnecting(true);
      const startedAt = Date.now();
      const deadline = startedAt + (statusRef.current === 'waiting' || statusRef.current === 'connecting' ? LOBBY_HOLD_MS : TABLE_HOLD_MS);
      // Why the loop gave up: out of time, which leaves the table perhaps still
      // there, or told by the server that the table itself is gone.
      let why: NetTrouble = 'dropped';
      try {
        for (let wait = 0; Date.now() < deadline; wait = Math.min(5000, wait + 1000)) {
          // Jittered: a whole cafe's phones coming back on one router would
          // otherwise knock on the server in lockstep.
          if (wait > 0) await new Promise((r) => setTimeout(r, wait * (0.5 + Math.random())));
          if (!alive || tokenRef.current !== token) return;
          try {
            const room = await new Client(SERVER_URL).reconnect(token);
            // Left while this attempt was in flight: sitting back down now
            // would hold a seat nobody is behind.
            if (!alive || tokenRef.current !== token) {
              void room.leave(true).catch(() => {});
              return;
            }
            attach(room);
            setReconnecting(false);
            setError(null);
            return;
          } catch (err) {
            // The table is gone: no number of retries brings it back, and the
            // panel says so, rather than offer to go back to it by its code.
            // "Token expired" is also what Colyseus answers before the server
            // has noticed the old socket died, so early on it means "not yet";
            // later, only this seat has lapsed, and the table may be there.
            const c = (err as { code?: number } | null)?.code;
            if (c === ROOM_GONE_CODE) {
              why = 'gone';
              break;
            }
            if (c === TOKEN_EXPIRED_CODE && Date.now() - startedAt > TOKEN_GRACE_MS) break;
          }
        }
        if (alive && tokenRef.current === token) fail(why);
      } finally {
        retrying = false;
      }
    };
    reconnectRef.current = () => void reconnect();

    const client = new Client(SERVER_URL);
    const connect =
      how.kind === 'quick'
        ? client.joinOrCreate(roomName, options).catch((err: unknown) => {
            // The open table already has somebody from this network (a home
            // Wi-Fi, a whole carrier behind one address). The server seats us
            // apart rather than together: a fresh public table, which
            // strangers then join — as Bela's quick play does.
            if ((err as { code?: unknown } | null)?.code !== SAME_NETWORK_CODE) throw err;
            return client.create(roomName, options);
          })
        : how.kind === 'create'
          ? client.create(roomName, {
              ...options,
              private: true,
              seats: how.seats,
            })
          : client.joinById(normalizeCode(how.code), options);
    connect
      .then((room) => {
        if (!alive) {
          void room.leave(true).catch(() => {});
          return;
        }
        attach(room);
      })
      .catch((err: unknown) => fail(netTroubleOf(err), err));

    // A call that keeps the connection up still takes the player away: a
    // private table waits for them as for a drop (everywhere else the server
    // ignores 'away'). Back, and a line that died meanwhile is retried now
    // rather than after whatever the loop is sleeping.
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        roomRef.current?.send('away', {});
        return;
      }
      roomRef.current?.send('back', {});
      if (roomRef.current === null && tokenRef.current !== null && !retrying) void reconnect();
    });

    return () => {
      alive = false;
      sub.remove();
      // A departure, not a drop: the refs go first, or onLeave would read it
      // as one and start walking back in.
      tokenRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.leave(true).catch(() => {});
    };
    // One connection per mount: the table is remounted to try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((type: string, payload: unknown = {}) => roomRef.current?.send(type, payload), []);
  const legal = (view as { legalActions?: unknown[] } | null)?.legalActions ?? [];
  const phase = (view as { phase?: string } | null)?.phase ?? '';
  const hold = msg?.hold && (msg.hold.paused || msg.hold.waiting.length > 0) ? msg.hold : null;
  // A table standing still, or a line being got back, takes no moves: the room would refuse them.
  const myTurn = status === 'playing' && legal.length > 0 && hold === null && !reconnecting;
  const roundOver = /ROUND_OVER|HAND_OVER/.test(phase);
  const matchOver = phase === 'MATCH_OVER';

  return {
    view,
    myTurn,
    actor: myTurn ? seat : (msg?.window?.seats[0] ?? null),
    roundOver,
    matchOver,
    winners: null,
    submit: (action: ActionOf<D>) => {
      if (!myTurn || !roomRef.current) return false;
      send('move', { action });
      return true;
    },
    // Online, the next round is a vote: it starts when everyone is ready, or on its own clock.
    nextRound: () => send('next'),
    newMatch: () => send('rematch'),
    status,
    trouble,
    reconnecting,
    code,
    started,
    game: msg?.game ?? null,
    mySeat: seat,
    players: msg?.players ?? [],
    seatCount: msg?.seatCount ?? 0,
    isHost: seat !== null && msg?.hostSeat === seat,
    receivedAt,
    window: msg?.window ?? null,
    nextMsLeft: msg?.nextMsLeft ?? null,
    nextVotes: msg?.nextVotes ?? [],
    rematchVotes: msg?.rematchVotes ?? [],
    hold,
    start: () => send('start'),
    playOn: () => send('playOn'),
    resume: () => send('resume'),
    rematchStart: () => send('rematchStart'),
    leave: () => {
      tokenRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.leave(true).catch(() => {});
    },
    error,
  };
}
