import type { Action, PublicView, Seat } from '@belot/engine';
import type { TableEvent } from '@belot/table';

/**
 * The wire protocol, in one file so the client and the room cannot drift.
 *
 * The shape enforces the security property: a client is only ever sent its OWN
 * `PublicView`, produced by the same `publicView()` the leak tests cover. Room
 * state is never broadcast, so opponents' cards have no path onto the wire.
 * Events ARE broadcast, and are safe by construction: a played card is public,
 * and a declaration carries value/length/top rank but never its cards.
 */

export const ROOM_NAME = 'bela';

/** Client -> server. */
export type ClientMessage =
  | { type: 'action'; action: Action }
  /** Host only (seat 0): start now, empty seats play as bots. */
  | { type: 'start' }
  /** Pre-start only: move to a free seat (how friends pick teams). */
  | { type: 'sit'; seat: Seat }
  /** Advance from a scored deal to the next one. */
  | { type: 'next' }
  /** A quick emote; relayed, rate-limited, never stored. */
  | { type: 'emote'; id: string }
  /**
   * A table gift from the fixed catalogue, to one other seat or to everyone
   * else at the table. Relayed and rate-limited; the room remembers each
   * seat's latest gift so a reconnect sees it. Coins never reach the server:
   * the sender's device pays, and the receiver gains nothing.
   */
  | { type: 'gift'; id: string; to: Seat | 'table' }
  /** After MATCH_OVER: this seat wants another match with the same people. */
  | { type: 'rematch' }
  /** Withdraw that ask. */
  | { type: 'rematchCancel' }
  /** Host only, after MATCH_OVER: start now, bots filling anyone who left. */
  | { type: 'rematchStart' };

/**
 * The fixed emote vocabulary. Anything else is dropped server-side, so free
 * text can never transit the room (no UGC obligations). Keep in step with
 * `apps/mobile/src/emotes.ts`, which owns how each id is rendered.
 */
export const EMOTE_IDS: readonly string[] = [
  'smile', 'laugh', 'wow', 'cry', 'clap', 'think',
  'bravo', 'brze', 'ajme', 'hvala',
];

/** Minimum gap between one seat's emotes. */
export const EMOTE_GAP_MS = 2500;

/**
 * The fixed gift vocabulary. Keep in step with `GIFT_IDS` in
 * `@belot/progression`, which owns prices and levels (a mobile test fails if
 * the two drift). The server needs only the ids: it never sees a wallet.
 */
export const GIFT_IDS: readonly string[] = [
  'kava', 'caj', 'limunada', 'rakija', 'pivo', 'gemist', 'burek', 'kolac',
  'sladoled', 'maramice', 'ruza', 'djetelina', 'potkova', 'pehar', 'kruna',
];

/**
 * Minimum gap between one connection's gifts. The client waits a second
 * longer, so network jitter never drops a gift somebody has already paid for.
 */
export const GIFT_GAP_MS = 7000;

/** Server -> everyone: a gift was given. A table gift is ONE message. */
export interface GiftMessage {
  from: Seat;
  to: Seat[];
  id: string;
}

/** Server -> everyone: someone emoted. */
export interface EmoteMessage {
  seat: Seat;
  id: string;
}

export interface SeatInfo {
  seat: Seat;
  name: string;
  /** Preset avatar id chosen client-side; empty string when none was sent. */
  avatar: string;
  connected: boolean;
  /** True while a bot is standing in for a dropped player. */
  bot: boolean;
  /** The latest gift given to this seat, while its player stays; absent when none. */
  gift?: string;
}

/** Server -> one client: everything that seat is entitled to see. */
export interface ViewMessage {
  seat: Seat;
  view: PublicView;
}

/** Server -> everyone: what just happened, and who is at the table. */
export interface RoomMessage {
  seats: SeatInfo[];
  /** 'waiting' until four seats are filled. */
  status: 'waiting' | 'playing' | 'finished';
  events: TableEvent[];
  /** Milliseconds left for the seat on turn, when a timer is running. */
  turnMsLeft?: number;
  /** Full length of a turn, so the client's ring scales correctly. */
  turnTotalMs?: number;
  /** True on "prava bela" tables: renons punishes and zvanja are blind. */
  hard?: boolean;
  /** Seat of the table's creator — the one who may start with bots. */
  hostSeat?: Seat;
  /** Matches won per team since this roster sat down. */
  series: [number, number];
  /** Matches finished at this table (0 during the first). */
  matchNumber: number;
  /** Seats that have asked for another match. Only meaningful at MATCH_OVER. */
  rematchVotes?: Seat[];
}

export const MSG = {
  view: 'view',
  room: 'room',
  error: 'error',
  emote: 'emote',
  gift: 'gift',
} as const;
