import '../net/polyfills';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Client, type Room } from 'colyseus.js';
import type { ActionOf, AnyGame, EventOf, ViewOf } from '@belot/game-core';
import { SERVER_URL } from '../net/useNetGame';
import { normalizeCode } from '../net/code';
import { PROTO } from '../net/proto';
import { APP_VERSION } from '../screens/common';
import type { LocalSession } from './useLocalSession';

/**
 * One table of a game beyond Bela, online: the same shape `useLocalSession`
 * gives a table (a view, whose turn it is, the moves), fed by the shared
 * GameRoom instead of a session on the device — so a table component cannot
 * tell which one it is drawing. Plus what only an online table has: the
 * lobby (who has sat down, the code to share, starting with bots), and its
 * connection.
 *
 * Bela keeps its own client (net/useNetGame.ts), which speaks the room
 * message its shipped apps read; this one speaks GameRoomMessage.
 */

export type NetHow = { kind: 'quick' } | { kind: 'create'; seats: number } | { kind: 'join'; code: string };

export interface NetPlayer {
  seat: number;
  name: string;
  avatar: string;
  connected: boolean;
  bot: boolean;
}

interface RoomMsg {
  game: string;
  players: NetPlayer[];
  seatCount: number;
  status: 'waiting' | 'playing' | 'finished';
  events: unknown[];
  window?: { seats: number[]; msLeft: number; totalMs: number };
  hostSeat?: number;
  nextMsLeft?: number;
  rematchVotes?: number[];
}

export interface NetSession<D extends AnyGame> extends Omit<LocalSession<D>, 'view'> {
  view: ViewOf<D> | null;
  status: 'connecting' | 'waiting' | 'playing' | 'finished' | 'failed';
  /** The code friends type to sit at this table. */
  code: string | null;
  /** Which game this room plays, once it has said (a table joined by code learns it here). */
  game: string | null;
  mySeat: number | null;
  players: NetPlayer[];
  seatCount: number;
  isHost: boolean;
  /** Seconds left on the clock the table is waiting on, if one runs. */
  window: { seats: number[]; msLeft: number; totalMs: number } | null;
  /** Host, before the start: fill the empty seats with bots and begin. */
  start(): void;
  leave(): void;
  error: string | null;
}

export function useNetSession<D extends AnyGame>(
  roomName: string,
  how: NetHow,
  me: { name: string; avatar: string },
  onEvent?: (e: EventOf<D>, view: ViewOf<D>) => void,
): NetSession<D> {
  const roomRef = useRef<Room | null>(null);
  const [view, setView] = useState<ViewOf<D> | null>(null);
  const viewRef = useRef<ViewOf<D> | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [msg, setMsg] = useState<RoomMsg | null>(null);
  const [status, setStatus] = useState<NetSession<D>['status']>('connecting');
  const [error, setError] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let alive = true;
    const client = new Client(SERVER_URL);
    const options = { name: me.name, avatar: me.avatar, proto: PROTO, appVersion: APP_VERSION };
    const connect =
      how.kind === 'quick'
        ? client.joinOrCreate(roomName, options)
        : how.kind === 'create'
          ? client.create(roomName, { ...options, private: true, seats: how.seats })
          : client.joinById(normalizeCode(how.code), options);
    connect
      .then((room) => {
        if (!alive) {
          void room.leave(true);
          return;
        }
        roomRef.current = room;
        // Views first: a client must know its own seat before the event stream arrives.
        room.onMessage('view', (m: { seat: number; view: ViewOf<D> | null }) => {
          setSeat(m.seat);
          viewRef.current = m.view;
          setView(m.view);
        });
        room.onMessage('room', (m: RoomMsg) => {
          setMsg(m);
          setStatus(m.status);
          const v = viewRef.current;
          if (v) for (const e of m.events) onEventRef.current?.(e as EventOf<D>, v);
        });
        room.onMessage('error', (m: { reason?: string }) => setError(m.reason ?? 'error'));
        room.onMessage('*', () => {});
        room.onLeave(() => {
          if (alive) setStatus((s) => (s === 'finished' ? s : 'failed'));
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setStatus('failed');
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.leave(true);
    };
    // One connection per mount: the table is remounted to reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((type: string, payload: unknown = {}) => roomRef.current?.send(type, payload), []);
  const legal = (view as { legalActions?: unknown[] } | null)?.legalActions ?? [];
  const phase = (view as { phase?: string } | null)?.phase ?? '';
  const myTurn = status === 'playing' && legal.length > 0;
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
      if (!myTurn) return false;
      send('move', { action });
      return true;
    },
    // Online, the next round is a vote: it starts when everyone is ready, or on its own clock.
    nextRound: () => send('next'),
    newMatch: () => send('rematch'),
    status,
    code: roomRef.current?.roomId ?? null,
    game: msg?.game ?? null,
    mySeat: seat,
    players: msg?.players ?? [],
    seatCount: msg?.seatCount ?? 0,
    isHost: seat !== null && msg?.hostSeat === seat,
    window: msg?.window ?? null,
    start: () => send('start'),
    leave: () => {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.leave(true);
    },
    error,
  };
}
