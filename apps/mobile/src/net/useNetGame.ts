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
import { Director, timingsFor, type MotionPolicy } from '../anim/director';
import { FxBus } from '../anim/FxBus';
import { makeFxSpawner, spawnEmote } from '../table/fx';
import { useMotionPolicy } from '../anim/useMotionPolicy';
import { cueFor, type TableCue } from '../table/cues';
import { playSfx } from '../audio';
import { emptyTally, landingSound, processEvents } from '../feedback';
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

/**
 * Where the game server lives.
 *
 * A build-time env var wins — EAS sets it for the store builds. Failing that,
 * a WEB build derives it from the page it was served from: Caddy fronts both
 * the static site and the websocket on a single origin, so the page's own host
 * is always the right answer, and it cannot drift the way a fixed default did.
 *
 * It drifted badly. `expo export --platform web` without the env var set kept
 * the development default, so the deployed bundle asked the browser to open
 * `ws://localhost:2567`; every online mode on belastih.com/igra failed the
 * instant it was touched, and the invite page linked straight into it. Two
 * consecutive web builds shipped that way, because nothing about it is visible
 * until a real browser tries to connect.
 *
 * The localhost default stays for development, where the app is not served
 * from the machine running the server.
 */
function resolveServerUrl(): string {
  const configured = process.env.EXPO_PUBLIC_SERVER_URL;
  if (configured) return configured;
  const loc = typeof window !== 'undefined' ? window.location : undefined;
  if (loc?.host && !/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(loc.host)) {
    return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}`;
  }
  return 'ws://localhost:2567';
}

export const SERVER_URL = resolveServerUrl();
const ROOM_NAME = 'bela';
/**
 * How long the server holds a dropped seat (BelaRoom's RECONNECT_SECONDS). The
 * retry loop has to cover the whole window: the room locks when the match
 * starts, so the reconnection token is the only way back in.
 */
const RECONNECT_HOLD_MS = 60_000;
/** The server's refusal when a seat here is already held from this connection. */
const SAME_ORIGIN_CODE = 4300;

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
  hostSeat?: Seat;
  series: [number, number];
  matchNumber: number;
  rematchVotes?: Seat[];
}

export function useNetGame(settings: Settings) {
  const roomRef = useRef<Room | null>(null);
  /**
   * The ticket back into a room we dropped out of.
   *
   * The server holds a dropped seat for a minute (`allowReconnection`), but the
   * room is locked the moment it starts, so `joinById` is refused with 4212 and
   * the only way back in is this token. Without it every backgrounded app, tunnel
   * and Wi-Fi handover permanently turned a player into a bot.
   */
  const reconnectTokenRef = useRef<string | null>(null);
  const reconnectRef = useRef<() => void>(() => {});
  const reconnectingRef = useRef(false);
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
  const [hostSeat, setHostSeat] = useState<Seat | null>(null);
  const [series, setSeries] = useState<[number, number]>([0, 0]);
  const [matchNumber, setMatchNumber] = useState(0);
  const [rematchVotes, setRematchVotes] = useState<Seat[]>([]);
  const [banner, setBanner] = useState<Award | null>(null);
  // Whose move is being animated; cleared when the director goes idle.
  const [spotlight, setSpotlight] = useState<Seat | null>(null);
  const [cue, setCue] = useState<TableCue | null>(null);
  const cueN = useRef(0);
  useEffect(() => {
    if (idle) setSpotlight(null);
  }, [idle]);
  const [lastDealResult, setLastDealResult] = useState<DealScoreResult | null>(null);
  const [winnerTeam, setWinnerTeam] = useState<TeamId | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [turnTotalMs, setTurnTotalMs] = useState(30_000);

  const anchors = useMemo(() => new AnchorMap(), []);
  const fxBus = useMemo(() => new FxBus(), []);
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  const motionRef = useRef<MotionPolicy>('full');
  const fx = useMemo(
    () =>
      makeFxSpawner({
        anchors,
        bus: fxBus,
        lang,
        mySeat: () => mySeatRef.current,
        view: () => directorRef.current?.getView() ?? null,
        reduced: () => motionRef.current === 'reduced',
      }),
    [anchors, fxBus, lang],
  );

  const hapticsRef = useRef(settings.haptics);
  hapticsRef.current = settings.haptics;
  // The director is built inside attach() once; it reaches the spawner by ref.
  const fxRef = useRef(fx);
  fxRef.current = fx;
  // Pacing follows the motion policy as it stands when the table is joined.
  const motion = useMotionPolicy(settings.motion);
  motionRef.current = motion;
  // The socket callbacks are created once; a ref keeps their locale current.
  const langRef = useRef(lang);
  langRef.current = lang;

  const onEvent = useCallback(
    (e: TableEvent, flushed: boolean, speed: number) => {
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
      if (!flushed) {
        fx.start(e, speed);
        // A seatless beat (the reveal, the deal, scoring) is nobody's move.
        setSpotlight('seat' in e ? e.seat : null);
        const c = cueFor(e, mine, directorRef.current?.getView() ?? null, ++cueN.current);
        if (c) setCue(c);
      }
    },
    [fx],
  );
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  /** Leave and forget the room, without treating it as an error. */
  const leave = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    // Dropping the token both stops any reconnect in flight and marks this as
    // a departure rather than a drop.
    reconnectTokenRef.current = null;
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
    setSeries([0, 0]);
    setMatchNumber(0);
    setRematchVotes([]);
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
    reconnectTokenRef.current = room.reconnectionToken;
    setRoomId(room.roomId);

    room.onMessage('view', (msg: { seat: Seat; view: PublicView }) => {
      mySeatRef.current = msg.seat;
      authViewRef.current = msg.view;
      setSeat(msg.seat);
      if (!directorRef.current) {
        directorRef.current = new Director(
          msg.seat,
          msg.view,
          {
            onView: setView,
            onEventStart: (e, f, s) => onEventRef.current(e, f, s),
            onEventEnd: (e) => {
              const mine = mySeatRef.current;
              if (mine !== null) landingSound(e, mine);
              fxRef.current.end(e);
            },
            onIdle: setIdle,
            // Anchors re-measure as each batch starts; the table bumps them too
            // whenever a row around the felt comes or goes.
            onBatch: () => anchors.bump(),
          },
          timingsFor(motionRef.current),
        );
        setView(msg.view);
      }
    });

    room.onMessage('room', (msg: RoomMessage) => {
      setSeats(msg.seats);
      setHard(msg.hard === true);
      setHostSeat(msg.hostSeat ?? null);
      setSeries(msg.series ?? [0, 0]);
      setMatchNumber(msg.matchNumber ?? 0);
      setRematchVotes(msg.rematchVotes ?? []);
      setStatus(msg.status);
      // A stale-tap refusal is stale itself the moment the game moves on.
      if (msg.events.length > 0) setError(null);
      if (msg.turnTotalMs) setTurnTotalMs(msg.turnTotalMs);
      setTurnDeadline(msg.turnMsLeft != null ? Date.now() + msg.turnMsLeft : null);

      // The result panel needs the scored deal, which only the events carry.
      for (const e of msg.events) {
        if (e.kind === 'dealScored') setLastDealResult(e.result);
        if (e.kind === 'matchOver') setWinnerTeam(e.winner);
        // A new match wipes the last one's verdict off the screen.
        if (e.kind === 'matchStarted') {
          setWinnerTeam(null);
          setLastDealResult(null);
          setBanner(null);
        }
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
      // Our seat is being played by a bot from here; the server will hold it
      // for a minute, so spend that minute trying to get back into it.
      reconnectRef.current();
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

  /**
   * Walk back in on the reconnection token, with backoff, inside the server's
   * hold window. `joinById` stays the fallback for after the window lapses —
   * it only works on a table that has not started, but that is exactly the
   * case the token cannot cover.
   */
  const reconnect = useCallback(async () => {
    const token = reconnectTokenRef.current;
    if (!token || reconnectingRef.current) return;
    reconnectingRef.current = true;
    // Keep trying for as long as the server actually holds the seat. Giving up
    // early and dropping the token stranded anyone whose link came back inside
    // the window: the room locks on start, so this token is the only way in.
    const deadline = Date.now() + RECONNECT_HOLD_MS;
    try {
      for (let wait = 0; Date.now() < deadline; wait = Math.min(5000, wait + 1000)) {
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        // The player gave up and walked away while we were waiting.
        if (reconnectTokenRef.current !== token) return;
        try {
          const room = await new Client(SERVER_URL).reconnect(token);
          // They may have left while this attempt was in flight. Joining now
          // would seat a room nothing will ever leave: the server sees a live
          // human on the seat, never bots it, and every one of that seat's
          // turns costs the other three the full clock.
          if (reconnectTokenRef.current !== token) {
            void room.leave(true).catch(() => {});
            return;
          }
          // Rebuild the animation from the authoritative view rather than
          // resuming a director that missed however many events we were away
          // for; the server publishes the current view on join.
          directorRef.current?.dispose();
          directorRef.current = null;
          attach(room);
          setError(null);
          return;
        } catch {
          setStatus('connecting');
        }
      }
      // The hold really has lapsed: the seat is a bot and the room is locked.
      reconnectTokenRef.current = null;
      setStatus('disconnected');
    } finally {
      reconnectingRef.current = false;
    }
  }, [attach]);

  useEffect(() => {
    reconnectRef.current = () => void reconnect();
  }, [reconnect]);

  // The only things we ever tell the server about the player.
  const name = settings.nickname.trim().slice(0, 20);
  const avatar = profileRef.current.selectedAvatar;

  const quickPlay = useCallback(
    () =>
      connect(async (c) => {
        try {
          return await c.joinOrCreate(ROOM_NAME, { name, avatar });
        } catch (err) {
          // The open table already has somebody playing from this connection.
          // With no accounts the server cannot tell a second player here from
          // a second tab, and three tabs at one table can read the fourth
          // player's hand by elimination — so it seats us apart rather than
          // turning us away. A fresh public table, and strangers join us there.
          if ((err as { code?: number } | null)?.code !== SAME_ORIGIN_CODE) throw err;
          return await c.create(ROOM_NAME, { name, avatar });
        }
      }),
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

  /** Pre-start: move to a free seat — how friends pick teams. */
  const sit = useCallback((target: Seat) => {
    roomRef.current?.send('sit', { seat: target });
  }, []);

  /** After a match: ask for another with the same people (all must agree). */
  const rematch = useCallback(() => roomRef.current?.send('rematch', {}), []);
  const rematchCancel = useCallback(() => roomRef.current?.send('rematchCancel', {}), []);
  /** Host only: start the next match now, bots filling anyone who left. */
  const rematchStart = useCallback(() => roomRef.current?.send('rematchStart', {}), []);

  return {
    status,
    error,
    roomId,
    seat,
    view,
    idle,
    seats,
    hard,
    hostSeat,
    series,
    matchNumber,
    rematchVotes,
    profile: profileRef.current,
    banner,
    lastDealResult,
    spotlight,
    cue,
    motion,
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
    reconnect,
    startWithBots,
    sit,
    rematch,
    rematchCancel,
    rematchStart,
    submit,
    next,
    sendEmote,
    leave,
  };
}

export type NetGame = ReturnType<typeof useNetGame>;

export { teamOf };
