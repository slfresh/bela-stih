import { Room, ServerError, type AuthContext, type Client } from '@colyseus/core';
import { Session, type AnyGame, type BotLevel, type ConfigOf, type EventOf, type ViewOf } from '@belot/game-core';
import {
  EMOTE_GAP_MS,
  EMOTE_IDS,
  GIFT_GAP_MS,
  GIFT_IDS,
  MIN_PROTO,
  MSG,
  NEXT_DEAL_MS,
  PAUSE_MAX_MS,
  TURN_CHOICES,
  UPDATE_APP_CODE,
  WAIT_FOR_DROPPED_MS,
  type EmoteMessage,
  type GameId,
  type GameRoomMessage,
  type GiftMessage,
  type JoinGifts,
  type JoinProto,
  type JoinVoice,
  type VoiceHeardMessage,
  type VoiceMessage,
} from '../protocol';
import { checkClip, VoiceLedger, VoiceLimiter } from '../voice';
import { cleanName } from '../names';
import { tableCode } from '../codes';
import { cryptoRng } from './cryptoRng';

/** The codes of the private tables open in this process, so a new one is never a duplicate. */
const liveCodes = new Set<string>();

/**
 * An authoritative card table for any game in the app.
 *
 * The room owns the only real `Session`; clients own nothing. Every inbound
 * action is rebuilt by the game's own normaliser, checked against the seat the
 * sender actually holds and handed to the game, which rejects anything
 * illegal — the server trusts nothing.
 *
 * Two deliberate choices:
 *  - **State is never synced.** Each client is sent only its own view, so
 *    another player's cards have no route onto the wire at all.
 *  - **A dropped player becomes a bot.** `Session` treats a seat as
 *    human-or-bot, so play carries on and the seat is handed back on reconnect.
 *
 * Everything a table does whatever is played on it lives here: seating, the
 * one-seat-per-origin rule, reconnects, pausing and waiting for a friend, the
 * turn clock (a window clock for games where several seats decide at once),
 * the next-round countdown, rematch votes, emotes, gifts and voice. A game's
 * room adds only its rules and the shape of the room message its apps read.
 */

/** Quick play's turn clock, and a private table's until its host picks another. */
export const TURN_MS = TURN_CHOICES[0]! * 1000;
/** Shortest gap between two accepted seat changes from one connection. */
const SIT_GAP_MS = 250;
/**
 * How long a dropped player's seat is kept for them. In the lobby, briefly: a
 * held chair nobody is behind blocks the table from filling. Once the match
 * is under way nothing waits on a held seat (a bot or the private table's wait
 * covers it), so it is kept for as long as a phone call could plausibly last -
 * coming back to your own seat instead of the lobby.
 */
const LOBBY_RECONNECT_SECONDS = 60;
const TABLE_RECONNECT_SECONDS = 30 * 60;

export interface Occupant {
  sessionId: string | null;
  name: string;
  avatar: string;
  connected: boolean;
  /**
   * Where this connection came from, for the one-seat-per-origin rule below.
   * Server-side only — it is never published, stored or logged.
   */
  origin: string;
  /** This player's app draws table gifts (it joined with `gifts: true`). */
  gifts: boolean;
  /**
   * This player's app plays and records voice clips now: it joined with
   * `voice: true`, or said so since ('hears'). Off while its player has
   * switched voice off in Settings.
   */
  voice: boolean;
  /** The app can do voice at all (it sent `voice`, true or false); an older one cannot. */
  speaksVoice: boolean;
  /** The app confirms the clips it plays, and reads confirmations of its own (`receipts: true`, 1.5.1). */
  receipts: boolean;
  /** The wire generation the app joined with (protocol.ts PROTO); 0 for an app from before the handshake. */
  proto: number;
}

/** A chair nobody sits in. */
const vacant = (): Occupant => ({ sessionId: null, name: '', avatar: '', connected: false, origin: '', gifts: false, voice: false, speaksVoice: false, receipts: false, proto: 0 });

/** Refused because a seat at THIS table is already held from the same place. */
export const SAME_ORIGIN_CODE = 4300;

/** The address a connection appears to come from, behind the proxy or not. */
function originOf(context: AuthContext): string {
  const ip = context.ip;
  const first = Array.isArray(ip) ? ip[0] : ip;
  // x-forwarded-for is a list when there is more than one proxy; the client is
  // the first entry.
  return String(first ?? '').split(',')[0]!.trim();
}

/** The wire generation an app joined with: what it said, or 0 for an app from before the handshake. */
function protoOf(options: unknown): number {
  const p = (options as JoinProto | null)?.proto;
  return typeof p === 'number' && Number.isInteger(p) && p >= 0 ? p : 0;
}

/** What every seat looks like to the table, before a game shapes it for its own message. */
export interface SeatPublic {
  seat: number;
  name: string;
  avatar: string;
  connected: boolean;
  bot: boolean;
  gift?: string;
  seesGifts?: true;
  hearsVoice?: true;
}

/** A private table standing still: who paused it, and who is waited for. */
export interface HoldPublic {
  paused?: { by: number; msLeft: number };
  waiting: { seat: number; msLeft: number }[];
}

export type CreateOptions = { private?: boolean } & Record<string, unknown>;

export abstract class GameRoom<D extends AnyGame> extends Room {
  override maxClients = 4;

  /** The game this room plays. */
  protected abstract readonly def: D;

