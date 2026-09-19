import { describe, expect, it } from 'vitest';
import { levelProgress } from '@belot/progression';
import { XP_FILL_MS, XP_REFILL_MS, XP_TO_END_MS, xpFillSteps } from '../src/table/xpFill';

const shown = (xp: number) => {
  const p = levelProgress(xp);
  return { level: p.level, fraction: p.fraction, isMax: p.isMax };
};

describe('the XP bar never runs backwards', () => {
  it('a level-up fills to the end, empties, and fills on to the new share', () => {
    // 45 XP is level 1 at 0.9; +35 lands on level 2 at 28/102.
    const was = shown(45);
    const now = shown(80);
    expect(was.level).toBe(1);
    expect(now.level).toBe(2);
    expect(xpFillSteps(was, now, false)).toEqual([
      { to: 1, ms: XP_TO_END_MS, ease: 'in' },
      { to: 0, ms: 0, ease: 'out' },
      { to: now.fraction, ms: XP_REFILL_MS, ease: 'out' },
    ]);
  });

  it('for every award from every total: timed steps only rise, and it ends where the level says', () => {
    const awards = [10, 20, 35, 45, 60, 85, 100, 125, 135, 185, 235];
    const failures: string[] = [];
    for (let xp = 0; xp <= 25400; xp += 3) {
      const was = shown(xp);
      for (const a of awards) {
        const now = shown(xp + a);
        let at = was.fraction;
        for (const s of xpFillSteps(was, now, false)) {
          if (s.ms > 0 && !(s.to > at)) failures.push(`${xp}+${a}: timed ${at}->${s.to}`);
          if (s.ms === 0 && !(at === 1 && s.to === 0)) failures.push(`${xp}+${a}: jump ${at}->${s.to}`);
          at = s.to;
        }
        if (at !== now.fraction) failures.push(`${xp}+${a}: ends at ${at}, not ${now.fraction}`);
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('an unchanged value replays nothing (a rotation remount)', () => {
    expect(xpFillSteps(shown(80), shown(80), false)).toEqual([]);
  });

  it('under reduce-motion it snaps, never through the end', () => {
    expect(xpFillSteps(shown(45), shown(80), true)).toEqual([{ to: shown(80).fraction, ms: 0, ease: 'out' }]);
  });

  it('landing exactly on a new level ends empty, with no step from 0 to 0', () => {
    const now = shown(50);
    expect(now.fraction).toBe(0);
    expect(xpFillSteps(shown(40), now, false)).toEqual([
      { to: 1, ms: XP_TO_END_MS, ease: 'in' },
      { to: 0, ms: 0, ease: 'out' },
    ]);
  });

  it('reaching the top level fills to the end once, with no wrap', () => {
    const now = shown(25400);
    expect(now.isMax).toBe(true);
    expect(xpFillSteps(shown(25300), now, false)).toEqual([{ to: 1, ms: XP_FILL_MS, ease: 'out' }]);
  });
});
