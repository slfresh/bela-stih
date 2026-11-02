import type { Client } from '@colyseus/core';
import type { Seat } from '@belot/engine';
import { DEFAULT_CONFIG, DOUBLE_WIN_TARGET, HARD_CONFIG_OVERRIDES, matchWins, type EngineConfig, type PublicView } from '@belot/engine';
import { BELA, type TableEvent } from '@belot/games-bela';
import { isBotLevel } from '@belot/bots';
import { MATCH_TARGETS, NEXT_DEAL_MS, type HoldInfo, type RoomMessage, type SeatInfo, isPlayMode, modeFromLegacy, type PlayMode } from './protocol';
import { GameRoom, TURN_MS, type CreateOptions } from './room/GameRoom';

export { SAME_ORIGIN_CODE } from './room/GameRoom';

/**
 * An authoritative Bela table.
 *
 * Everything a card table does whatever is played on it — seats, reconnects,
 * pausing, clocks, the next-deal countdown, rematches, emotes, gifts, voice —
 * is `GameRoom`'s (room/GameRoom.ts). This room adds what is Bela's: the three
 * versions, the match length, the double-win rule, and the room message the
 * shipped apps read, field for field as it has always been.
 */

/** Each version as the engine's own switches (the rules themselves are untouched). */
const MODE_CONFIG: Record<PlayMode, Partial<EngineConfig>> = {
  learn: {},
  easy: { declarationMode: 'blind' },
  hard: HARD_CONFIG_OVERRIDES,
};

export class BelaRoom extends GameRoom<typeof BELA> {
  protected readonly def = BELA;

  /** The version played: quick play is Lagana; a private table's host picks. */
  private mode: PlayMode = 'easy';
  /** Points the match is played to: quick play's 1001, or what a private table's host chose. */
  private target = DEFAULT_CONFIG.matchTarget;
  /** The double-win rule (protocol.ts): a private table's host may switch it on, and only at 1001. */
  private doubleWin = false;

  protected override readOptions(options: CreateOptions & { mode?: unknown; hard?: unknown; target?: unknown; modes?: unknown; doubleWin?: unknown; botLevel?: unknown }): void {
    // The version and a shorter match are the host's choice, and only on
    // private tables - quick play must stay predictable for strangers. The
    // host may change both in the lobby, until the start. A table asked for
    // under ROOM_NAME_MODES (`modes`) is Lagana unless its host says
    // otherwise; one asked for by an app from before the three versions plays
    // what that app always played - zvanja announced - unless its `hard` says
    // Prava bela.
    const standard: PlayMode = options.modes === true ? 'easy' : 'learn';
    this.mode =
      options.private === true
        ? isPlayMode(options.mode)
          ? options.mode
          : (modeFromLegacy(options.hard) ?? standard)
        : standard;
    if (options.private === true && typeof options.target === 'number' && MATCH_TARGETS.includes(options.target)) {
      this.target = options.target;
    }
    // The double win is the host's too, and only for the full game.
    if (options.private === true && options.doubleWin === true && this.target === DOUBLE_WIN_TARGET) {
      this.doubleWin = true;
    }
    // And the strength of the bots that fill a seat; strangers get the middle one.
    if (options.private === true && isBotLevel(options.botLevel)) this.botLevel = options.botLevel;
  }

  /** Bela's clocks are the protocol's, as the shipped apps were built around them. */
  protected override startTurnMs(): number {
    return TURN_MS;
  }
  protected override nextRoundMs(): number {
    return NEXT_DEAL_MS;
  }

  /**
   * Bela's own apps name no games and are seated as they always were. An app
   * that names the games it plays (the 'More games' join) is seated only if
   * Bela is one of them: a code typed there for a Bela table is refused, not
   * turned into a seat at a table it cannot show.
   */
  protected override playsThisGame(games: unknown): boolean {
    return games === undefined || (Array.isArray(games) && games.includes('bela'));
  }

  protected override sessionConfig(): Partial<EngineConfig> {
    return { ...MODE_CONFIG[this.mode], matchTarget: this.target, doubleWinBelow500: this.doubleWin };
  }