  protected session!: Session<D>;
  /** How many chairs the table has. */
  protected seatCount = 4;
  /** How well the bots that fill a seat play: quick play's medium, or what a private table's host chose. */
  protected botLevel: BotLevel = 'medium';
  /** Public tables are the ones strangers are matched into. */
  protected isPublic = true;
  /** The table's creator (first joiner); start-with-bots rights follow them. */
  private hostId: string | null = null;
  /** Matches won per winner (team or seat) since these people sat down. */
  protected series: number[] = [];
  protected matchNumber = 0;
  /** Idempotence guard: afterMove() runs on every publish, the score once. */
  private lastRecordedMatch = -1;
  /** Seats that have asked for another match; cleared on each restart. */
  protected readonly rematchVotes = new Set<number>();
  protected occupants: Occupant[] = [];
  /** This table's turn clock: quick play's, or what a private table's host chose. */
  protected turnMs = TURN_MS;
  /**
   * A private table standing still. Two reasons, which can overlap: a player
   * paused it, or a player's connection dropped and the table waits for them.
   * Nothing moves while either holds - no turn clock, no bots, no next round -
   * because the Session only ever moves inside submit(), setSeatHuman(false),
   * startNextRound() and the timers, and a hold refuses or stops all four.
   */
  private paused: { by: number; until: number } | null = null;
  /** Dropped players still waited for, each until its own give-up time. */
  private readonly waiting = new Map<number, number>();
  /**
   * Seats whose wait ended without them (it ran out, or someone chose to play
   * on) while the table still could not move. A bot takes them the moment it
   * can: handing a seat to a bot runs the bots at once, which must never
   * happen while anybody is still waited for or the table is paused.
   */
  private readonly gaveUp = new Set<number>();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  /** The finished round's countdown, and who has said they are ready. */
  protected readonly nextVotes = new Set<number>();
  private nextTimer: ReturnType<typeof setTimeout> | null = null;
  protected nextEndsAt = 0;
  /** Which finished round the countdown belongs to (afterMove runs on every publish). */
  private nextFor = -1;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  protected turnEndsAt = 0;
  /**
   * Which DECISION the running clock belongs to (see Session.moveCount), and
   * for a window the seats it was opened for and the move count it opened at.
   */
  private turnDecision: string | null = null;
  private turnActors: number[] = [];
  protected started = false;
  /**
   * Rate limits, keyed by CONNECTION rather than by seat: pre-start a client can
   * change seats freely, so a per-seat gap is one a seat-hopper multiplies.
   */
  private lastEmoteAt = new Map<string, number>();
  private lastSitAt = new Map<string, number>();
  private lastVoteAt = new Map<string, number>();
  private lastGiftAt = new Map<string, number>();
  private voiceLimits = new Map<string, VoiceLimiter>();
  /** Numbers each relayed clip, so a client can tell its echo from another clip. */
  private voiceSeq = 0;
  /** Who was sent which clip lately, for the receipts ('heard'). */
  private voiceLedger = new VoiceLedger();
  /** Voice messages at this table: always in quick play; a private table's host may switch them off. */
  protected voiceOn = true;
  /**
   * Each seat's latest gift, by seat rather than by occupant: a seat played by
   * a bot from the start can be given one too. Cleared when the person in the
   * seat changes (a join, a release); kept while a dropped player is held, and
   * across a rematch, because it is still the same person at the table.
   */
  private gifts: (string | null)[] = [];

  // --- what a game's room supplies --------------------------------------------

  /** Read the create options into this table's rules. Called once, before the session is built. */
  protected abstract readOptions(options: CreateOptions): void;
  /** The game config for a fresh session under this room's current rules. */
  protected abstract sessionConfig(): Partial<ConfigOf<D>>;
  /** That game's table rules as its host set them, for the room message. */
  protected rulesPublic(): Record<string, unknown> {
    return {};
  }

  /**
   * The message every client reads about the table: seats, clocks, rules and
   * the event stream. Every game but Bela sends GameRoomMessage; Bela keeps
   * the RoomMessage its shipped apps read.
   */
  protected roomMessage(events: EventOf<D>[]): unknown {
    const votes = this.liveRematchVotes();
    const host = this.actingHostSeat();
    const window = this.windowPublic();
    const msg: GameRoomMessage = {
      game: this.def.meta.id as GameId,
      players: this.seatPublic(),
      seatCount: this.seatCount,
      status: this.status(),
      events,
      ...(window ? { window } : {}),
      turnSeconds: this.turnMs / 1000,
      ...(host !== null ? { hostSeat: host } : {}),
      series: this.series.slice(),
      matchNumber: this.matchNumber,
      ...(votes.length > 0 ? { rematchVotes: votes } : {}),
      ...(this.nextEndsAt > 0 ? { nextMsLeft: Math.max(0, this.nextEndsAt - Date.now()) } : {}),
      ...(this.betweenRounds() && this.nextVotes.size > 0 ? { nextVotes: [...this.nextVotes] } : {}),
      ...(this.isHeld() ? { hold: this.holdInfo()! } : {}),
      ...(this.isPublic ? {} : { private: true as const }),
      ...(this.voiceOn ? { voice: true as const } : {}),
      botLevel: this.botLevel,
      rules: this.rulesPublic(),
    };
    return msg;
  }
  /** A game-specific message ('rules' at a Bela table). Return true when it was this game's. */
  protected handleGameMessage(_client: Client, _seat: number, _type: string, _message: unknown): boolean {
    return false;
  }
  /**
   * What a seat may see before the table locks. The deck is dealt when the room
   * is created while seats are still changing hands, so a client could walk
   * the free seats and read each hand dealt to them: by default the lobby is
   * sent no view at all. A game whose lobby draws something (Bela's, with the
   * hand blanked) says what is safe to send.
   */
  protected preStartView(_view: ViewOf<D>): ViewOf<D> | null {
    return null;
  }
  /** How many matches a finished match counts for (Bela's double win counts two). */
  protected matchCredit(): number {
    return 1;
  }
  /** How many chairs this table gets; the game's maximum unless a room says otherwise. */
  protected seatsFor(_options: CreateOptions): number {
    return this.def.meta.maxPlayers;
  }

  // --- creation ------------------------------------------------------------------

