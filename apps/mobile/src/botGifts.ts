import type { Seat } from '@belot/engine';
import type { GiftId } from '@belot/progression';
import type { TableEvent } from '@belot/table';

/**
 * How the offline bots join in with gifts — sparingly, so a gift from a bot
 * still means something. Pure and seeded, so the rules below are tested, not
 * hoped for.
 *
 *  - A bot given a gift thanks for it, now and then (`botThanks`).
 *  - The partner buys you a coffee, sometimes, after you take a trick worth
 *    having (≥ 20 points; not the last, which the sheet is about to cover).
 *  - An opponent sends tissues, sometimes, as the next deal starts after you
 *    lost one — once the sheet has gone, never over it.
 *  - At most one bot gift a deal, and never two deals running.
 *
 * Bots never pay (they have no wallet) and never receive anything of value.
 */

export interface BotGiftState {
  deal: number;
  lastGiftDeal: number;
  giftedThisDeal: boolean;
  tissuesDue: boolean;
}

export const BOT_GIFTS_START: BotGiftState = { deal: 0, lastGiftDeal: -10, giftedThisDeal: false, tissuesDue: false };

export interface BotGift {
  from: Seat;
  id: GiftId;
  /** How long after the event starts: past the sweep, or once the cards have landed. */
  delayMs: number;
}

/** The partner's coffee after a good trick. */
export const COFFEE_CHANCE = 0.2;
/** The opponents' tissues after a lost deal. */
export const TISSUES_CHANCE = 0.4;
/** After a trick's sweep (760 ms) has cleared the felt. */
export const COFFEE_DELAY_MS = 960;
/** After the deal's backs (1400 + 200 ms) have landed. */
export const TISSUES_DELAY_MS = 1600;

const teamOf = (s: Seat) => s % 2;

export function botGiftStep(
  e: TableEvent,
  st: BotGiftState,
  human: Seat,
  rng: () => number,
): { state: BotGiftState; gift?: BotGift } {
  const canGift = (s: BotGiftState) => !s.giftedThisDeal && s.deal - s.lastGiftDeal >= 2;
  const give = (s: BotGiftState, gift: BotGift) => ({
    state: { ...s, giftedThisDeal: true, lastGiftDeal: s.deal },
    gift,
  });

  switch (e.kind) {
    case 'dealStarted': {
      const next: BotGiftState = { ...st, deal: st.deal + 1, giftedThisDeal: false, tissuesDue: false };
      if (st.tissuesDue && canGift(next) && rng() < TISSUES_CHANCE) {
        const opponents = ([0, 1, 2, 3] as Seat[]).filter((s) => teamOf(s) !== teamOf(human));
        const from = opponents[Math.floor(rng() * opponents.length)] ?? opponents[0]!;
        return give(next, { from, id: 'maramice', delayMs: TISSUES_DELAY_MS });
      }
      return { state: next };
    }
    case 'trickWon': {
      if (e.seat !== human || e.points < 20 || e.isLastTrick || !canGift(st)) return { state: st };
      if (rng() >= COFFEE_CHANCE) return { state: st };
      return give(st, { from: ((human + 2) % 4) as Seat, id: 'kava', delayMs: COFFEE_DELAY_MS });
    }
    case 'dealScored': {
      const mine = teamOf(human);
      const lost = e.result.finalScore[mine]! < e.result.finalScore[1 - mine]!;
      return { state: { ...st, tissuesDue: lost } };
    }
    default:
      return { state: st };
  }
}

/** The bots a gift reached, answering it: at most two, a beat apart. */
export function botThanks(
  recipients: readonly Seat[],
  human: Seat,
  rng: () => number,
): { seat: Seat; id: 'hvala' | 'smile' | 'clap'; delayMs: number }[] {
  const out: { seat: Seat; id: 'hvala' | 'smile' | 'clap'; delayMs: number }[] = [];
  const words = ['hvala', 'smile', 'clap'] as const;
  for (const seat of recipients) {
    if (seat === human || out.length >= 2) continue;
    if (rng() >= 0.6) continue;
    out.push({ seat, id: words[Math.floor(rng() * words.length)] ?? 'hvala', delayMs: 400 + out.length * 300 });
  }
  return out;
}
