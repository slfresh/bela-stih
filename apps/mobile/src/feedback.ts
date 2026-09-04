import * as Haptics from 'expo-haptics';
import { teamOf, type Seat } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import {
  applyDealOutcome,
  applyMatchOutcome,
  type Award,
  type PlayerProfile,
} from '@belot/progression';
import { playSfx } from './audio';

/**
 * Turns the table's event stream into sound, haptics and rewards.
 *
 * Shared by offline and online on purpose: the server emits exactly the same
 * `TableEvent`s the local table does, so a player earns XP and coins the same
 * way in both modes without a second implementation to keep in step.
 */

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
  const sfx = (name: Parameters<typeof playSfx>[0]) => {
    if (!silent) playSfx(name);
  };
  const buzz = (style: Haptics.ImpactFeedbackStyle) => {
    if (!haptics || silent) return;
    void Haptics.impactAsync(style).catch(() => {});
  };

  let next = profile;
  let earned: Award | null = null;

  for (const e of events) {
    switch (e.kind) {
      case 'dealStarted':
        tally.zvanja = 0;
        tally.bela = false;
        sfx('deal');
        break;

      case 'cardPlayed':
        sfx('play');
        if (e.seat === mySeat) buzz(Haptics.ImpactFeedbackStyle.Light);
        break;

      case 'trickWon':
        sfx('trick');
        if (teamOf(e.seat) === teamOf(mySeat)) buzz(Haptics.ImpactFeedbackStyle.Medium);
        break;

      // Bidding was silent film until now: these three are the moments a
      // table actually reacts to.
      case 'bidCalled':
        sfx('zvanje');
        if (e.seat === mySeat) buzz(Haptics.ImpactFeedbackStyle.Light);
        break;

      case 'doubled':
        sfx('bela');
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
        const r = applyMatchOutcome(next, e.winner === teamOf(mySeat));
        next = r.profile;
        earned = mergeAward(earned, r.award);
        break;
      }

      default:
        break;
    }
  }

  if (earned) {
    if (earned.levelUp !== null) sfx('levelup');
    else if (earned.coins > 0) sfx('coin');
  }
  return { profile: next, award: earned };
}