  override onCreate(options: CreateOptions = {}): void {
    this.seatCount = this.seatsFor(options);
    this.maxClients = this.seatCount;
    this.occupants = this.seats().map(vacant);
    this.gifts = this.seats().map(() => null);
    const teams = this.def.meta.teams;
    this.series = Array<number>(teams ? teams.count : this.seatCount).fill(0);
    this.readOptions(options);
    this.buildSession();

    // A code friends can read out and type (codes.ts), at every table: a
    // quick-play table shows its code and an invite too, and showed
    // "IUxDQ8dvS" there. Colyseus registers the room under its id only after
    // onCreate, so this is the id.
    this.roomId = tableCode((c) => liveCodes.has(c));
    liveCodes.add(this.roomId);
    if (options.private) {
      this.isPublic = false;
      this.setPrivate(true);
    }

    // Colyseus looks the message type up on a plain object literal, so a client
    // sending `__proto__` / `constructor` / `toString` resolves up the prototype
    // chain to something truthy whose `.callback` is not a function, and the
    // throw escapes the room and takes the process with it.
    // The handler map is private to Room; reaching it is the only way to close
    // the lookup, since registering a named `__proto__` handler would set the
    // prototype instead of an own key.
    Object.setPrototypeOf((this as unknown as { onMessageHandlers: object }).onMessageHandlers, null);

    this.onMessage('*', (client: Client, type: string | number, message: unknown) => {
      try {
        this.handle(client, String(type), message);
      } catch (err) {
        // One malformed frame must cost the sender an error and nothing else.
        // Every room on this host shares a process; an escape here ends them all.
        console.error(`[${this.def.meta.id}] message ${String(type)} failed:`, err);
        client.send(MSG.error, { reason: 'bad message' });
      }
    });
  }

  /** Every chair, in seat order. */
  protected seats(): number[] {
    return Array.from({ length: this.seatCount }, (_, i) => i);
  }

  /**
   * A fresh session under this room's rules. Every seat human: nothing moves
   * until a real player acts, or a timer fires. Only ever before the start,
   * when the lobby has shown nobody a card (publish withholds them until then),
   * so the host changing the rules just deals a new, unseen deck.
   */
  protected buildSession(): void {
    this.session = new Session(this.def, {
      seats: this.seatCount,
      humanSeats: this.seats(),
      botLevel: this.botLevel,
      config: this.sessionConfig(),
      // No seed at all. A seeded session is fine for the CLI and offline play
      // (dealer and player are the same device) and catastrophic here — and so
      // is any 32-bit seed, crypto or not, because the generator behind it only
      // has 32 bits of state to hide in.
      rng: cryptoRng(),
    });
    this.session.drainEvents();
  }

  // --- seating -------------------------------------------------------------

  protected seatOf(sessionId: string): number | null {
    const i = this.occupants.findIndex((o) => o.sessionId === sessionId);
    return i < 0 ? null : i;
  }

  private freeSeat(): number | null {
    // The game's order: at Bela the second joiner sits ACROSS from the host
    // (0 and 2 are a team), so two friends and two bots is partners by default.
    const order = this.def.meta.seatFillOrder?.(this.seatCount) ?? this.seats();
    for (const s of order) {
      if (this.occupants[s]!.sessionId === null) return s;
    }
    return null;
  }

  /**
   * One seat per origin at a public table.
   *
   * There are no accounts, so the server cannot tell four players from one
   * person in four tabs — and three tabs at one table is enough to read the
   * fourth player's whole hand by elimination, since a bela deck is 32 cards
   * and three hands are 24 of them. No rule is broken doing it; the seats are
   * simply all theirs.
   *
   * Refusing rather than blocking: the client answers this by CREATING a fresh
   * public table instead, so the second connection still gets a game — it just
   * cannot sit down next to the first one. Nobody is ever turned away, which
   * matters because whole mobile networks share one address, and two strangers
   * behind the same carrier must not be mistaken for a cheat.
   *
   * Private tables are exempt: you get in by knowing the code, and sharing it
   * with somebody is the entire point.
   */
  override onAuth(_client: Client, options: unknown, context: AuthContext): { origin: string } {
    // An app too old for this wire is refused at the door, before it takes a
    // seat (protocol.ts: the generation, and why MIN_PROTO is 0 for now).
    if (protoOf(options) < MIN_PROTO) throw new ServerError(UPDATE_APP_CODE, 'update the app');
    const origin = originOf(context);
    const clash =
      this.isPublic &&
      !this.started &&
      origin !== '' &&
      this.occupants.some((o) => o.sessionId !== null && o.connected && o.origin === origin);
    if (clash) throw new ServerError(SAME_ORIGIN_CODE, 'seat already held from here');
    return { origin };
  }

  override onJoin(client: Client, options: { name?: string; avatar?: string } & JoinGifts & JoinVoice = {}): void {
    const seat = this.freeSeat();
    if (seat === null) {
      client.leave(4000, 'table full');
      return;
    }
    this.occupants[seat] = {
      origin: (client.auth as { origin?: string } | undefined)?.origin ?? '',
      sessionId: client.sessionId,
      // Just what they gave: seatPublic names an empty one by the chair it is in
      // at the time, so a move in the lobby cannot carry the old chair's number.
      name: cleanName(options.name),
      // Echoed verbatim to other clients, so keep it to a short safe token.
      avatar: typeof options.avatar === 'string' ? options.avatar.replace(/[^a-z]/g, '').slice(0, 20) : '',
      connected: true,
      gifts: options.gifts === true,
      voice: options.voice === true,
      speaksVoice: typeof options.voice === 'boolean',
      receipts: options.receipts === true,
      proto: protoOf(options),
    };
    this.session.setSeatHuman(seat, true);
    this.gifts[seat] = null;
    if (this.hostId === null) this.hostId = client.sessionId;

    // The series belongs to the people who sat down together, so a NEW face
    // resets it. A reconnect never lands here (it goes through
    // allowReconnection), so a dropped player keeps the tally.
    if (this.started) {
      this.series = this.series.map(() => 0);
      this.matchNumber = 0;
      this.lastRecordedMatch = -1;
    }

    if (!this.started && this.occupants.every((o) => o.sessionId !== null)) {
      this.lockTable();
      // The first player is on the clock from the very first move — without
      // this, an AFK first player would hang the table forever.
      this.armTimer();
    }
    this.publish();
  }