  /** One match, or two under the double-win rule. */
  protected override matchCredit(): number {
    return matchWins(this.session.state);
  }

  /** The waiting room draws no cards: the hand and what it could declare stay off the wire until the table locks. */
  protected override preStartView(view: PublicView): PublicView {
    return { ...view, hand: [], myDeclarations: [], legalActions: [] };
  }

  protected override handleGameMessage(_client: Client, seat: number, type: string, message: unknown): boolean {
    if (type !== 'rules') return false;
    // The same four conditions as the clock: before the start, a private
    // table, its host, and only what is offered.
    const m = message as
      | { target?: unknown; mode?: unknown; hard?: unknown; voice?: unknown; doubleWin?: unknown; botLevel?: unknown }
      | undefined;
    if (this.started || this.isPublic || seat !== this.actingHostSeat()) return true;
    // Voice on or off changes nothing on the table itself: no rebuild.
    const voiceChanged = typeof m?.voice === 'boolean' && m.voice !== this.voiceOn;
    if (voiceChanged) this.voiceOn = m!.voice as boolean;
    let changed = false;
    if (typeof m?.target === 'number' && MATCH_TARGETS.includes(m.target) && m.target !== this.target) {
      this.target = m.target;
      changed = true;
    }
    // The double win is defined for the full game only: a shorter match
    // drops it, and asking for it at one is ignored.
    if (this.target !== DOUBLE_WIN_TARGET && this.doubleWin) {
      this.doubleWin = false;
      changed = true;
    }
    if (typeof m?.doubleWin === 'boolean' && this.target === DOUBLE_WIN_TARGET && m.doubleWin !== this.doubleWin) {
      this.doubleWin = m.doubleWin;
      changed = true;
    }
    // The version by name, or an older app's `hard` switch.
    const mode = isPlayMode(m?.mode) ? m.mode : modeFromLegacy(m?.hard);
    if (mode !== null && mode !== this.mode) {
      this.mode = mode;
      changed = true;
    }
    // The strength of the bots that fill a seat.
    if (isBotLevel(m?.botLevel) && m.botLevel !== this.botLevel) {
      this.botLevel = m.botLevel;
      changed = true;
    }
    if (changed) this.buildSession();
    if (changed || voiceChanged) this.publish();
    return true;
  }

  /** The room message as the shipped apps read it, field for field. */
  protected override roomMessage(events: TableEvent[]): RoomMessage {
    const votes = this.liveRematchVotes() as Seat[];
    const host = this.actingHostSeat() as Seat | null;
    return {
      seats: this.seatPublic() as SeatInfo[],
      status: this.status(),
      events,
      ...(this.turnEndsAt > 0
        ? { turnMsLeft: Math.max(0, this.turnEndsAt - Date.now()), turnTotalMs: this.turnMs }
        : {}),
      turnSeconds: this.turnMs / 1000,
      target: this.target,
      ...(this.isPublic ? {} : { private: true as const }),
      ...(this.voiceOn ? { voice: true as const } : {}),
      ...(this.doubleWin ? { doubleWin: true as const } : {}),
      botLevel: this.botLevel,
      ...(this.isHeld() ? { hold: this.holdInfo()! as HoldInfo } : {}),
      ...(this.nextEndsAt > 0 ? { nextMsLeft: Math.max(0, this.nextEndsAt - Date.now()) } : {}),
      ...(this.betweenRounds() && this.nextVotes.size > 0 ? { nextVotes: [...this.nextVotes] as Seat[] } : {}),
      mode: this.mode,
      // Older apps read only this: blind zvanja for them too.
      ...(this.mode !== 'learn' ? { hard: true } : {}),
      series: [this.series[0]!, this.series[1]!],
      matchNumber: this.matchNumber,
      // Only votes from people still on the line: a dropped player's vote left
      // the client's outstanding count pinned at 0, so it hid both "Play again"
      // and "Start anyway" while a real non-voter was still sitting there.
      ...(votes.length > 0 ? { rematchVotes: votes } : {}),
      // Whoever may do the host's things right now, so the right person sees
      // "start" and "start anyway" while the host is off the line.
      ...(host !== null ? { hostSeat: host } : {}),
    };
  }
}
