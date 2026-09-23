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
  /**
   * Ready for the next deal. It starts when every connected player is ready,
   * or by itself when NEXT_DEAL_MS has run out - never on one player's press.
   */
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
  | { type: 'rematchStart' }
  /** Private tables, during a match: stop the table for everyone (a call, a break). */
  | { type: 'pause' }
  /** Anyone at the table: carry on after a pause. */
  | { type: 'resume' }
  /** Stop waiting for a dropped player: a bot holds their cards until they are back. */
  | { type: 'playOn' }
  /** Host, private table, before the start: the turn clock in seconds (one of TURN_CHOICES). */
  | { type: 'clock'; seconds: number }
  /**
   * Host, private table, before the start: how long the match runs (one of
   * MATCH_TARGETS) and whether it is Prava bela. Either may be left out.
   */
  | { type: 'rules'; target?: number; hard?: boolean }
  /**
   * Private tables: this player's app went to the background - a phone call
   * that did not drop the connection. The table waits for them exactly as for
   * a dropped one, instead of letting the turn clock play their cards.
   */
  | { type: 'away' }
  /** ...and is back. */
  | { type: 'back' };

/** Turn clocks a private table's host may choose, in seconds. Quick play keeps the first. */
export const TURN_CHOICES: readonly number[] = [30, 60, 90];

/**
 * Match lengths a private table's host may choose. Quick play keeps the last:
 * 1001, the full game, the same for every stranger.
 */
export const MATCH_TARGETS: readonly number[] = [501, 701, 1001];

/**
 * How long a scored deal's sheet stays up before the next deal starts by
 * itself: ten seconds to read it, plus the three the app spends showing the
 * last trick land before the sheet appears (the clock starts when the deal is
 * scored, and players were getting about seven).
 */
export const NEXT_DEAL_MS = 13_000;

/**
 * How long a private table stands still for a player whose connection dropped
 * - a phone call, a tunnel - before a bot takes their cards. Anyone at the
 * table can stop waiting sooner (playOn).
 */
export const WAIT_FOR_DROPPED_MS = 10 * 60_000;

/** The longest a pause lasts before the table carries on by itself. */
export const PAUSE_MAX_MS = 30 * 60_000;

/** A private table standing still, and why. */
export interface HoldInfo {
  /** A player paused it; it carries on by itself when msLeft runs out. */
  paused?: { by: Seat; msLeft: number };
  /** Players whose connection dropped, each with how long they are still waited for. */
  waiting: { seat: Seat; msLeft: number }[];
}

/**
 * The fixed emote vocabulary. Anything else is dropped server-side, so free
 * text can never transit the room (no UGC obligations). Keep in step with
 * `apps/mobile/src/emotes.ts`, which owns how each id is rendered.
 */
export const EMOTE_IDS: readonly string[] = [
  'smile', 'laugh', 'wow', 'cry', 'clap', 'think',
  'bravo', 'brze', 'ajme', 'hvala',
  // An older app draws nothing for an id it does not know (emoteText is '').
  'dobro', 'ups', 'idemo',
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

/**
 * Client -> server join options, beyond name and avatar: an app that draws
 * table gifts says so. Older apps send nothing, and are never sent a gift.
 */
export interface JoinGifts {
  gifts?: boolean;
}

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
  /**
   * This seat can be given a gift: its player's app draws them (it joined
   * with `gifts: true`), or no person sits there. Absent for an older app,
   * which never sees one — the room drops such a seat from every gift, so
   * nobody pays for a present its receiver cannot see.
   */
  seesGifts?: true;
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
  /** The table's turn clock in seconds; a private table's host may change it before the start. */
  turnSeconds?: number;
  /** Points the match is played to; a private table's host may change it before the start. */
  target?: number;
  /** A private table (friends, by code): only there does it pause and wait. */
  private?: true;
  /** Present while the table stands still: paused, or waiting for a dropped player. */
  hold?: HoldInfo;
  /** At DEAL_OVER: milliseconds until the next deal starts by itself. */
  nextMsLeft?: number;
  /** At DEAL_OVER: the seats that are ready for the next deal. */
  nextVotes?: Seat[];
}

export const MSG = {
  view: 'view',
  room: 'room',
  error: 'error',
  emote: 'emote',
  gift: 'gift',
} as const;