  override async onLeave(client: Client, consented?: boolean): Promise<void> {
    const seat = this.seatOf(client.sessionId);
    if (seat === null) return;

    this.occupants[seat]!.connected = false;
    if (this.started && consented !== true && this.waitsFor(seat)) {
      // A private table stands still for a friend whose phone rang: nobody
      // plays their cards for them, and the others see who they are waiting
      // for and can choose to play on.
      this.waiting.set(seat, Date.now() + WAIT_FOR_DROPPED_MS);
      this.holdChanged();
    } else if (this.started) {
      // The seat keeps playing as a bot while we wait for them back. The bot
      // may move immediately, so re-arm the clock for whoever is on turn now.
      this.handToBot(seat);
      this.afterMove();
    } else {
      // Pre-start, nothing may move: handing a lobby seat to its bot used to
      // start the deal playing itself while `status` still read 'waiting'.
      this.publish();
    }

    // A deliberate leave frees the seat at once (release() re-checks the vote);
    // a dropped connection is worth holding open for.
    if (consented === true) {
      this.release(seat);
      return;
    }

    // Their dropping out may have been the last vote anybody was waiting on —
    // everyHumanVoted() counts only CONNECTED humans, and this one no longer is.
    // Deliberately NOT an early return: leaving here would skip the hold below,
    // so the seat would stay occupied by a session that has gone, with no
    // reconnect window and, if they were the host, no way to pass the crown.
    this.maybeRematch();

    try {
      await this.allowReconnection(client, this.started ? TABLE_RECONNECT_SECONDS : LOBBY_RECONNECT_SECONDS);
      this.occupants[seat]!.connected = true;
      this.occupants[seat]!.sessionId = client.sessionId;
      this.session.setSeatHuman(seat, true);
      // Back before anyone gave up on them: nothing was played for them, and
      // the table carries on if they were the last thing it waited for.
      const wasWaited = this.waiting.delete(seat);
      const hadGivenUp = this.gaveUp.delete(seat);
      if (wasWaited || hadGivenUp) {
        this.holdChanged();
        return;
      }
      // Coming back changes the connected-human set exactly as leaving did, so
      // a vote that was waiting on somebody else can now be complete. And the
      // clocks re-arm: a table that sat at a finished round with nobody on the
      // line armed no countdown, and would otherwise wait for a press for ever.
      if (!this.maybeRematch()) this.afterMove();
    } catch {
      this.release(seat);
    }
  }

  private release(seat: number): void {
    const wasHost = this.occupants[seat]!.sessionId === this.hostId;
    this.forget(this.occupants[seat]!.sessionId);
    this.occupants[seat] = vacant();
    // The person has gone for good; their gift goes with them.
    this.gifts[seat] = null;
    // A seat nobody is sitting in cannot be waited on for a rematch vote.
    this.rematchVotes.delete(seat);
    this.nextVotes.delete(seat);
    // Whoever left is no longer waited for - but while the table stands still
    // their bot must not move yet either: it takes the seat when the hold ends.
    this.waiting.delete(seat);
    this.gaveUp.delete(seat);
    if (this.started) this.handToBot(seat);
    // The crown passes to whoever is still seated.
    if (wasHost) this.hostId = this.occupants.find((o) => o.sessionId !== null)?.sessionId ?? null;
    if (this.maybeRematch()) return;
    // holdChanged, not afterMove: it is the one place that reschedules the
    // hold and hands over any seat that was waiting for the table to move.
    if (this.started) this.holdChanged();
    else this.publish();
  }

  /**
   * Start the next match if the departure just now completed the vote.
   *
   * everyHumanVoted() is otherwise only ever evaluated inside the `rematch`
   * handler, so three players who accepted and then lost the fourth waited for a
   * message that could never arrive — and the client hides "start anyway" once
   * the outstanding count reaches zero.
   */
  private maybeRematch(): boolean {
    if (!this.session.matchOver() || !this.everyHumanVoted()) return false;
    this.beginRematch();
    return true;
  }

  /**
   * Close the table and fix who is a human from here.
   *
   * A seat only plays as a human if somebody is actually SITTING in it and
   * connected. Checking `sessionId === null` alone let a player who dropped in
   * the lobby — whose seat is still occupied while we hold it for them — lock in
   * as a human nobody was behind, so every one of that seat's turns burned the
   * full clock for everyone else until the hold lapsed.
   */
  private lockTable(): void {
    for (const s of this.seats()) {
      const o = this.occupants[s]!;
      this.session.setSeatHuman(s, o.sessionId !== null && o.connected);
    }
    this.started = true;
    this.lock();
  }

  /** A seat with a person in it who is on the line. */
  protected onLine(seat: number): boolean {
    const o = this.occupants[seat]!;
    return o.sessionId !== null && o.connected;
  }

  /** Every connected human still at the table has asked for another match. */
  private everyHumanVoted(): boolean {
    const humans = this.seats().filter((s) => this.onLine(s));
    return humans.length > 0 && humans.every((s) => this.rematchVotes.has(s));
  }

  private beginRematch(): void {
    // A seat that is still occupied and connected stays HUMAN whatever it
    // voted — the vote gates the START, it never takes somebody's cards away.
    // Empty and dropped seats become bots, exactly as at table creation.
    for (const s of this.seats()) this.session.setSeatHuman(s, this.onLine(s));
    this.rematchVotes.clear();
    this.matchNumber += 1;
    // The Session keeps the injected generator, so the new deck is drawn the
    // same way the first one was.
    this.session.newMatch();
    this.afterMove();
  }

