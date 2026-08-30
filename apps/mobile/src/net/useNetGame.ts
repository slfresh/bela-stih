import './polyfills';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Client, type Room } from 'colyseus.js';
import type { Action, DealScoreResult, PublicView, Seat, TeamId } from '@belot/engine';
import { teamOf } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import { Lang } from '@belot/i18n';
import type { Award, PlayerProfile } from '@belot/progression';
import { AnchorMap } from '../anim/AnchorRegistry';
import { Director } from '../anim/director';
import { FxBus } from '../anim/FxBus';
import { makeFxSpawner, spawnEmote } from '../table/fx';
import { playSfx } from '../audio';
import { emptyTally, processEvents } from '../feedback';
import { loadProfile, saveProfile, type Settings } from '../storage';

/**
 * A table driven by the server, presented through the same animation director
 * as the offline game.
 *
 * The server sends this seat its own `PublicView` FIRST, then broadcasts the
 * event batch — so by the time events arrive, the batch's authoritative final
 * view is already stashed. The director paces the events and hard-syncs to
 * that view, exactly as offline; `TableScreen` cannot tell the modes apart.
 *
 * Nothing about the rules lives here: the client renders what the server says
 * is legal and sends back a chosen action. Anything stale is refused
 * server-side and surfaced, never thrown.
 */

export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'ws://localhost:2567';
const ROOM_NAME = 'bela';

export type NetStatus =
  | 'idle'
  | 'connecting'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'disconnected'
  | 'error';

export interface SeatInfo {
  seat: Seat;
  name: string;
  avatar: string;
  connected: boolean;
  bot: boolean;
}

interface RoomMessage {
  seats: SeatInfo[];
  status: 'waiting' | 'playing' | 'finished';
  events: TableEvent[];
  turnMsLeft?: number;
  turnTotalMs?: number;
  /** True on "prava bela" tables. */
  hard?: boolean;
}

