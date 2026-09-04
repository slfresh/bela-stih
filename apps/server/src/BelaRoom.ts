import { randomInt } from 'node:crypto';
import { Room, type Client } from '@colyseus/core';
import type { Action, Seat } from '@belot/engine';
import { HARD_CONFIG_OVERRIDES, SEATS } from '@belot/engine';
import { Table } from '@belot/table';
import {
  EMOTE_GAP_MS,
  EMOTE_IDS,
  MSG,
  type ClientMessage,
  type EmoteMessage,
  type RoomMessage,
  type SeatInfo,
} from './protocol';

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

const TURN_MS = 30_000;
/** Shortest gap between two accepted seat changes from one connection. */
const SIT_GAP_MS = 250;
const RECONNECT_SECONDS = 60;

/**
 * The nickname is the one piece of free text shown to strangers, so strip
 * anything invisible or layout-breaking: control characters, zero-width and
 * bidi marks, runs of whitespace. What remains is what the player typed.
 */
function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

interface Occupant {
  sessionId: string | null;
  name: string;
  avatar: string;
  connected: boolean;
}

export class BelaRoom extends Room {
  override maxClients = 4;

  private table!: Table;
  private hard = false;
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
  private started = false;
  /**
   * Rate limits, keyed by CONNECTION rather than by seat: pre-start a client can
   * change seats freely, so a per-seat gap is one a seat-hopper multiplies.
   */
  private lastEmoteAt = new Map<string, number>();
  private lastSitAt = new Map<string, number>();

  override onCreate(options: { private?: boolean; hard?: boolean } = {}): void {
    this.occupants = SEATS.map(() => ({ sessionId: null, name: '', avatar: '', connected: false }));
    // "Prava bela" is the host's choice, and only on private tables — quick
    // play must stay predictable for strangers.
    this.hard = options.private === true && options.hard === true;
    // Four humans: nothing moves until a real player acts, or a timer fires.
    this.table = new Table({
      humanSeats: [...SEATS],
      config: this.hard ? HARD_CONFIG_OVERRIDES : undefined,
      // Table's default is `Date.now()`, which is fine for the CLI and for
      // offline play (dealer and player are the same device) and catastrophic
      // here: a seated client can recover a 31-bit timestamp seed from its own
      // six cards in about a second and then read every hand of every deal.
      seed: randomInt(0x7fffffff),
    });
    this.table.drainEvents();

    if (options.private) this.setPrivate(true);

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

  override onJoin(client: Client, options: { name?: string; avatar?: string } = {}): void {
    const seat = this.freeSeat();
    if (seat === null) {
      client.leave(4000, 'table full');
      return;
    }
    this.occupants[seat] = {
      sessionId: client.sessionId,
      name: cleanName(options.name) || `Igrač ${seat + 1}`,
      // Echoed verbatim to other clients, so keep it to a short safe token.
      avatar: typeof options.avatar === 'string' ? options.avatar.replace(/[^a-z]/g, '').slice(0, 20) : '',
      connected: true,
    };
    this.table.setSeatHuman(seat, true);
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
      this.started = true;
      this.lock();
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

    // Their departure may have been the last vote anybody was waiting on.
    if (this.maybeRematch()) return;

    // A deliberate leave frees the seat at once; a dropped connection is worth
    // holding it open for.
    if (consented === true) {
      this.release(seat);
      return;
    }
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
      this.occupants[seat]!.connected = true;
      this.occupants[seat]!.sessionId = client.sessionId;
      this.table.setSeatHuman(seat, true);
      this.publish();
    } catch {
      this.release(seat);
    }
  }

  private release(seat: Seat): void {
    const wasHost = this.occupants[seat]!.sessionId === this.hostId;
    this.occupants[seat] = { sessionId: null, name: '', avatar: '', connected: false };
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
    this.table.newMatch({ seed: randomInt(0x7fffffff) });
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
      const action = (packet.message as { action?: Action } | undefined)?.action;
      if (!action) return;
      // The sender may only ever move its own seat.
      if (action.seat !== seat) {
        client.send(MSG.error, { reason: 'not your seat' });
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
      this.occupants[seat] = { sessionId: null, name: '', avatar: '', connected: false };
      this.publish();
      return;
    }

    if (packet.type === 'start') {
      // The host (the table's creator) may start early; every empty seat
      // plays as a bot from here on. The table locks exactly as it does when
      // a fourth human sits down.
      if (client.sessionId !== this.hostId || this.started) return;
      for (const s of SEATS) {
        if (this.occupants[s]!.sessionId === null) this.table.setSeatHuman(s, false);
      }
      this.started = true;
      this.lock();
      this.afterMove();
      return;
    }

    if (packet.type === 'rematch' || packet.type === 'rematchCancel') {
      if (this.table.phase !== 'MATCH_OVER') return;
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
    // The same seat is still deciding: leave their clock alone. afterMove()
    // runs on every publish, including an unrelated seat's disconnect, and
    // restarting here handed the actor a fresh 30 seconds each time.
    if (this.turnTimer !== null && this.turnSeat === actor) return;
    this.stopTimer();

    this.turnEndsAt = Date.now() + TURN_MS;
    this.turnSeat = actor;
    this.turnTimer = setTimeout(() => {
      const seat = this.table.actor();
      if (seat === null || !this.table.humanSeats.has(seat)) return;
      // The turn moved on since this was armed (a disconnect let a bot play,
      // say) — do not play the NEW actor's card early; restart their clock.
      if (seat !== this.turnSeat) {
        this.afterMove();
        return;
      }
      // Exactly one bot move on their behalf. Toggling the human flag instead
      // ran the bots until the next HUMAN seat, which on a table whose only
      // human is this one meant playing out their entire remaining hand.
      this.table.botMoveFor(seat);
      this.afterMove();
    }, TURN_MS);
  }

  private stopTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnEndsAt = 0;
    this.turnSeat = null;
  }

  // --- publishing ----------------------------------------------------------

  private seatInfo(): SeatInfo[] {
    return this.occupants.map((o, i) => ({
      seat: i as Seat,
      name: o.name || `Igrač ${i + 1}`,
      avatar: o.avatar,
      connected: o.connected,
      bot: !this.table.humanSeats.has(i as Seat),
    }));
  }

  /**
   * Send each client its own view, and broadcast the (public) event stream.
   * Events are drained ONCE and shared; views are per seat.
   */
  private publish(): void {
    const events = this.table.drainEvents();
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
      ...(this.rematchVotes.size > 0 ? { rematchVotes: [...this.rematchVotes] } : {}),
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