  /** Between rounds: one is scored and the next is not yet dealt. */
  protected betweenRounds(): boolean {
    return this.session.roundOver() && !this.session.matchOver();
  }

  // --- messages ------------------------------------------------------------

  private handle(client: Client, type: string, message: unknown): void {
    const seat = this.seatOf(client.sessionId);
    if (seat === null) return;

    // A player the table waits for who says anything at all is back: their
    // "back" may have been the message a flaky connection lost, and a table
    // left waiting on someone who is playing would refuse their every move.
    // (Not a Settings switch flipped on the way, nor a clip's receipt: that is
    // the app, not the player at the table.)
    if (type !== 'away' && type !== 'hears' && type !== 'heard' && this.waiting.has(seat) && this.occupants[seat]!.connected) {
      this.waiting.delete(seat);
      this.holdChanged();
      if (type === 'back') return;
    }

    if (type === 'action' || type === 'move') {
      // Every other branch is gated on `started` or on a phase. Without this a
      // third joiner can act before the fourth player exists, and the fourth
      // arrives bound to a contract they never saw.
      if (!this.started) return;
      // A table standing still takes no moves: the player who paused it is on
      // the phone, or a friend is being waited for.
      if (this.isHeld()) {
        client.send(MSG.error, { reason: 'paused' });
        return;
      }
      const raw = (message as { action?: unknown } | undefined)?.action;
      // Rebuilt field by field from primitives by the game's normaliser, so no
      // object a client sent can reach the game or the authoritative state by
      // reference. A well-typed action carrying a hostile VALUE was enough to
      // poison a room and, at the next publish, take the whole process down.
      const action = this.def.normalize(this.session.state, seat, raw);
      if (!action) {
        client.send(MSG.error, { reason: 'malformed action' });
        return;
      }
      try {
        this.session.submit(action);
      } catch (err) {
        // The game rejects anything illegal; tell the client and carry on.
        client.send(MSG.error, { reason: (err as Error).message });
        return;
      }
      this.afterMove();
      return;
    }

    if (type === 'sit') {
      // Before the game starts, anyone may move to a free seat — that is how
      // friends pick teams. No state has advanced yet, so it is a pure swap.
      const target = (message as { seat?: number } | undefined)?.seat;
      if (this.started) return;
      // Number.isInteger also rejects NaN and any non-number, so a fractional
      // seat can no longer index past the end of `occupants` and throw.
      if (!Number.isInteger(target) || target! < 0 || target! >= this.seatCount || target === seat) return;
      // Each accepted change republishes to every client, so it needs the same
      // kind of gap the emotes have.
      const now = Date.now();
      if (now - (this.lastSitAt.get(client.sessionId) ?? 0) < SIT_GAP_MS) return;
      if (this.occupants[target!]!.sessionId !== null) return;
      this.lastSitAt.set(client.sessionId, now);
      this.occupants[target!] = this.occupants[seat]!;
      this.occupants[seat] = vacant();
      // Gifts only exist once the table has started, but should that ever
      // change, a gift follows the person, not the chair.
      this.gifts[target!] = this.gifts[seat]!;
      this.gifts[seat] = null;
      this.publish();
      return;
    }

    if (type === 'clock') {
      // Only before the start, only at a private table, only the host, and
      // only one of the offered lengths: quick play stays the same for everyone.
      const seconds = (message as { seconds?: unknown } | undefined)?.seconds;
      if (this.started || this.isPublic || seat !== this.actingHostSeat()) return;
      if (typeof seconds !== 'number' || !TURN_CHOICES.includes(seconds)) return;
      this.turnMs = seconds * 1000;
      this.publish();
      return;
    }

    if (this.handleGameMessage(client, seat, type, message)) return;

    if (type === 'pause') {
      if (!this.canHold() || this.paused !== null) return;
      this.paused = { by: seat, until: Date.now() + PAUSE_MAX_MS };
      this.holdChanged();
      return;
    }

    if (type === 'resume') {
      if (this.paused === null) return;
      this.paused = null;
      this.holdChanged();
      return;
    }

    if (type === 'away') {
      // A call that did not drop the connection: wait for them as if it had.
      if (!this.waitsFor(seat) || this.waiting.has(seat)) return;
      this.waiting.set(seat, Date.now() + WAIT_FOR_DROPPED_MS);
      this.holdChanged();
      return;
    }

    if (type === 'back') {
      if (!this.waiting.delete(seat)) return;
      this.holdChanged();
      return;
    }

    if (type === 'playOn') {
      // Stop waiting for everyone who dropped: their bots take the cards
      // (the moment the table may move) until they are back.
      if (this.waiting.size === 0) return;
      for (const s of this.waiting.keys()) this.gaveUp.add(s);
      this.waiting.clear();
      this.holdChanged();
      return;
    }

    if (type === 'start') {
      // The host (the table's creator) may start early; every empty seat
      // plays as a bot from here on. The table locks exactly as it does when
      // the last human sits down. While the host's phone is off the line,
      // whoever sits next in order may do it: a held lobby seat must not lock
      // everyone else out of starting.
      if (seat !== this.actingHostSeat() || this.started) return;
      this.lockTable();
      this.afterMove();
      return;
    }

    if (type === 'rematch' || type === 'rematchCancel') {
      if (!this.session.matchOver()) return;
      // Each one republishes to every client, so it needs the same gap `sit` has.
      const votedAt = Date.now();
      if (votedAt - (this.lastVoteAt.get(client.sessionId) ?? 0) < SIT_GAP_MS) return;
      this.lastVoteAt.set(client.sessionId, votedAt);
      if (type === 'rematch') this.rematchVotes.add(seat);
      else this.rematchVotes.delete(seat);
      if (type === 'rematch' && this.everyHumanVoted()) this.beginRematch();
      else this.publish();
      return;
    }

    if (type === 'rematchStart') {
      // The host can start without a full house; anyone who left is botted.
      if (seat !== this.actingHostSeat() || !this.session.matchOver()) return;
      this.beginRematch();
      return;
    }

    if (type === 'next') {
      // A vote, not a start: the first player to press used to deal again for
      // everyone, yanking the result sheet away from people still reading it.
      if (!this.betweenRounds()) return;
      this.nextVotes.add(seat);
      if (!this.isHeld() && this.everyoneReady()) this.startNextRound();
      else this.publish();
      return;
    }

    if (type === 'emote') {
      // Fixed vocabulary + a per-seat gap; anything else is silently dropped.
      const id = (message as { id?: string } | undefined)?.id;
      if (typeof id !== 'string' || !EMOTE_IDS.includes(id)) return;
      const now = Date.now();
      if (now - (this.lastEmoteAt.get(client.sessionId) ?? 0) < EMOTE_GAP_MS) return;
      this.lastEmoteAt.set(client.sessionId, now);
      const msg = { seat, id } as EmoteMessage;
      this.broadcast(MSG.emote, msg);
      return;
    }

    if (type === 'voice') {
      // Push-to-talk. Relayed to the others at the table whose apps play
      // clips, and dropped: never stored, never logged. Only where voice is
      // on, from an app that records it, and only what checkClip accepts -
      // anything else is dropped without a word, and costs nothing.
      if (!this.voiceOn || !this.occupants[seat]!.voice) return;
      const m = message as { mime?: unknown; data?: unknown; ms?: unknown } | undefined;
      const clip = checkClip(m?.mime, m?.data, m?.ms);
      if (clip === null) return;
      let limiter = this.voiceLimits.get(client.sessionId);
      if (!limiter) this.voiceLimits.set(client.sessionId, (limiter = new VoiceLimiter()));
      if (!limiter.take(Date.now(), clip.ms)) return;
      const id = ++this.voiceSeq;
      const out = { from: seat, id, ms: clip.ms, mime: clip.mime, data: clip.data } as VoiceMessage;
      const to: number[] = [];
      const noReceipt: number[] = [];
      const sessions: string[] = [];
      for (const other of this.clients) {
        const s = this.seatOf(other.sessionId);
        if (s === null || s === seat || !this.hearsVoice(s)) continue;
        other.send(MSG.voice, out);
        to.push(s);
        sessions.push(other.sessionId);
        if (!this.occupants[s]!.receipts) noReceipt.push(s);
      }
      this.voiceLedger.sent(id, client.sessionId, sessions, Date.now());
      // The speaker hears nothing back, only that the room took it (for the
      // rings on their own puck) and whom it went to: nobody at all is said
      // at once, and which of them cannot confirm, so no app waits on them.
      const echo = { from: seat, id, ms: clip.ms, mime: clip.mime, to, ...(noReceipt.length > 0 ? { noReceipt } : {}) } as VoiceMessage;
      client.send(MSG.voice, echo);
      return;
    }

    if (type === 'heard') {
      // A clip has started playing at this seat. Believed only from a seat it
      // was sent to, once, and passed only to a speaker whose app reads it.
      const speakerId = this.voiceLedger.heard((message as { id?: unknown } | undefined)?.id, client.sessionId, Date.now());
      if (speakerId === null) return;
      const speakerSeat = this.seatOf(speakerId);
      const speaker = this.clients.find((c) => c.sessionId === speakerId);
      if (speakerSeat === null || !speaker || !this.occupants[speakerSeat]!.receipts) return;
      const heard = { id: (message as { id: number }).id, by: seat } as VoiceHeardMessage;
      speaker.send(MSG.voiceHeard, heard);
      return;
    }

    if (type === 'hears') {
      // Only an app that joined speaking voice may say it hears again: an old
      // one could not play what it would be sent. Nothing is published - no
      // one else's view depends on it, and a toggling client costs nothing.
      const o = this.occupants[seat]!;
      const on = (message as { on?: unknown } | undefined)?.on;
      if (typeof on !== 'boolean') return;
      if (on && !o.speaksVoice) return;
      o.voice = on;
      return;
    }

    if (type === 'gift') {
      // Only at a table that is playing: the lobby draws no pucks to land on,
      // and its seats still change hands.
      if (!this.started) return;
      const m = message as { id?: unknown; to?: unknown } | undefined;
      const id = m?.id;
      if (typeof id !== 'string' || !GIFT_IDS.includes(id)) return;
      // One other seat, or everyone else. Anything else — the sender's own
      // seat, 7, '1', 'everyone' — is dropped and does not count as a send.
      let to: number[];
      if (m?.to === 'table') {
        to = this.seats().filter((s) => s !== seat);
      } else if (Number.isInteger(m?.to) && (m!.to as number) >= 0 && (m!.to as number) < this.seatCount && m!.to !== seat) {
        to = [m!.to as number];
      } else {
        return;
      }
      // Nobody is sent a gift their app cannot draw (an older app): the
      // sender's device pays for exactly the seats in the echo. With nobody
      // left it is dropped, and does not count as a send.
      to = to.filter((t) => this.seesGifts(t));
      if (to.length === 0) return;
      const now = Date.now();
      if (now - (this.lastGiftAt.get(client.sessionId) ?? 0) < GIFT_GAP_MS) return;
      this.lastGiftAt.set(client.sessionId, now);
      // No coins are checked here, and none can be: there are no accounts, and
      // the sender's device pays on seeing this echo. A forged free gift gains
      // its forger nothing and costs nobody anything — the receiver is given
      // nothing but a picture beside their name.
      for (const t of to) this.gifts[t] = id;
      const msg = { from: seat, to, id } as GiftMessage;
      // Broadcast only: no publish(), so a gift never re-sends views or wakes a
      // director. The badge rides along in the seats on the next publish, which
      // is what a reconnecting player reads.
      this.broadcast(MSG.gift, msg);
    }
  }

