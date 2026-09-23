import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COIN_CASCADE_COUNT, coinCascadeCount } from '../src/anim/lifetimes';

/**
 * Phase C of the review, the feel: an online tap answered at once and sent
 * once, refused taps that shake instead of doing nothing, the clock's warning
 * seen as well as heard, and the moments that deserve one - the trick's
 * winner, bela's twenty, coins by the award, a level crossed.
 */

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const t = src('src/TableScreen.tsx');

describe('one answer per question online', () => {
  it('lets every answer through one guard, opened again by the echo or a refusal', () => {
    expect(t).toMatch(/const send = useCallback\(\s*\(a: Action\) => \{\s*if \(awaitEcho\) \{\s*if \(answered\.current\) return;\s*answered\.current = true;\s*\}\s*onActionRef\.current\(a\);/);
    expect(t).toMatch(/const optionsKey = JSON\.stringify\(options\);/);
    expect(t).toMatch(/useEffect\(\(\) => \{\s*answered\.current = false;\s*\}, \[optionsKey, refusedN\]\);/);
    // Cards, the portrait's answers and the rail's (through its quiet window) all go through it.
    expect(t).toMatch(/onPlay=\{send\}/);
    expect(t).toMatch(/<NonCardActions options=\{options\} lang=\{lang\} onChoose=\{send\} short=\{short\} \/>/);
    expect(t).toMatch(/if \(Date\.now\(\) >= railQuietUntil\.current\) send\(a\);/);
    expect(t).not.toMatch(/onPlay=\{onAction\}|onChoose=\{onAction\}/);
  });

  it('holds a sent card where it is, faded, until the answer comes', () => {
    const hand = t.slice(t.indexOf('function Hand('), t.indexOf('const FanCard = memo('));
    expect(hand).toMatch(/if \(sentRef\.current !== null\) return;\s*const card = cards\.find/);
    expect(hand).toMatch(/useEffect\(\(\) => \{\s*sentRef\.current = null;\s*setSent\(null\);\s*\}, \[decision, cardsKey, refusedN\]\);/);
    expect(hand).toMatch(/setTimeout\(\(\) => \{\s*sentRef\.current = null;\s*setSent\(null\);\s*\}, SENT_MAX_MS\);/);
    expect(hand).toMatch(/sentRef\.current = id;\s*setSent\(id\);\s*\/\/[^\n]*\n\s*if \(awaitEcho\) pattern\('press'\);\s*onPlay\(chosen\);/);
    expect(hand).toMatch(/sent=\{sent === id\}/);
    const card = t.slice(t.indexOf('const FanCard = memo('));
    expect(card).toMatch(/a\.sent === b\.sent/);
    expect(t).toMatch(/const SENT_MAX_MS = 6000;/);
  });

  it('is fed by the online game: plays await their echo, refusals are counted', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/awaitEcho\s+refusedN=\{net\.refusals\}/);
    const n = src('src/net/useNetGame.ts');
    expect(n).toMatch(/setError\(langRef\.current\.s\.ui\.moveRefused\);\s*setRefusals\(\(n\) => n \+ 1\);/);
    // Offline plays are applied at once: nothing there waits.
    expect(src('src/OfflineGame.tsx')).not.toMatch(/awaitEcho/);
  });
});

