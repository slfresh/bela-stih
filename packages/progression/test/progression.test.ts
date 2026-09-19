import { describe, expect, it } from 'vitest';
import * as progression from '@belot/progression';
import {
  COSMETICS,
  DAILY_BONUS,
  GIFTS,
  GIFT_IDS,
  canAffordGift,
  giftBlock,
  giftById,
  spendOnGift,
  MAX_LEVEL,
  STARTING_COINS,
  applyDealOutcome,
  applyMatchOutcome,
  buy,
  canBuy,
  canClaimDaily,
  claimDaily,
  previewDaily,
  claimQuest,
  dailyBonusFor,
  emptyProfile,
  ensureQuests,
  isOwned,
  isQuestComplete,
  isoDay,
  levelFromXp,
  levelProgress,
  questsForDay,
  selectCosmetic,
  selectedId,
  xpToReachLevel,
  type Cosmetic,
  type DealOutcome,
  type PlayerProfile,
} from '@belot/progression';

const deal = (over: Partial<DealOutcome> = {}): DealOutcome => ({
  won: false,
  points: 0,
  zvanjaCalled: 0,
  belaCalled: false,
  valat: false,
  ...over,
});

describe('levels', () => {
  it('starts everybody at level 1 with no xp', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(xpToReachLevel(1)).toBe(0);
  });

  it('needs strictly more xp for each level', () => {
    for (let n = 2; n <= MAX_LEVEL; n++) {
      expect(xpToReachLevel(n)).toBeGreaterThan(xpToReachLevel(n - 1));
    }
  });

  it('agrees with its own thresholds', () => {
    for (let n = 1; n <= MAX_LEVEL; n++) {
      expect(levelFromXp(xpToReachLevel(n))).toBe(n);
      if (n > 1) expect(levelFromXp(xpToReachLevel(n) - 1)).toBe(n - 1);
    }
  });

  it('caps at the maximum level', () => {
    expect(levelFromXp(99_999_999)).toBe(MAX_LEVEL);
    const p = levelProgress(99_999_999);
    expect(p.isMax).toBe(true);
    expect(p.fraction).toBe(1);
  });

  it('reports progress between 0 and 1', () => {
    for (const xp of [0, 10, 250, 1000, 5000, 20000]) {
      const p = levelProgress(xp);
      expect(p.fraction).toBeGreaterThanOrEqual(0);
      expect(p.fraction).toBeLessThanOrEqual(1);
      expect(p.levelEnd).toBeGreaterThanOrEqual(p.levelStart);
    }
  });
});

