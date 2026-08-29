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
  /** Advance from a scored deal to the next one. */
  | { type: 'next' }
  /** A quick emote; relayed, rate-limited, never stored. */
  | { type: 'emote'; id: string };

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
}

export const MSG = {
  view: 'view',
  room: 'room',
  error: 'error',
  emote: 'emote',
} as const;