describe('a refused tap', () => {
  it('shakes once per refusal, and holds still under reduced motion', () => {
    const s = src('src/ui/Shake.tsx');
    expect(s).toMatch(/if \(seen\.current === n\) return;\s*seen\.current = n;\s*if \(n === 0 \|\| still\) return;/);
    expect(s).toMatch(/const still = useMotionHere\(\) === 'reduced';/);
    // Its own view's transform, never the pressable's.
    expect(s).toMatch(/<Animated\.View style=\{\[style, anim\]\} pointerEvents=\{pointerEvents\}>/);
  });

  it('inside the emote cooldown: the strip shakes, the tray stays open, nothing is sent', () => {
    const send = t.slice(t.indexOf('const sendEmote = (id: string) => {'), t.indexOf('onEmote(id);'));
    expect(send).toMatch(/if \(Date\.now\(\) < emoteReadyAt\.current\) \{\s*playSfx\('denied', \{ gain: DENIED_SOFT \}\);\s*pattern\('error'\);\s*setEmoteShake\(\(n\) => n \+ 1\);\s*return;\s*\}\s*setTrayOpen\(false\);/);
    expect(t).toMatch(/onSend=\{sendEmote\} shakeN=\{emoteShake\}/);
    expect(src('src/table/EmoteStrip.tsx')).toMatch(/<Shake n=\{shakeN\} style=\{\[styles\.wrap, vertical && styles\.wrapRail\]\} pointerEvents="box-none">/);
  });

  it('on a locked or unaffordable shop tile: the tile shakes and says why', () => {
    const shop = src('src/screens/ShopScreen.tsx');
    expect(shop).toMatch(/setShake\(\(s\) => \(\{ id: c\.id, n: s\.n \+ 1 \}\)\);\s*sayWhy\(ui\.shopWhyLocked/);
    expect(shop).toMatch(/setShake\(\(s\) => \(\{ id: c\.id, n: s\.n \+ 1 \}\)\);\s*sayWhy\(ui\.shopWhyCoins/);
    expect(shop).toMatch(/<Shake key=\{c\.id\} n=\{shake\.id === c\.id \? shake\.n : 0\} style=\{styles\.slot\}>/);
    expect(shop).toMatch(/slot: \{ width: '30\.5%', height: 122 \},/);
  });

  it('on a card the rules forbid: heard softly as well', () => {
    const explain = t.slice(t.indexOf('const explainIllegal = useCallback('), t.indexOf('AccessibilityInfo.announceForAccessibility(text);'));
    expect(explain).toMatch(/if \(why === null\) return;\s*playSfx\('denied', \{ gain: DENIED_SOFT \}\);\s*pattern\('error'\);/);
  });
});

describe("the clock's warning", () => {
  it('is seen as well as heard: a red ring over the hand, twice at 2 s', () => {
    const cues = src('src/table/useTurnCues.ts');
    expect(cues).toMatch(/playSfx\('tick', \{ rate: before <= 2_000 \? 1\.25 : 1 \}\);\s*\/\/[^\n]*\n\s*onClockWarnRef\.current\?\.\(before <= 2_000\);/);
    expect(t).toMatch(/onClockWarn: warnHand,/);
    const warn = t.slice(t.indexOf('const warnHand = useCallback('), t.indexOf('[anchors, fxBus, mySeat],', t.indexOf('const warnHand = useCallback(')));
    expect(warn).toMatch(/if \(reducedRef\.current\) return;/);
    expect(warn).toMatch(/fxBus\.emit\(\{ kind: 'pulse', at, speed: 1, tone: 'warn' \}\);\s*if \(urgent\) setTimeout/);
    expect(src('src/anim/EffectsOverlay.tsx')).toMatch(/pulseWarn: \{ borderColor: signal\.clockLow, borderWidth: 4 \},/);
  });
});

describe('the moments', () => {
  const fx = src('src/table/fx.ts');

  it("flare the trick's winner as the pile lands", () => {
    const end = fx.slice(fx.indexOf('const end = (e: TableEvent, speed = 1): void => {'));
    expect(end).toMatch(/if \(isReduced\(\)\) return;/);
    expect(end).toMatch(/case 'trickWon': \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*const r = puckRect\(anchors, e\.seat, mySeatOf\(\)\);\s*if \(r\) bus\.emit\(\{ kind: 'pulse'/);
  });

  it("send bela's twenty to the running count, and nothing for zvanja", () => {
    const bela = fx.slice(fx.indexOf("case 'belaCalled': {"), fx.indexOf("case 'dealScored'"));
    expect(bela).toMatch(/if \(r && chipTo && !reduced\) \{/);
    expect(bela).toMatch(/text: '\+20',\s*tone: 'points',/);
    expect(bela).toMatch(/to: chipTo,/);
    const declared = fx.slice(fx.indexOf("case 'declared':"), fx.indexOf("case 'belaCalled'"));
    expect(declared).not.toMatch(/kind: 'badge'/);
  });

  it('fly more coins for more, and the wallet waits for the last of them', () => {
    expect(coinCascadeCount(0)).toBe(COIN_CASCADE_COUNT);
    expect([5, 20, 25, 55, 105, 155].map(coinCascadeCount)).toEqual([4, 6, 6, 8, 10, 12]);
    for (let c = 1; c < 400; c++) {
      expect(coinCascadeCount(c)).toBeGreaterThanOrEqual(coinCascadeCount(c - 1 || 1));
      expect(coinCascadeCount(c)).toBeLessThanOrEqual(12);
    }
    for (const f of ['src/OfflineGame.tsx', 'src/net/OnlineGame.tsx']) {
      const g = src(f);
      expect(g, f).toMatch(/const count = coinCascadeCount\(banner\.coins\);/);
      expect(g, f).toMatch(/kind: 'coins', from, to, count \}/);
      expect(g, f).toMatch(/\.\.\.coinDingTimers\(count, delay\),/);
      expect(g, f).toMatch(/delay \+ coinsLandedMs\(count\),/);
      expect(g, f).not.toMatch(/COIN_CASCADE_COUNT/);
    }
    expect(t).toMatch(/const awardCoins = coinCascadeCount\(banner\?\.coins \?\? 0\);/);
    expect(t).toMatch(/const lag = COIN_CASCADE_DELAY_MS \+ coinsLandedMs\(coinCount\) \+ holdMs;/);
    expect((t.match(/coinCount=\{awardCoins\}/g) ?? []).length).toBe(2);
  });

  it('burst at the wallet when a level is crossed, never under reduced motion', () => {
    for (const [f, g] of [['src/OfflineGame.tsx', 'g'], ['src/net/OnlineGame.tsx', 'net']] as const) {
      const s = src(f);
      const up = s.slice(s.indexOf("playSfx('levelup');"), s.indexOf('delay + coinsLandedMs(count)'));
      expect(up, f).toMatch(new RegExp(`if \\(${g}\\.motion !== 'reduced'\\) \\{\\s*const at = ${g}\\.anchors\\.centre\\(anchorId\\.wallet\\);\\s*if \\(at\\) ${g}\\.fxBus\\.emit\\(\\{ kind: 'burst', at, count: 24 \\}\\);`));
    }
  });
});