  protected afterMove(): void {
    // Score the series exactly once per match, however many publishes follow.
    if (this.session.matchOver() && this.lastRecordedMatch !== this.matchNumber) {
      this.lastRecordedMatch = this.matchNumber;
      const credit = this.matchCredit();
      for (const w of this.session.winners() ?? []) this.series[w] = (this.series[w] ?? 0) + credit;
    }
    if (this.isHeld() || this.session.matchOver()) this.stopTimer();
    else this.armTimer();
    if (this.betweenRounds() && !this.isHeld()) {
      // Everyone said they were ready while the table stood still: go now.
      if (this.everyoneReady()) {
        this.startNextRound();
        return;
      }
      this.armNext();
    } else {
      this.stopNext();
    }
    this.publish();
  }

  // --- the next round --------------------------------------------------------

  /** Every player at the table who is on the line has said they are ready. */
  private everyoneReady(): boolean {
    const humans = this.seats().filter((s) => this.onLine(s) && this.session.humanSeats.has(s));
    return humans.length > 0 && humans.every((s) => this.nextVotes.has(s));
  }

  /** The finished round's countdown: armed once per round, however many publishes follow. */
  private armNext(): void {
    // Nothing moves between rounds, so the move count names the round.
    const round = this.session.moveCount;
    if (this.nextTimer !== null && this.nextFor === round) return;
    // Nobody on the line: nothing to count down for, and no reason for bots
    // to play whole rounds to an empty room.
    const anyone = this.seats().some((s) => this.onLine(s));
    if (!anyone) {
      this.stopNext();
      return;
    }
    if (this.nextTimer !== null) clearTimeout(this.nextTimer);
    this.nextFor = round;
    this.nextEndsAt = Date.now() + NEXT_DEAL_MS;
    this.nextTimer = setTimeout(() => {
      this.nextTimer = null;
      try {
        if (this.betweenRounds() && !this.isHeld()) this.startNextRound();
      } catch (err) {
        console.error(`[${this.def.meta.id}] next-round timer failed:`, err);
      }
    }, NEXT_DEAL_MS);
  }

