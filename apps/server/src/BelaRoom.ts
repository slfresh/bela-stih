import { randomBytes } from 'node:crypto';
import { Room, ServerError, type AuthContext, type Client } from '@colyseus/core';
import type { Action, Seat } from '@belot/engine';
import { HARD_CONFIG_OVERRIDES, RANKS, SEATS, SUITS } from '@belot/engine';
import type { Card, Rank, Rng, Suit } from '@belot/engine';
import { Table } from '@belot/table';
import {
  EMOTE_GAP_MS,
  EMOTE_IDS,
  GIFT_GAP_MS,
  GIFT_IDS,
  MSG,
  type ClientMessage,
  type EmoteMessage,
  type GiftMessage,
  type JoinGifts,
  type RoomMessage,
  type SeatInfo,
} from './protocol';
import { cleanName } from './names';

/**
 * An authoritative Bela table.
 *
 * The room owns the only real `Table`; clients own nothing. Every inbound action
 * is checked against the seat the sender actually holds and then handed to the
 * shared engine, which rejects anything illegal — the server trusts nothing.
 *
 * Two deliberate choices:
 *  - **State is never synced.** Each client is sent only its own `PublicView`,
 *    so another player's cards have no route onto the wire at all.
 *  - **A dropped player becomes a bot.** `Table` treats a seat as human-or-bot,
 *    so play carries on and the seat is handed back on reconnect.
 */

/**
 * Randomness with no seed behind it.
 *
 * Seeding a 32-bit generator from crypto does not help: mulberry32's whole
 * state is 32 bits, so the deal it produces is still one of 2^32 — a table an
 * opponent can precompute once and then look up from their own six cards. The
 * only fix is for the server's shuffle not to come from a small seed at all.
 */
function cryptoRng(): Rng {
  let pool = randomBytes(4096);
  let at = 0;
  return () => {
    if (at + 4 > pool.length) {
      pool = randomBytes(4096);
      at = 0;
    }
    const v = pool.readUInt32BE(at);
    at += 4;
    return v / 4294967296;
  };
}

const isSuit = (v: unknown): v is Suit => typeof v === 'string' && SUITS.includes(v as Suit);
const isRank = (v: unknown): v is Rank => typeof v === 'string' && RANKS.includes(v as Rank);

/**
 * Rebuild an action from a client message using only values this server names
 * itself.
 *
 * Validating in place is not enough: the engine stores what it is given, and a
 * `structuredClone` or a msgpack encode of an attacker-shaped object throws far
 * away from any handler that could catch it. Everything below is a fresh
 * literal built from checked primitives, so the client's object is dropped on
 * the floor whatever it contained.
 */
function cleanAction(raw: unknown, seat: Seat): Action | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  // A client may only ever move its own seat.
  if (a.seat !== seat) return null;
  switch (a.type) {
    case 'BID_PASS':
    case 'DOUBLE_KONTRA':
    case 'DOUBLE_REKONTRA':
    case 'DOUBLE_PASS':
    case 'DECLARE_SKIP':
      return { type: a.type, seat };
    case 'DECLARE_ANNOUNCE': {
      // The marked cards must survive the rebuild, or the engine cannot check
      // the claim against the hand — and in blind mode a wrong marking would
      // then succeed online while failing offline. Rebuilt card by card like
      // any other, so nothing the client sent arrives by reference.
      if (a.cards === undefined) return { type: 'DECLARE_ANNOUNCE', seat };
      if (!Array.isArray(a.cards) || a.cards.length > 8) return null;
      const cards: Card[] = [];
      for (const raw of a.cards) {
        if (typeof raw !== 'object' || raw === null) return null;
        const { suit, rank } = raw as Record<string, unknown>;
        if (!isSuit(suit) || !isRank(rank)) return null;
        cards.push({ suit, rank });
      }
      return { type: 'DECLARE_ANNOUNCE', seat, cards };
    }
    case 'BID_CALL':
      return isSuit(a.suit) ? { type: 'BID_CALL', seat, suit: a.suit } : null;
    case 'PLAY_CARD': {
      const c = a.card;
      if (typeof c !== 'object' || c === null) return null;
      const { suit, rank } = c as Record<string, unknown>;
      if (!isSuit(suit) || !isRank(rank)) return null;
      const card: Card = { suit, rank };
      return a.announceBela === true
        ? { type: 'PLAY_CARD', seat, card, announceBela: true }
        : { type: 'PLAY_CARD', seat, card };
    }
    default:
      return null;
  }
}

