import * as Haptics from 'expo-haptics';
import { teamOf, type Seat } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import {
  applyDealOutcome,
  applyMatchOutcome,
  type Award,
  type PlayerProfile,
} from '@belot/progression';
import { playSfx, type PlayOptions, type Sfx } from './audio';

/**
 * Turns the table's event stream into sound, haptics and rewards.
 *
 * Shared by offline and online on purpose: the server emits exactly the same
 * `TableEvent`s the local table does, so a player earns XP and coins the same
 * way in both modes without a second implementation to keep in step.
 */

/**
 * The events that make no sound of their own. Listed so a test can insist
 * that every other kind does — a new event kind that nobody scored is
 * otherwise a silence nobody notices.
 */
export const SILENT_EVENTS: readonly TableEvent['kind'][] = ['declarationSkipped', 'matchStarted'];

/** What the player did this deal, accumulated from events as they arrive. */
export interface DealTally {
  zvanja: number;
  bela: boolean;
}

export const emptyTally = (): DealTally => ({ zvanja: 0, bela: false });

/** Merge a deal award and a match award into one banner. */
export function mergeAward(a: Award | null, b: Award): Award {
  if (!a) return b;
  return {
    xp: a.xp + b.xp,
    coins: a.coins + b.coins,
    levelUp: b.levelUp ?? a.levelUp,
    reasons: [...a.reasons, ...b.reasons],
  };
}

/**
 * The sound of an event's end-of-beat, if it has one — played by the games
 * from the director's onEventEnd, which never fires for a flushed event.
 */
export function landingSound(e: TableEvent, mySeat: Seat): void {
  if (e.kind === 'cardPlayed' && e.seat !== mySeat) playSfx('play', { rate: 0.95 });
  // The pip (or the ×2) lands on the plaque as the beat ends.
  if (e.kind === 'bidCalled' || e.kind === 'doubled') playSfx('stamp');
}

export interface ProcessOptions {
  events: TableEvent[];
  profile: PlayerProfile;
  /** Mutated in place as declarations and bela calls come in. */
  tally: DealTally;
  mySeat: Seat;
  haptics: boolean;
  /**
   * True when events are being flushed past (fast-forward, compression):
   * progression still applies — XP and coins must never be lost — but sounds
   * and haptics stay quiet.
   */
  silent?: boolean;
}

export function processEvents({
  events,
  profile,
  tally,
  mySeat,
  haptics,
  silent = false,
}: ProcessOptions): { profile: PlayerProfile; award: Award | null } {
  const sfx = (name: Sfx, opts?: PlayOptions) => {
    if (silent) return;
    if (opts) playSfx(name, opts);
    else playSfx(name);
  };
  const buzz = (style: Haptics.ImpactFeedbackStyle) => {
    if (!haptics || silent) return;
    void Haptics.impactAsync(style).catch(() => {});
  };

  let next = profile;
  let earned: Award | null = null;
  let matchEnded = false;

  for (const e of events) {
    switch (e.kind) {
      case 'dealStarted':
        tally.zvanja = 0;
        tally.bela = false;
        sfx('deal');
        break;

      case 'cardPlayed':
        // My own card sounds as it leaves my hand; an opponent's sounds as it
        // LANDS, which the game plays from the director's end-of-beat
        // (see `landingSound`) — a face-down card in flight makes no noise.
        if (e.seat === mySeat) {
          sfx('play');
          buzz(Haptics.ImpactFeedbackStyle.Light);
        }
        break;

      case 'trickWon': {
        const mine = teamOf(e.seat) === teamOf(mySeat);
        // The last trick closes the deal and carries its own ten points: its
        // own sound. An ordinary trick sweeps a shade lower when it is theirs.
        if (e.isLastTrick) sfx('lastTrick');
        else sfx('trick', { rate: mine ? 1 : 0.85 });
        if (mine) buzz(Haptics.ImpactFeedbackStyle.Medium);
        break;
      }

      // Bidding: a pass knocks on the table, a call is its own marimba pair
      // (the zvanja call used to stand in for it), kontra is a challenge.
      case 'bidPassed':
        sfx('knock');
        break;

      case 'doublePassed':
        sfx('knock', { gain: 0.6 });
        break;

      case 'bidCalled':
        sfx('call');
        if (e.seat === mySeat) buzz(Haptics.ImpactFeedbackStyle.Light);
        break;

      case 'doubled':
        sfx('kontra', { rate: e.multiplier === 4 ? 1.12 : 1 });
        if (teamOf(e.seat) === teamOf(mySeat)) buzz(Haptics.ImpactFeedbackStyle.Medium);
        break;

      case 'handsCompleted':
        // The talon is dealt and animated; it had no sound at all.
        sfx('deal');
        break;

      case 'declared':
        sfx('zvanje');
        if (e.seat === mySeat) tally.zvanja += e.declarations.length;
        break;

      case 'declarationsRevealed':
        // The cards going up; the row plays its own coming-down.
        sfx('reveal');
        break;

      case 'belaCalled':
        sfx('bela');
        if (e.seat === mySeat) tally.bela = true;
        break;

      case 'dealScored': {
        const mine = teamOf(mySeat);
        const theirs = mine === 0 ? 1 : 0;
        const won = e.result.finalScore[mine] > e.result.finalScore[theirs];
        sfx(won ? 'win' : 'lose');
        const r = applyDealOutcome(next, {
          won,
          points: e.result.finalScore[mine],
          zvanjaCalled: tally.zvanja,
          belaCalled: tally.bela,
          valat: e.result.valatTeam === mine,
        });
        next = r.profile;
        earned = mergeAward(earned, r.award);
        break;
      }

      case 'matchOver': {
        const won = e.winner === teamOf(mySeat);
        sfx(won ? 'matchWon' : 'matchLost');
        matchEnded = true;
        const r = applyMatchOutcome(next, won);
        next = r.profile;
        earned = mergeAward(earned, r.award);
        break;
      }

      default:
        break;
    }
  }

  // The match fanfare already says "you earned this": neither the coin ding
  // nor the level-up run plays under it (a rising arpeggio under the falling
  // "lost" motif was the worst of it). The scored deal that precedes a match
  // end, a beat earlier, still dings its own coins — that is a separate call.
  if (earned && !matchEnded) {
    if (earned.levelUp !== null) sfx('levelup');
    else if (earned.coins > 0) sfx('coin');
  }
  return { profile: next, award: earned };
}