  private stopNext(): void {
    if (this.nextTimer !== null) clearTimeout(this.nextTimer);
    this.nextTimer = null;
    this.nextEndsAt = 0;
    this.nextFor = -1;
    if (!this.betweenRounds()) this.nextVotes.clear();
  }

  private startNextRound(): void {
    this.stopNext();
    this.nextVotes.clear();
    this.session.startNextRound();
    this.afterMove();
  }

  // --- pausing and waiting -----------------------------------------------------

  /** Pausing and waiting are for friends: a private table, mid-match. */
  private canHold(): boolean {
    return !this.isPublic && this.started && !this.session.matchOver();
  }

  /** Does the table stand still for this seat's dropped connection? */
  private waitsFor(seat: number): boolean {
    return this.canHold() && this.session.humanSeats.has(seat);
  }

  protected isHeld(): boolean {
    return this.paused !== null || this.waiting.size > 0;
  }

  /**
   * Hand a seat to its bot - now, or the moment the table may move again.
   * setSeatHuman(false) runs the bots at once, so doing it during a hold would
   * play cards while everyone was told the table was standing still.
   */
  private handToBot(seat: number): void {
    if (this.isHeld()) this.gaveUp.add(seat);
    else this.session.setSeatHuman(seat, false);
  }

  /** Something about the hold changed: reschedule it, and let the table move if it may. */
  private holdChanged(): void {
    this.scheduleHold();
    if (!this.isHeld() && this.gaveUp.size > 0) {
      const seats = [...this.gaveUp];
      this.gaveUp.clear();
      for (const s of seats) this.session.setSeatHuman(s, false);
    }
    this.afterMove();
  }