const TURN_MS = 30_000;
/** Shortest gap between two accepted seat changes from one connection. */
const SIT_GAP_MS = 250;
const RECONNECT_SECONDS = 60;

interface Occupant {
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
}

/** A chair nobody sits in. */
const vacant = (): Occupant => ({ sessionId: null, name: '', avatar: '', connected: false, origin: '', gifts: false });

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

export class BelaRoom extends Room {
  override maxClients = 4;

  private table!: Table;
  private hard = false;
  /** Public tables are the ones strangers are matched into. */
  private isPublic = true;
  /** The table's creator (first joiner); start-with-bots rights follow them. */
  private hostId: string | null = null;
  /** Matches won per team since these people sat down. */
  private series: [number, number] = [0, 0];
  private matchNumber = 0;
  /** Idempotence guard: afterMove() runs on every publish, the score once. */
  private lastRecordedMatch = -1;
  /** Seats that have asked for another match; cleared on each restart. */
  private readonly rematchVotes = new Set<Seat>();
  private occupants: Occupant[] = [];
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnEndsAt = 0;
  /** The seat the running timer was armed for, so a stale fire is detectable. */
  private turnSeat: Seat | null = null;
  /** Which DECISION that timer belongs to; see Table.moveCount. */
  private turnDecision: string | null = null;
  private started = false;
  /**
   * Rate limits, keyed by CONNECTION rather than by seat: pre-start a client can
   * change seats freely, so a per-seat gap is one a seat-hopper multiplies.
   */
  private lastEmoteAt = new Map<string, number>();
  private lastSitAt = new Map<string, number>();
  private lastVoteAt = new Map<string, number>();
  private lastGiftAt = new Map<string, number>();
  /**
   * Each seat's latest gift, by seat rather than by occupant: a seat played by
   * a bot from the start can be given one too. Cleared when the person in the
   * seat changes (a join, a release); kept while a dropped player is held, and
   * across a rematch, because it is still the same person at the table.
   */
  private gifts: (string | null)[] = [null, null, null, null];