export function useNetGame(settings: Settings) {
  const roomRef = useRef<Room | null>(null);
  const directorRef = useRef<Director | null>(null);
  const authViewRef = useRef<PublicView | null>(null);
  const mySeatRef = useRef<Seat | null>(null);
  const profileRef = useRef<PlayerProfile>(loadProfile());
  const tally = useRef(emptyTally());

  const [status, setStatus] = useState<NetStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [view, setView] = useState<PublicView | null>(null);
  const [idle, setIdle] = useState(true);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [hard, setHard] = useState(false);
  const [banner, setBanner] = useState<Award | null>(null);
  const [lastDealResult, setLastDealResult] = useState<DealScoreResult | null>(null);
  const [winnerTeam, setWinnerTeam] = useState<TeamId | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [turnTotalMs, setTurnTotalMs] = useState(30_000);

  const anchors = useMemo(() => new AnchorMap(), []);
  const fxBus = useMemo(() => new FxBus(), []);
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  const spawn = useMemo(() => makeFxSpawner({ anchors, bus: fxBus, lang }), [anchors, fxBus, lang]);

  const hapticsRef = useRef(settings.haptics);
  hapticsRef.current = settings.haptics;
  // The socket callbacks are created once; a ref keeps their locale current.
  const langRef = useRef(lang);
  langRef.current = lang;

  const onEvent = useCallback(
    (e: TableEvent, flushed: boolean) => {
      const mine = mySeatRef.current;
      if (mine === null) return;
      const r = processEvents({
        events: [e],
        profile: profileRef.current,
        tally: tally.current,
        mySeat: mine,
        haptics: hapticsRef.current,
        silent: flushed,
      });
      if (r.profile !== profileRef.current) {
        profileRef.current = r.profile;
        saveProfile(r.profile);
      }
      if (r.award) setBanner(r.award);
      if (!flushed) spawn(e);
    },
    [spawn],
  );
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  /** Leave and forget the room, without treating it as an error. */
  const leave = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) void room.leave(true).catch(() => {});
    directorRef.current?.dispose();
    directorRef.current = null;
    authViewRef.current = null;
    mySeatRef.current = null;
    setStatus('idle');
    setError(null);
    setRoomId(null);
    setSeat(null);
    setView(null);
    setIdle(true);
    setSeats([]);
    setBanner(null);
    setLastDealResult(null);
    setWinnerTeam(null);
    setTurnDeadline(null);
  }, []);

  // Sockets and directors never outlive the screen; background fast-forwards.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') directorRef.current?.fastForward();
    });
    return () => {
      sub.remove();
      void roomRef.current?.leave(true).catch(() => {});
      directorRef.current?.dispose();
    };
  }, []);

  const attach = useCallback((room: Room) => {
    roomRef.current = room;
    setRoomId(room.roomId);

    room.onMessage('view', (msg: { seat: Seat; view: PublicView }) => {
      mySeatRef.current = msg.seat;
      authViewRef.current = msg.view;
      setSeat(msg.seat);
      if (!directorRef.current) {
        directorRef.current = new Director(msg.seat, msg.view, {
          onView: setView,
          onEventStart: (e, f) => onEventRef.current(e, f),
          onIdle: setIdle,
        });
        setView(msg.view);
      }
    });

    room.onMessage('room', (msg: RoomMessage) => {
      setSeats(msg.seats);
      setHard(msg.hard === true);
      setStatus(msg.status);
      // A stale-tap refusal is stale itself the moment the game moves on.
      if (msg.events.length > 0) setError(null);
      if (msg.turnTotalMs) setTurnTotalMs(msg.turnTotalMs);
      setTurnDeadline(msg.turnMsLeft != null ? Date.now() + msg.turnMsLeft : null);

      // The result panel needs the scored deal, which only the events carry.
      for (const e of msg.events) {
        if (e.kind === 'dealScored') setLastDealResult(e.result);
        if (e.kind === 'matchOver') setWinnerTeam(e.winner);
      }

      const d = directorRef.current;
      const finalView = authViewRef.current;
      if (d && finalView) d.enqueue({ events: msg.events, finalView });
    });

    room.onMessage('error', (msg: { reason: string }) => {
      // The server refused a move — usually a stale tap. Not fatal.
      setError(msg.reason);
    });

    room.onMessage('emote', (msg: { seat: Seat; id: string }) => {
      spawnEmote({ anchors, bus: fxBus, lang: langRef.current }, msg.seat, msg.id);
      playSfx('pop');
    });

    room.onLeave((code) => {
      if (roomRef.current !== room) return; // we left on purpose
      roomRef.current = null;
      directorRef.current?.fastForward();
      setStatus('disconnected');
      setError(langRef.current.s.ui.disconnectedWithCode(code));
    });
  }, []);

  const connect = useCallback(
    async (make: (client: Client) => Promise<Room>) => {
      leave();
      setStatus('connecting');
      setError(null);
      try {
        const client = new Client(SERVER_URL);
        const room = await make(client);
        attach(room);
        setStatus('waiting');
      } catch (err) {
        setStatus('error');
        setError((err as Error).message || langRef.current.s.ui.cannotConnect(SERVER_URL));
      }
    },
    [attach, leave],
  );

  // The only things we ever tell the server about the player.
  const name = settings.nickname.trim().slice(0, 20);
  const avatar = profileRef.current.selectedAvatar;

  const quickPlay = useCallback(
    () => connect((c) => c.joinOrCreate(ROOM_NAME, { name, avatar })),
    [connect, name, avatar],
  );
  const createPrivate = useCallback(
    () =>
      connect((c) =>
        // The host's difficulty setting travels with the table it creates.
        c.create(ROOM_NAME, { name, avatar, private: true, hard: settings.hardMode }),
      ),
    [connect, name, avatar, settings.hardMode],
  );
  const joinById = useCallback(
    (id: string) => connect((c) => c.joinById(id.trim(), { name, avatar })),
    [connect, name, avatar],
  );

  const submit = useCallback((a: Action) => {
    const room = roomRef.current;
    if (!room) return;
    setBanner(null);
    room.send('action', { action: a });
  }, []);

  const next = useCallback(() => {
    setBanner(null);
    setLastDealResult(null);
    roomRef.current?.send('next', {});
  }, []);

  // The server validates, rate-limits and echoes it back; the bubble spawns
  // from the broadcast, so what I see is exactly what the table saw.
  const sendEmote = useCallback((id: string) => {
    roomRef.current?.send('emote', { id });
  }, []);

  /** Host only: start the game now, bots filling the empty seats. */
  const startWithBots = useCallback(() => {
    roomRef.current?.send('start', {});
  }, []);

  return {
    status,
    error,
    roomId,
    seat,
    view,
    idle,
    seats,
    hard,
    profile: profileRef.current,
    banner,
    lastDealResult,
    matchOver: view?.phase === 'MATCH_OVER',
    winnerTeam,
    turnDeadline,
    turnTotalMs,
    anchors,
    fxBus,
    lang,
    quickPlay,
    createPrivate,
    joinById,
    startWithBots,
    submit,
    next,
    sendEmote,
    leave,
  };
}

export type NetGame = ReturnType<typeof useNetGame>;

export { teamOf };