  /**
   * One timer for whatever ends first: the pause running out, or a wait. Waits
   * do not run out during a pause - they are checked again when it ends.
   */
  private scheduleHold(): void {
    if (this.holdTimer !== null) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    const ends = this.paused !== null ? [this.paused.until] : [...this.waiting.values()];
    if (ends.length === 0) return;
    const at = Math.min(...ends);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      try {
        const now = Date.now();
        if (this.paused !== null && this.paused.until <= now) this.paused = null;
        if (this.paused === null) {
          for (const [s, until] of [...this.waiting]) {
            if (until <= now) {
              this.waiting.delete(s);
              this.gaveUp.add(s);
            }
          }
        }
        this.holdChanged();
      } catch (err) {
        console.error(`[${this.def.meta.id}] hold timer failed:`, err);
      }
    }, Math.max(0, at - Date.now()));
  }

  protected holdInfo(): HoldPublic | undefined {
    if (!this.isHeld()) return undefined;
    const now = Date.now();
    return {
      ...(this.paused !== null ? { paused: { by: this.paused.by, msLeft: Math.max(0, this.paused.until - now) } } : {}),
      waiting: [...this.waiting].map(([seat, until]) => ({ seat, msLeft: Math.max(0, until - now) })),
    };
  }

  /**
   * Who may do the host's things right now: the host, or - while the host's
   * connection is down - whoever is connected, in seat order. Their seat is
   * held for them now for a long time, and nobody else must be locked out of
   * starting, rematching or picking the clock meanwhile.
   */
  protected actingHostSeat(): number | null {
    const host = this.hostId === null ? null : this.seatOf(this.hostId);
    if (host !== null && this.occupants[host]!.connected) return host;
    const next = this.seats().find((s) => this.onLine(s));
    return next ?? host;
  }

  // --- the clock ----------------------------------------------------------------

  /** The people the table is waiting on right now. */
  private humanActors(): number[] {
    return this.session.actors().filter((s) => this.session.humanSeats.has(s));
  }

  /**
   * Is the decision in front of the table still the one the running clock was
   * armed for? Session.decisionId names it: for one seat on turn, the seat and
   * the move count; for a betting window, the window's own name, which stays
   * the same while seats bet and answer in it — so answering early or late
   * never restarts the clock for the others.
   */
  private sameDecision(): boolean {
    return this.turnTimer !== null && this.turnDecision === this.session.decisionId();
  }

  /** Nobody waits forever: a seat that stalls is played by its bot (or takes the game's default). */
  private armTimer(): void {
    // Nothing is on the clock until the table is actually playing.
    if (!this.started) {
      this.stopTimer();
      return;
    }
    if (this.humanActors().length === 0) {
      this.stopTimer();
      return;
    }
    // The SAME DECISION is still pending: leave that clock alone. afterMove()
    // runs on every publish, including an unrelated seat's disconnect, and
    // restarting here handed the actor a fresh clock each time.
    //
    // Keyed on the decision and not the seat, because a player often gets two
    // in a row — announce and then lead, or win a trick and lead the next. On a
    // seat key those two share one clock, and after a timeout (which leaves the
    // same seat on turn) nothing arms at all and the table stops dead.
    if (this.sameDecision()) return;
    this.stopTimer();

    this.turnEndsAt = Date.now() + this.turnMs;
    this.turnDecision = this.session.decisionId();
    this.turnActors = this.humanActors();
    this.turnTimer = setTimeout(() => {
      // Spend the handle FIRST: everything below re-enters armTimer, and a
      // stale non-null handle there reads as "a clock is already running".
      this.turnTimer = null;
      try {
        // Close the window only if it is still the one this clock was armed
        // for — a disconnect may have let a bot move on, and that seat gets its
        // own clock rather than having its move played early. Every person
        // still owed a decision takes the game's default (at Bela: the bot's
        // move for them, exactly as a timeout always played).
        if (this.humanActors().some((s) => this.turnActors.includes(s))) this.session.closeWindow();
      } catch (err) {
        // A throw here would otherwise escape to the process and leave the room
        // with no clock and a human on turn — the same freeze, by another road.
        console.error(`[${this.def.meta.id}] turn timer failed:`, err);
      }
      // Unconditionally: a room must never be left with a human on turn and
      // nothing armed.
      this.afterMove();
    }, this.turnMs);
  }

  private stopTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnEndsAt = 0;
    this.turnDecision = null;
    this.turnActors = [];
  }

  // --- publishing ----------------------------------------------------------

  /** A seat a clip goes to: a person on the line whose app plays voice clips. */
  private hearsVoice(seat: number): boolean {
    const o = this.occupants[seat]!;
    return o.sessionId !== null && o.connected && o.voice;
  }

  /** A connection gone for good: its rate limits go with it (they were never pruned). */
  private forget(sessionId: string | null): void {
    if (sessionId === null) return;
    this.lastEmoteAt.delete(sessionId);
    this.lastSitAt.delete(sessionId);
    this.lastVoteAt.delete(sessionId);
    this.lastGiftAt.delete(sessionId);
    this.voiceLimits.delete(sessionId);
  }

  /** A seat a gift can reach: a person whose app draws gifts, or no person at all. */
  private seesGifts(seat: number): boolean {
    const o = this.occupants[seat]!;
    return o.sessionId === null || o.gifts;
  }

  /** Every seat as the table sees it. */
  protected seatPublic(): SeatPublic[] {
    return this.occupants.map((o, i) => ({
      seat: i,
      name: o.name || `Igrač ${i + 1}`,
      avatar: o.avatar,
      connected: o.connected,
      bot: !this.session.humanSeats.has(i),
      ...(this.gifts[i] ? { gift: this.gifts[i]! } : {}),
      ...(this.seesGifts(i) ? { seesGifts: true as const } : {}),
      ...(o.sessionId !== null && o.voice ? { hearsVoice: true as const } : {}),
    }));
  }

  /** Where the table is: still filling, playing, or a match finished. */
  protected status(): 'waiting' | 'playing' | 'finished' {
    return this.session.matchOver() ? 'finished' : this.started ? 'playing' : 'waiting';
  }

  /** Who the running clock waits on and how long it has, or nothing when no clock runs. */
  protected windowPublic(): { seats: number[]; msLeft: number; totalMs: number } | undefined {
    if (this.turnEndsAt === 0) return undefined;
    const seats = this.humanActors().filter((s) => this.turnActors.includes(s));
    return { seats, msLeft: Math.max(0, this.turnEndsAt - Date.now()), totalMs: this.turnMs };
  }

  /** Rematch votes from people still on the line only. */
  protected liveRematchVotes(): number[] {
    return [...this.rematchVotes].filter((s) => this.onLine(s));
  }

  /**
   * Send each client its own view, and broadcast the (public) event stream.
   * Events are drained ONCE and shared; views are per seat.
   */
  protected publish(): void {
    // A game may keep some events off the wire: at Bela `declarationSkipped`
    // is only ever emitted for a seat that HAD something to declare, so
    // broadcasting it would tell the table exactly what staying quiet hides.
    const events = this.session.drainEvents().filter((e) => this.def.isEventPublic(e));
    const room = this.roomMessage(events);
    // Views first: a client must know its own seat before the event stream
    // arrives, or the first batch cannot be attributed to anyone.
    for (const client of this.clients) {
      const seat = this.seatOf(client.sessionId);
      if (seat === null) continue;
      const view = this.session.view(seat);
      // The deck is dealt when the room is created, but seats are still being
      // chosen — so a client could walk the free seats and read the deck
      // before anybody else arrived. The waiting room draws no cards, so
      // withholding them until the table locks costs nothing.
      client.send(MSG.view, { seat, view: this.started ? view : this.preStartView(view) });
    }
    this.broadcast(MSG.room, room);
  }

  override onDispose(): void {
    liveCodes.delete(this.roomId);
    this.stopTimer();
    this.stopNext();
    if (this.holdTimer !== null) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }
}