describe('deal rewards', () => {
  it('pays something just for finishing a deal', () => {
    const { profile, award } = applyDealOutcome(emptyProfile(), deal());
    expect(award.xp).toBeGreaterThan(0);
    expect(profile.dealsPlayed).toBe(1);
    expect(profile.dealsWon).toBe(0);
  });

  it('pays more for winning it', () => {
    const lost = applyDealOutcome(emptyProfile(), deal()).award;
    const won = applyDealOutcome(emptyProfile(), deal({ won: true })).award;
    expect(won.xp).toBeGreaterThan(lost.xp);
    expect(won.coins).toBeGreaterThan(lost.coins);
  });

  it('rewards the flourishes: zvanja, bela and valat', () => {
    const base = applyDealOutcome(emptyProfile(), deal({ won: true })).award.xp;
    expect(applyDealOutcome(emptyProfile(), deal({ won: true, zvanjaCalled: 2 })).award.xp)
      .toBeGreaterThan(base);
    expect(applyDealOutcome(emptyProfile(), deal({ won: true, belaCalled: true })).award.xp)
      .toBeGreaterThan(base);
    expect(applyDealOutcome(emptyProfile(), deal({ won: true, valat: true })).award.xp)
      .toBeGreaterThan(base);
  });

  it('tracks the personal best deal score', () => {
    let p = emptyProfile();
    p = applyDealOutcome(p, deal({ points: 120 })).profile;
    p = applyDealOutcome(p, deal({ points: 80 })).profile;
    expect(p.bestDealScore).toBe(120);
  });

  it('announces a level-up exactly once, when the boundary is crossed', () => {
    let p = emptyProfile();
    const ups: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = applyDealOutcome(p, deal({ won: true }));
      p = r.profile;
      if (r.award.levelUp !== null) ups.push(r.award.levelUp);
    }
    expect(ups.length).toBeGreaterThan(0);
    // Strictly ascending, never repeating a level.
    expect([...ups].sort((a, b) => a - b)).toEqual(ups);
    expect(new Set(ups).size).toBe(ups.length);
    expect(ups.at(-1)).toBe(levelFromXp(p.xp));
  });

  it('never mutates the profile it was given', () => {
    const p = emptyProfile();
    const snapshot = JSON.stringify(p);
    applyDealOutcome(p, deal({ won: true, valat: true }));
    applyMatchOutcome(p, true);
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('match rewards', () => {
  it('pays more for a win than a loss, but never nothing', () => {
    const lost = applyMatchOutcome(emptyProfile(), false).award;
    const won = applyMatchOutcome(emptyProfile(), true).award;
    expect(lost.coins).toBeGreaterThan(0); // a reward currency, not a stake
    expect(won.coins).toBeGreaterThan(lost.coins);
    expect(won.xp).toBeGreaterThan(lost.xp);
  });

  it('counts matches played and won', () => {
    let p = emptyProfile();
    p = applyMatchOutcome(p, true).profile;
    p = applyMatchOutcome(p, false).profile;
    expect(p.matchesPlayed).toBe(2);
    expect(p.matchesWon).toBe(1);
  });
});

/** Coins are earned, never staked — nothing may ever take them at the table. */
describe('coins are rewards, never a wager', () => {
  it('never falls below the starting balance through play alone', () => {
    let p = emptyProfile();
    for (let i = 0; i < 200; i++) {
      p = applyDealOutcome(p, deal({ won: i % 3 === 0 })).profile;
      if (i % 10 === 0) p = applyMatchOutcome(p, false).profile;
    }
    expect(p.coins).toBeGreaterThanOrEqual(STARTING_COINS);
  });

  it('only ever loses coins by buying a cosmetic or a table gift, never through play', () => {
    let p: PlayerProfile = { ...emptyProfile(), xp: xpToReachLevel(20) };
    const before = p.coins;
    const item = COSMETICS.find((c) => c.price > 0 && c.price <= before)!;
    p = buy(p, item);
    expect(p.coins).toBe(before - item.price);
  });
});

describe('daily bonus', () => {
  it('can be claimed once a day', () => {
    const p = emptyProfile();
    expect(canClaimDaily(p, '2026-03-01')).toBe(true);
    const first = claimDaily(p, '2026-03-01');
    expect(first.coins).toBeGreaterThan(0);
    expect(canClaimDaily(first.profile, '2026-03-01')).toBe(false);
    expect(claimDaily(first.profile, '2026-03-01').coins).toBe(0);
  });

  it('grows the streak on consecutive days', () => {
    let p = emptyProfile();
    const days = ['2026-03-01', '2026-03-02', '2026-03-03'];
    const paid: number[] = [];
    for (const d of days) {
      const r = claimDaily(p, d);
      p = r.profile;
      paid.push(r.coins);
    }
    expect(p.streakDays).toBe(3);
    expect(paid).toEqual([DAILY_BONUS[0], DAILY_BONUS[1], DAILY_BONUS[2]]);
  });

  it('resets the streak after a missed day', () => {
    let p = claimDaily(emptyProfile(), '2026-03-01').profile;
    p = claimDaily(p, '2026-03-02').profile;
    const skipped = claimDaily(p, '2026-03-05');
    expect(skipped.streakBroken).toBe(true);
    expect(skipped.streakDays).toBe(1);
  });

  it('crosses month boundaries correctly', () => {
    const p = claimDaily(emptyProfile(), '2026-02-28').profile;
    const next = claimDaily(p, '2026-03-01');
    expect(next.streakBroken).toBe(false);
    expect(next.streakDays).toBe(2);
  });

  it('cycles the reward table rather than growing forever', () => {
    expect(dailyBonusFor(1)).toBe(DAILY_BONUS[0]);
    expect(dailyBonusFor(DAILY_BONUS.length + 1)).toBe(DAILY_BONUS[0]);
    for (let d = 1; d < 60; d++) {
      expect(dailyBonusFor(d)).toBeLessThanOrEqual(Math.max(...DAILY_BONUS));
    }
  });

  it('formats local ISO days without drifting a day', () => {
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoDay(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('daily quests', () => {
  it('gives the same three quests for the same day', () => {
    expect(questsForDay('2026-03-01')).toEqual(questsForDay('2026-03-01'));
    expect(questsForDay('2026-03-01')).toHaveLength(3);
  });

  it('gives three distinct quests', () => {
    for (const day of ['2026-03-01', '2026-06-14', '2026-11-02']) {
      const kinds = questsForDay(day).map((q) => q.kind);
      expect(new Set(kinds).size).toBe(3);
    }
  });

  it('rolls over to a new set on a new day', () => {
    const p = ensureQuests(emptyProfile(), '2026-03-01');
    expect(p.questDay).toBe('2026-03-01');
    const next = ensureQuests({ ...p, quests: [] }, '2026-03-02');
    expect(next.questDay).toBe('2026-03-02');
    expect(next.quests).toHaveLength(3);
  });

  it('advances from real play and pays out once complete', () => {
    let p = ensureQuests(emptyProfile(), '2026-03-01');
    // Force a known quest so the test does not depend on the day's roll.
    p = { ...p, quests: [{ kind: 'playDeals', target: 2, progress: 0, reward: 100, claimed: false }] };

    p = applyDealOutcome(p, deal()).profile;
    expect(isQuestComplete(p.quests[0]!)).toBe(false);
    expect(claimQuest(p, 0).coins).toBe(0); // not yet

    p = applyDealOutcome(p, deal()).profile;
    expect(isQuestComplete(p.quests[0]!)).toBe(true);

    const before = p.coins;
    const claimed = claimQuest(p, 0);
    expect(claimed.coins).toBe(100);
    expect(claimed.profile.coins).toBe(before + 100);
    // and never twice
    expect(claimQuest(claimed.profile, 0).coins).toBe(0);
  });

  it('never counts past the target', () => {
    let p: PlayerProfile = {
      ...emptyProfile(),
      quests: [{ kind: 'playDeals', target: 2, progress: 0, reward: 100, claimed: false }],
    };
    for (let i = 0; i < 5; i++) p = applyDealOutcome(p, deal()).profile;
    expect(p.quests[0]!.progress).toBe(2);
  });
});

describe('cosmetics', () => {
  it('starts with exactly the free defaults owned', () => {
    const p = emptyProfile();
    expect(p.ownedCardBacks).toEqual(['classic']);
    expect(p.ownedFelts).toEqual(['green']);
    expect(p.ownedAvatars).toEqual(['djed', 'baka']);
    expect(p.selectedCardBack).toBe('classic');
    expect(p.selectedFelt).toBe('green');
    expect(p.selectedAvatar).toBe('djed');
  });

  it('refuses a purchase below the required level', () => {
    const locked = COSMETICS.find((c) => c.requiredLevel > 1)!;
    const p: PlayerProfile = { ...emptyProfile(), coins: 999_999, xp: 0 };
    expect(canBuy(p, locked)).toBe(false);
    expect(buy(p, locked)).toEqual(p);
  });

  it('refuses a purchase you cannot afford', () => {
    const item = COSMETICS.find((c) => c.price > 0)!;
    const p: PlayerProfile = { ...emptyProfile(), coins: 0, xp: xpToReachLevel(MAX_LEVEL) };
    expect(canBuy(p, item)).toBe(false);
  });

  it('will not sell the same thing twice', () => {
    const item = COSMETICS.find((c) => c.price > 0)!;
    const rich: PlayerProfile = {
      ...emptyProfile(),
      coins: 999_999,
      xp: xpToReachLevel(MAX_LEVEL),
    };
    const owned = buy(rich, item);
    expect(canBuy(owned, item)).toBe(false);
    expect(buy(owned, item).coins).toBe(owned.coins);
  });

  it('auto-selects whatever was just bought', () => {
    const rich: PlayerProfile = {
      ...emptyProfile(),
      coins: 999_999,
      xp: xpToReachLevel(MAX_LEVEL),
    };
    const p = buy(rich, COSMETICS.find((c) => c.id === 'walnut')!);
    expect(selectedId(p, 'felt')).toBe('walnut');
    expect(p.selectedCardBack).toBe('classic'); // other kinds untouched
  });
});

describe('avatars', () => {
  const avatar = (id: string): Cosmetic =>
    COSMETICS.find((c) => c.kind === 'avatar' && c.id === id)!;

  it('offers the whole cast at the agreed prices and levels', () => {
    const avatars = COSMETICS.filter((c) => c.kind === 'avatar');
    expect(avatars.map((c) => [c.id, c.price, c.requiredLevel])).toEqual([
      ['djed', 0, 1],
      ['baka', 0, 1],
      ['brko', 400, 2],
      ['snasa', 400, 2],
      ['student', 600, 4],
      ['teta', 600, 4],
      ['sofer', 800, 6],
      ['majstor', 800, 6],
      ['gazda', 1000, 9],
      ['profesorica', 1000, 9],
      ['ribar', 1400, 12],
      ['kapetan', 2000, 15],
    ]);
  });

  it('gives everybody djed and baka for free', () => {
    const p = emptyProfile();
    expect(isOwned(p, avatar('djed'))).toBe(true);
    expect(isOwned(p, avatar('baka'))).toBe(true);
    expect(isOwned(p, avatar('brko'))).toBe(false);
    expect(selectedId(p, 'avatar')).toBe('djed');
  });

  it('auto-selects an avatar on purchase', () => {
    const rich: PlayerProfile = {
      ...emptyProfile(),
      coins: 999_999,
      xp: xpToReachLevel(MAX_LEVEL),
    };
    const bought = buy(rich, avatar('brko'));
    expect(bought.ownedAvatars).toContain('brko');
    expect(selectedId(bought, 'avatar')).toBe('brko');
    expect(bought.coins).toBe(rich.coins - 400);
  });

  it('selects an owned avatar, and hands back the same profile for an unowned one', () => {
    const p = emptyProfile();
    expect(selectCosmetic(p, avatar('kapetan'))).toBe(p); // the very same object
    const picked = selectCosmetic(p, avatar('baka'));
    expect(selectedId(picked, 'avatar')).toBe('baka');
  });

  it('gates avatars behind their required level', () => {
    const kapetan = avatar('kapetan');
    const p: PlayerProfile = { ...emptyProfile(), coins: 999_999, xp: xpToReachLevel(14) };
    expect(canBuy(p, kapetan)).toBe(false);
    expect(canBuy({ ...p, xp: xpToReachLevel(15) }, kapetan)).toBe(true);
  });

  it('will not sell the same avatar twice', () => {
    const rich: PlayerProfile = {
      ...emptyProfile(),
      coins: 999_999,
      xp: xpToReachLevel(MAX_LEVEL),
    };
    const once = buy(rich, avatar('snasa'));
    const twice = buy(once, avatar('snasa'));
    expect(twice).toBe(once); // nothing to do, same object back
    expect(once.ownedAvatars.filter((id) => id === 'snasa')).toHaveLength(1);
  });
});

describe('previewDaily', () => {
  it('previews exactly what claiming would pay, streak intact or broken', () => {
    const started = claimDaily({ ...emptyProfile() }, '2026-03-01').profile;

    // Claiming the very next day continues the streak: day 2 pays 150.
    expect(previewDaily(started, '2026-03-02')).toEqual({ coins: 150, streakDays: 2 });
    expect(claimDaily(started, '2026-03-02').coins).toBe(150);

    // A missed day restarts at day 1 — the banner must not promise 150.
    expect(previewDaily(started, '2026-03-04')).toEqual({ coins: 100, streakDays: 1 });
    expect(claimDaily(started, '2026-03-04').coins).toBe(100);
  });
});

describe('table gifts', () => {
  const rich = (): PlayerProfile => ({ ...emptyProfile(), xp: xpToReachLevel(20), coins: 5000 });

  it('is a fixed catalogue in picker order, priced in fives', () => {
    expect(GIFTS.map((g) => g.id)).toEqual([...GIFT_IDS]);
    expect(new Set(GIFT_IDS).size).toBe(GIFT_IDS.length);
    for (const g of GIFTS) {
      expect(g.price % 5, g.id).toBe(0);
      expect(g.price, g.id).toBeGreaterThanOrEqual(20);
      expect(g.price, g.id).toBeLessThanOrEqual(150);
      expect(g.requiredLevel, g.id).toBeGreaterThanOrEqual(1);
    }
    expect(GIFTS.filter((g) => g.alcohol).map((g) => g.id).sort()).toEqual(['gemist', 'pivo', 'rakija']);
  });

  it('charges the sender price times recipients, and counts them', () => {
    const p = rich();
    const kava = giftById('kava')!;
    const one = spendOnGift(p, 'kava', 1);
    expect(one.coins).toBe(p.coins - kava.price);
    expect(one.giftsSent).toBe(1);
    const table = spendOnGift(one, 'kruna', 3);
    expect(table.coins).toBe(one.coins - 3 * giftById('kruna')!.price);
    expect(table.giftsSent).toBe(4);
  });

  it('touches nothing but the wallet and the count', () => {
    const p = rich();
    const q = spendOnGift(p, 'burek', 2);
    const { coins: _c, giftsSent: _g, ...rest } = q;
    const { coins: _c0, giftsSent: _g0, ...before } = p;
    expect(rest).toEqual(before);
  });

  it('hands back the very same profile when blocked', () => {
    const poor = { ...emptyProfile(), coins: 10 };
    expect(spendOnGift(poor, 'kava', 1)).toBe(poor);
    expect(giftBlock(poor, 'kava', 1)).toBe('coins');
    const fresh = emptyProfile();
    expect(spendOnGift(fresh, 'kruna', 1)).toBe(fresh);
    expect(giftBlock(fresh, 'kruna', 1)).toBe('level');
    const r = rich();
    expect(spendOnGift(r, 'kava', 0)).toBe(r);
    expect(canAffordGift(r, 'kava', 1)).toBe(true);
  });

  it('never credits anyone: the only gift function that returns a profile never raises its coins', () => {
    for (const id of GIFT_IDS) {
      for (const n of [1, 2, 3]) {
        const p = rich();
        expect(spendOnGift(p, id, n).coins).toBeLessThan(p.coins);
      }
    }
    // A receiver-side function would have to be one of these; there is none.
    expect(Object.keys(progression).filter((k) => /gift/i.test(k)).sort()).toEqual(
      ['GIFTS', 'GIFT_IDS', 'canAffordGift', 'giftBlock', 'giftById', 'giftCost', 'isGiftId', 'spendOnGift'].sort(),
    );
  });

  it('an old saved profile without the count still spends correctly', () => {
    const old: Partial<PlayerProfile> = { ...rich() };
    delete old.giftsSent;
    expect(spendOnGift(old as PlayerProfile, 'kava', 1).giftsSent).toBe(1);
  });
});