  override onCreate(options: { private?: boolean; hard?: boolean } = {}): void {
    this.occupants = SEATS.map(vacant);
    // "Prava bela" is the host's choice, and only on private tables — quick
    // play must stay predictable for strangers.
    this.hard = options.private === true && options.hard === true;
    // Four humans: nothing moves until a real player acts, or a timer fires.
    this.table = new Table({
      humanSeats: [...SEATS],
      config: this.hard ? HARD_CONFIG_OVERRIDES : undefined,
      // No seed at all. Table's default is `Date.now()`, which is fine for the
      // CLI and offline play (dealer and player are the same device) and
      // catastrophic here — but so is any 32-bit seed, crypto or not, because
      // the generator behind it only has 32 bits of state to hide in.
      rng: cryptoRng(),
    });
    this.table.drainEvents();

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
        this.handle(client, { type, message } as never);
      } catch (err) {
        // One malformed frame must cost the sender an error and nothing else.
        // Every room on this host shares a process; an escape here ends them all.
        console.error(`[bela] message ${String(type)} failed:`, err);
        client.send(MSG.error, { reason: 'bad message' });
      }
    });
  }

  // --- seating -------------------------------------------------------------

  private seatOf(sessionId: string): Seat | null {
    const i = this.occupants.findIndex((o) => o.sessionId === sessionId);
    return i < 0 ? null : (i as Seat);
  }

  private freeSeat(): Seat | null {
    // Partner-first order: the second joiner sits ACROSS from the host (0 and
    // 2 are a team), so two friends and two bots is partners by default.
    for (const s of [0, 2, 1, 3] as Seat[]) {
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
  override onAuth(_client: Client, _options: unknown, context: AuthContext): { origin: string } {
    const origin = originOf(context);
    const clash =
      this.isPublic &&
      !this.started &&
      origin !== '' &&
      this.occupants.some((o) => o.sessionId !== null && o.connected && o.origin === origin);
    if (clash) throw new ServerError(SAME_ORIGIN_CODE, 'seat already held from here');
    return { origin };
  }

  override onJoin(client: Client, options: { name?: string; avatar?: string } & JoinGifts = {}): void {
    const seat = this.freeSeat();
    if (seat === null) {
      client.leave(4000, 'table full');
      return;
    }
    this.occupants[seat] = {
      origin: (client.auth as { origin?: string } | undefined)?.origin ?? '',
      sessionId: client.sessionId,
      // Just what they gave: seatInfo names an empty one by the chair it is in
      // at the time, so a move in the lobby cannot carry the old chair's number.
      name: cleanName(options.name),
      // Echoed verbatim to other clients, so keep it to a short safe token.
      avatar: typeof options.avatar === 'string' ? options.avatar.replace(/[^a-z]/g, '').slice(0, 20) : '',
      connected: true,
      gifts: options.gifts === true,
    };
    this.table.setSeatHuman(seat, true);
    this.gifts[seat] = null;
    if (this.hostId === null) this.hostId = client.sessionId;

    // The series belongs to the people who sat down together, so a NEW face
    // resets it. A reconnect never lands here (it goes through
    // allowReconnection), so a dropped player keeps the tally.
    if (this.started) {
      this.series = [0, 0];
      this.matchNumber = 0;
      this.lastRecordedMatch = -1;
    }

    if (!this.started && this.occupants.every((o) => o.sessionId !== null)) {
      this.lockTable();
      // The opening bidder is on the clock from the very first move — without
      // this, an AFK first player would hang the table forever.
      this.armTimer();
    }
    this.publish();
  }

  override async onLeave(client: Client, consented?: boolean): Promise<void> {
    const seat = this.seatOf(client.sessionId);
    if (seat === null) return;

    this.occupants[seat]!.connected = false;
    if (this.started) {
      // The seat keeps playing as a bot while we wait for them back. The bot
      // may move immediately, so re-arm the clock for whoever is on turn now.
      this.table.setSeatHuman(seat, false);
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
      await this.allowReconnection(client, RECONNECT_SECONDS);
      this.occupants[seat]!.connected = true;
      this.occupants[seat]!.sessionId = client.sessionId;
      this.table.setSeatHuman(seat, true);
      // Coming back changes the connected-human set exactly as leaving did, so
      // a vote that was waiting on somebody else can now be complete.
      if (!this.maybeRematch()) this.publish();
    } catch {
      this.release(seat);
    }
  }

  private release(seat: Seat): void {
    const wasHost = this.occupants[seat]!.sessionId === this.hostId;
    this.occupants[seat] = vacant();
    // The person has gone for good; their gift goes with them.
    this.gifts[seat] = null;
    // A seat nobody is sitting in cannot be waited on for a rematch vote.
    this.rematchVotes.delete(seat);
    if (this.started) this.table.setSeatHuman(seat, false);
    // The crown passes to whoever is still seated.
    if (wasHost) this.hostId = this.occupants.find((o) => o.sessionId !== null)?.sessionId ?? null;
    if (this.maybeRematch()) return;
    if (this.started) this.afterMove();
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
    if (this.table.phase !== 'MATCH_OVER' || !this.everyHumanVoted()) return false;
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
   * full 30 seconds for everyone else until the hold lapsed.
   */
  private lockTable(): void {
    for (const s of SEATS) {
      const o = this.occupants[s]!;
      this.table.setSeatHuman(s, o.sessionId !== null && o.connected);
    }
    this.started = true;
    this.lock();
  }

  /** Every connected human still at the table has asked for another match. */
  private everyHumanVoted(): boolean {
    const humans = SEATS.filter(
      (s) => this.occupants[s]!.sessionId !== null && this.occupants[s]!.connected,
    );
    return humans.length > 0 && humans.every((s) => this.rematchVotes.has(s));
  }

  private beginRematch(): void {
    // A seat that is still occupied and connected stays HUMAN whatever it
    // voted — the vote gates the START, it never takes somebody's cards away.
    // Empty and dropped seats become bots, exactly as at table creation.
    for (const s of SEATS) {
      const o = this.occupants[s]!;
      this.table.setSeatHuman(s, o.sessionId !== null && o.connected);
    }
    this.rematchVotes.clear();
    this.matchNumber += 1;
    // The Table keeps the injected generator, so the new deck is drawn the
    // same way the first one was.
    this.table.newMatch();
    this.afterMove();
  }

  // --- play ----------------------------------------------------------------

  private handle(client: Client, packet: { type: string; message: ClientMessage }): void {
    const seat = this.seatOf(client.sessionId);
    if (seat === null) return;

    if (packet.type === 'action') {
      // Every other branch is gated on `started` or on a phase. Without this a
      // third joiner can bid before the fourth player exists, and the fourth
      // arrives bound to a contract they never saw.
      if (!this.started) return;
      const raw = (packet.message as { action?: unknown } | undefined)?.action;
      // Rebuilt field by field from primitives, so no object a client sent can
      // reach the engine or the authoritative state by reference. A well-typed
      // action carrying a hostile VALUE was enough to poison a room and, at the
      // next publish, take the whole process down.
      const action = cleanAction(raw, seat);
      if (!action) {
        client.send(MSG.error, { reason: 'malformed action' });
        return;
      }
      try {
        this.table.submit(action);
      } catch (err) {
        // The engine rejects anything illegal; tell the client and carry on.
        client.send(MSG.error, { reason: (err as Error).message });
        return;
      }
      this.afterMove();
      return;
    }

    if (packet.type === 'sit') {
      // Before the game starts, anyone may move to a free seat — that is how
      // friends pick teams. No state has advanced yet, so it is a pure swap.
      const target = (packet.message as { seat?: Seat } | undefined)?.seat;
      if (this.started) return;
      // Number.isInteger also rejects NaN and any non-number, so a fractional
      // seat can no longer index past the end of `occupants` and throw.
      if (!Number.isInteger(target) || target! < 0 || target! > 3 || target === seat) return;
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

    if (packet.type === 'start') {
      // The host (the table's creator) may start early; every empty seat
      // plays as a bot from here on. The table locks exactly as it does when
      // a fourth human sits down.
      if (client.sessionId !== this.hostId || this.started) return;
      this.lockTable();
      this.afterMove();
      return;
    }

    if (packet.type === 'rematch' || packet.type === 'rematchCancel') {
      if (this.table.phase !== 'MATCH_OVER') return;
      // Each one republishes to every client, so it needs the same gap `sit` has.
      const votedAt = Date.now();
      if (votedAt - (this.lastVoteAt.get(client.sessionId) ?? 0) < SIT_GAP_MS) return;
      this.lastVoteAt.set(client.sessionId, votedAt);
      if (packet.type === 'rematch') this.rematchVotes.add(seat);
      else this.rematchVotes.delete(seat);
      if (packet.type === 'rematch' && this.everyHumanVoted()) this.beginRematch();
      else this.publish();
      return;
    }

    if (packet.type === 'rematchStart') {
      // The host can start without a full house; anyone who left is botted.
      if (client.sessionId !== this.hostId || this.table.phase !== 'MATCH_OVER') return;
      this.beginRematch();
      return;
    }

    if (packet.type === 'next') {
      if (this.table.phase === 'DEAL_OVER') {
        this.table.startNextDeal();
        this.afterMove();
      }
      return;
    }

    if (packet.type === 'emote') {
      // Fixed vocabulary + a per-seat gap; anything else is silently dropped.
      const id = (packet.message as { id?: string } | undefined)?.id;
      if (typeof id !== 'string' || !EMOTE_IDS.includes(id)) return;
      const now = Date.now();
      if (now - (this.lastEmoteAt.get(client.sessionId) ?? 0) < EMOTE_GAP_MS) return;
      this.lastEmoteAt.set(client.sessionId, now);
      const msg: EmoteMessage = { seat, id };
      this.broadcast(MSG.emote, msg);
      return;
    }

    if (packet.type === 'gift') {
      // Only at a table that is playing: the lobby draws no pucks to land on,
      // and its seats still change hands.
      if (!this.started) return;
      const m = packet.message as { id?: unknown; to?: unknown } | undefined;
      const id = m?.id;
      if (typeof id !== 'string' || !GIFT_IDS.includes(id)) return;
      // One other seat, or everyone else. Anything else — the sender's own
      // seat, 7, '1', 'everyone' — is dropped and does not count as a send.
      let to: Seat[];
      if (m?.to === 'table') {
        to = SEATS.filter((s) => s !== seat);
      } else if (Number.isInteger(m?.to) && (m!.to as number) >= 0 && (m!.to as number) <= 3 && m!.to !== seat) {
        to = [m!.to as Seat];
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
      const msg: GiftMessage = { from: seat, to, id };
      // Broadcast only: no publish(), so a gift never re-sends views or wakes a
      // director. The badge rides along in SeatInfo on the next publish, which
      // is what a reconnecting player reads.
      this.broadcast(MSG.gift, msg);
    }
  }

  private afterMove(): void {
    // Score the series exactly once per match, however many publishes follow.
    if (this.table.phase === 'MATCH_OVER' && this.lastRecordedMatch !== this.matchNumber) {
      this.lastRecordedMatch = this.matchNumber;
      this.series[this.table.winner()!] += 1;
    }
    if (this.table.phase === 'MATCH_OVER') this.stopTimer();
    else this.armTimer();
    this.publish();
  }

  /** Nobody waits forever: a seat that stalls is played by its bot. */
  private armTimer(): void {
    // Nothing is on the clock until the table is actually playing.
    if (!this.started) {
      this.stopTimer();
      return;
    }
    const actor = this.table.actor();
    if (actor === null || !this.table.humanSeats.has(actor)) {
      this.stopTimer();
      return;
    }
    // The SAME DECISION is still pending: leave that clock alone. afterMove()
    // runs on every publish, including an unrelated seat's disconnect, and
    // restarting here handed the actor a fresh 30 seconds each time.
    //
    // Keyed on the decision and not the seat, because a player often gets two
    // in a row — announce and then lead, or win a trick and lead the next. On a
    // seat key those two share one 30 seconds, and after a timeout (which
    // leaves the same seat on turn) nothing arms at all and the table stops
    // dead for everybody.
    const decision = `${actor}:${this.table.moveCount}`;
    if (this.turnTimer !== null && this.turnDecision === decision) return;
    this.stopTimer();

    this.turnEndsAt = Date.now() + TURN_MS;
    this.turnSeat = actor;
    this.turnDecision = decision;
    this.turnTimer = setTimeout(() => {
      // Spend the handle FIRST: everything below re-enters armTimer, and a
      // stale non-null handle there reads as "a clock is already running".
      this.turnTimer = null;
      try {
        const seat = this.table.actor();
        // Play one move only if the turn is still where it was when we armed —
        // a disconnect may have let a bot move on, and that seat gets its own
        // clock rather than having its card played early.
        if (seat !== null && seat === this.turnSeat && this.table.humanSeats.has(seat)) {
          this.table.botMoveFor(seat);
        }
      } catch (err) {
        // A throw here would otherwise escape to the process and leave the room
        // with no clock and a human on turn — the same freeze, by another road.
        console.error('[bela] turn timer failed:', err);
      }
      // Unconditionally: a room must never be left with a human on turn and
      // nothing armed.
      this.afterMove();
    }, TURN_MS);
  }

  private stopTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnEndsAt = 0;
    this.turnSeat = null;
    this.turnDecision = null;
  }

  // --- publishing ----------------------------------------------------------

  /** A seat a gift can reach: a person whose app draws gifts, or no person at all. */
  private seesGifts(seat: Seat): boolean {
    const o = this.occupants[seat]!;
    return o.sessionId === null || o.gifts;
  }

  private seatInfo(): SeatInfo[] {
    return this.occupants.map((o, i) => ({
      seat: i as Seat,
      name: o.name || `Igrač ${i + 1}`,
      avatar: o.avatar,
      connected: o.connected,
      bot: !this.table.humanSeats.has(i as Seat),
      ...(this.gifts[i] ? { gift: this.gifts[i]! } : {}),
      ...(this.seesGifts(i as Seat) ? { seesGifts: true as const } : {}),
    }));
  }

  /**
   * Send each client its own view, and broadcast the (public) event stream.
   * Events are drained ONCE and shared; views are per seat.
   */
  private publish(): void {
    const votes = [...this.rematchVotes].filter(
      (s) => this.occupants[s]!.sessionId !== null && this.occupants[s]!.connected,
    );
    // `declarationSkipped` is only ever emitted for a seat that HAD something to
    // declare — completeDeal settles the empty-handed ones silently — so
    // broadcasting it tells the table exactly what staying quiet is meant to
    // hide. Nothing renders it (the CLI returns null for it by design), so it
    // simply does not go on the wire.
    const events = this.table.drainEvents().filter((e) => e.kind !== 'declarationSkipped');
    const room: RoomMessage = {
      seats: this.seatInfo(),
      status:
        this.table.phase === 'MATCH_OVER'
          ? 'finished'
          : this.started
            ? 'playing'
            : 'waiting',
      events,
      ...(this.turnEndsAt > 0
        ? { turnMsLeft: Math.max(0, this.turnEndsAt - Date.now()), turnTotalMs: TURN_MS }
        : {}),
      ...(this.hard ? { hard: true } : {}),
      series: [this.series[0], this.series[1]],
      matchNumber: this.matchNumber,
      // Only votes from people still on the line: a dropped player's vote left
      // the client's outstanding count pinned at 0, so it hid both "Play again"
      // and "Start anyway" while a real non-voter was still sitting there.
      ...(votes.length > 0 ? { rematchVotes: votes } : {}),
      ...(this.hostId !== null && this.seatOf(this.hostId) !== null
        ? { hostSeat: this.seatOf(this.hostId)! }
        : {}),
    };
    // Views first: a client must know its own seat before the event stream
    // arrives, or the first batch cannot be attributed to anyone.
    for (const client of this.clients) {
      const seat = this.seatOf(client.sessionId);
      if (seat === null) continue;
      const view = this.table.view(seat);
      // The deck is dealt when the room is created, but seats are still being
      // chosen — so a client could walk the free seats and read three quarters
      // of the deck before anybody else arrived. The waiting room draws no
      // cards, so withholding them until the table locks costs nothing.
      client.send(MSG.view, {
        seat,
        view: this.started ? view : { ...view, hand: [], myDeclarations: [], legalActions: [] },
      });
    }
    this.broadcast(MSG.room, room);
  }

  override onDispose(): void {
    this.stopTimer();
  }
}
