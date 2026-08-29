import { Room, type Client } from '@colyseus/core';
import type { Action, Seat } from '@belot/engine';
import { SEATS } from '@belot/engine';
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
  private occupants: Occupant[] = [];
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnEndsAt = 0;
  /** The seat the running timer was armed for, so a stale fire is detectable. */
  private turnSeat: Seat | null = null;
  private started = false;
  /** Last emote per seat, for the rate limit. */
  private lastEmoteAt = [0, 0, 0, 0];

  override onCreate(options: { private?: boolean } = {}): void {
    this.occupants = SEATS.map(() => ({ sessionId: null, name: '', avatar: '', connected: false }));
    // Four humans: nothing moves until a real player acts, or a timer fires.
    this.table = new Table({ humanSeats: [...SEATS] });
    this.table.drainEvents();

    if (options.private) this.setPrivate(true);

    this.onMessage('*', (client: Client, type: string | number, message: unknown) => {
      this.handle(client, { type, message } as never);
    });
  }

  // --- seating -------------------------------------------------------------

  private seatOf(sessionId: string): Seat | null {
    const i = this.occupants.findIndex((o) => o.sessionId === sessionId);
    return i < 0 ? null : (i as Seat);
  }

  private freeSeat(): Seat | null {
    const i = this.occupants.findIndex((o) => o.sessionId === null);
    return i < 0 ? null : (i as Seat);
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

    // The seat keeps playing as a bot while we wait for them back. The bot
    // may move immediately, so re-arm the clock for whoever is on turn now.
    this.occupants[seat]!.connected = false;
    this.table.setSeatHuman(seat, false);
    this.afterMove();

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
    this.occupants[seat] = { sessionId: null, name: '', avatar: '', connected: false };
    this.table.setSeatHuman(seat, false);
    this.afterMove();
  }

  // --- play ----------------------------------------------------------------

  private handle(client: Client, packet: { type: string; message: ClientMessage }): void {
    const seat = this.seatOf(client.sessionId);
    if (seat === null) return;

    if (packet.type === 'action') {
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
      if (now - this.lastEmoteAt[seat]! < EMOTE_GAP_MS) return;
      this.lastEmoteAt[seat] = now;
      const msg: EmoteMessage = { seat, id };
      this.broadcast(MSG.emote, msg);
    }
  }

  private afterMove(): void {
    if (this.table.phase === 'MATCH_OVER') this.stopTimer();
    else this.armTimer();
    this.publish();
  }

  /** Nobody waits forever: a seat that stalls is played by its bot. */
  private armTimer(): void {
    this.stopTimer();
    const actor = this.table.actor();
    if (actor === null || !this.table.humanSeats.has(actor)) return;

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
      // Hand the seat to its bot for one move, then give it straight back.
      this.table.setSeatHuman(seat, false);
      this.table.setSeatHuman(seat, true);
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
    };
    // Views first: a client must know its own seat before the event stream
    // arrives, or the first batch cannot be attributed to anyone.
    for (const client of this.clients) {
      const seat = this.seatOf(client.sessionId);
      if (seat === null) continue;
      client.send(MSG.view, { seat, view: this.table.view(seat) });
    }
    this.broadcast(MSG.room, room);
  }

  override onDispose(): void {
    this.stopTimer();
  }
}
