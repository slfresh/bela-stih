import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardId, type Card } from '@belot/engine';

/**
 * Phase B of the review: the shop asks before it spends and says why not, the
 * profile is where the name and the face are set, the settings come in
 * sections with a reset that asks, arranging the hand no longer rewrites the
 * saved order, and the browser's Back acts like Android's.
 *
 * The two hooks run on a small stand-in for React's hooks (slots by call
 * order, effects after each render when their deps change) - enough for code
 * that only uses refs, state, memos and effects, and it runs the real hook.
 */

const rt = vi.hoisted(() => {
  type Effect = { deps: unknown[] | undefined; cleanup?: (() => void) | void };
  const state = {
    slots: [] as unknown[],
    i: 0,
    queued: [] as Array<{ k: number; fn: () => (() => void) | void; deps: unknown[] | undefined }>,
  };
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    !!a && !!b && a.length === b.length && a.every((x, j) => Object.is(x, b[j]));
  const react = {
    useRef: (v: unknown) => {
      const k = state.i++;
      if (!(k in state.slots)) state.slots[k] = { current: v };
      return state.slots[k];
    },
    useState: (v: unknown) => {
      const k = state.i++;
      if (!(k in state.slots)) state.slots[k] = { v: typeof v === 'function' ? (v as () => unknown)() : v };
      const box = state.slots[k] as { v: unknown };
      return [box.v, (f: unknown) => (box.v = typeof f === 'function' ? (f as (x: unknown) => unknown)(box.v) : f)];
    },
    useMemo: (fn: () => unknown, deps: unknown[]) => {
      const k = state.i++;
      const prev = state.slots[k] as { value: unknown; deps: unknown[] } | undefined;
      if (prev && same(prev.deps, deps)) return prev.value;
      const value = fn();
      state.slots[k] = { value, deps };
      return value;
    },
    useEffect: (fn: () => (() => void) | void, deps?: unknown[]) => {
      const k = state.i++;
      const prev = state.slots[k] as Effect | undefined;
      if (prev && same(prev.deps, deps)) return;
      state.queued.push({ k, fn, deps });
    },
  };
  /** One render: the hook, then the effects whose deps changed (cleanups first). */
  function render<T>(hook: () => T): T {
    state.i = 0;
    state.queued = [];
    const out = hook();
    for (const q of state.queued) (state.slots[q.k] as Effect | undefined)?.cleanup?.();
    for (const q of state.queued) state.slots[q.k] = { deps: q.deps, cleanup: q.fn() };
    return out;
  }
  function reset() {
    state.slots = [];
    state.i = 0;
  }
  return { react, render, reset };
});

vi.mock('react', () => rt.react);
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { useHandOrder, type HandSort } from '../src/table/useHandOrder';
import { useWebBack } from '../src/ui/webBack';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const show = (cards: Card[]) => cards.map((x) => `${x.rank}${x.suit[0]}`).join(' ');

describe('arranging the hand', () => {
  beforeEach(() => rt.reset());
  const hand = [c('7', 'hearts'), c('A', 'clubs'), c('J', 'hearts'), c('K', 'spades'), c('9', 'diamonds'), c('10', 'clubs')];
  const order = (h: Card[], trump: Card['suit'] | null, mode: HandSort, deal: unknown = 0) =>
    rt.render(() => useHandOrder(h, trump, mode, deal));

  it('takes no callback: a swap cannot write the saved order back', () => {
    expect(src('src/table/useHandOrder.ts')).not.toMatch(/onModeChange/);
    const t = src('src/TableScreen.tsx');
    expect(t).toMatch(/useHandOrder\(view\.hand, view\.context\.trumpSuit, handSort, view\.dealer\)/);
    expect(t).not.toMatch(/onHandSortChange/);
    for (const f of ['src/OfflineGame.tsx', 'src/net/OnlineGame.tsx']) expect(src(f), f).not.toMatch(/handSort: m\b/);
  });

  it('keeps a swap for the hand in front of you, then deals the next in the saved order', () => {
    let h = order(hand, null, 'auto');
    expect(show(h.cards)).toBe('10c Ac Ks 7h Jh 9d');
    expect(h.mode).toBe('auto');
    h.swap(cardId(h.cards[0]!), cardId(h.cards[5]!));
    h = order(hand, null, 'auto');
    expect(show(h.cards)).toBe('9d Ac Ks 7h Jh 10c');
    expect(h.mode).toBe('manual');
    // Trump called: an arranged hand is not re-sorted under the player.
    h = order(hand, 'hearts', 'auto');
    expect(show(h.cards)).toBe('9d Ac Ks 7h Jh 10c');
    // The talon's two cards slot into their sorted places around the arrangement.
    const eight = [...hand, c('Q', 'hearts'), c('8', 'spades')];
    h = order(eight, 'hearts', 'auto');
    expect(show(h.cards)).toBe('9d Ac 8s Ks 7h Qh Jh 10c');
    // Played out, and a new hand: back to trump-first, the saved order.
    order([], 'hearts', 'auto');
    const next = [c('J', 'spades'), c('A', 'hearts'), c('7', 'clubs'), c('9', 'spades'), c('K', 'diamonds'), c('8', 'hearts')];
    h = order(next, null, 'auto');
    expect(h.mode).toBe('auto');
    expect(show(h.cards)).toBe('7c 9s Js 8h Ah Kd');
    h = order(next, 'spades', 'auto');
    expect(show(h.cards)).toBe('9s Js 7c 8h Ah Kd');
  });

  it('deals the saved order again when a deal is cut short with cards still held', () => {
    let h = order(hand, 'hearts', 'auto', 1);
    h.swap(cardId(h.cards[0]!), cardId(h.cards[5]!));
    h = order(hand.slice(0, 4), 'hearts', 'auto', 1); // a renons ends the deal here
    expect(h.mode).toBe('manual');
    // The next deal shares a card with what was left (7h), and another dealer.
    const next = [c('7', 'hearts'), c('A', 'spades'), c('8', 'clubs'), c('Q', 'diamonds'), c('J', 'clubs'), c('K', 'hearts')];
    h = order(next, null, 'auto', 2);
    expect(h.mode).toBe('auto');
    expect(show(h.cards)).toBe('8c Jc As 7h Kh Qd');
  });

  it('still keeps every hand as arranged when Settings says Ručno', () => {
    let h = order(hand, null, 'manual');
    h.swap(cardId(h.cards[0]!), cardId(h.cards[1]!));
    h = order(hand, 'clubs', 'manual');
    expect(show(h.cards)).toBe('Ac 10c Ks 7h Jh 9d');
    expect(h.mode).toBe('manual');
  });
});

describe("the browser's Back", () => {
  type Entry = { state: unknown };
  let entries: Entry[];
  let index: number;
  let left: boolean;
  let pending: Array<() => void>;
  let listeners: Array<() => void>;

  beforeEach(() => {
    rt.reset();
    entries = [{ state: null }];
    index = 0;
    left = false;
    pending = [];
    listeners = [];
    (globalThis as { window?: unknown }).window = {
      addEventListener: (type: string, fn: () => void) => type === 'popstate' && listeners.push(fn),
      removeEventListener: (type: string, fn: () => void) => {
        if (type === 'popstate') listeners = listeners.filter((l) => l !== fn);
      },
      history: {
        get state() {
          return entries[index]!.state;
        },
        pushState: (state: unknown) => {
          entries = entries.slice(0, index + 1);
          entries.push({ state });
          index++;
        },
        back: () => {
          if (index === 0) {
            left = true; // past our first entry: the page is gone
            return;
          }
          index--;
          // popstate is a task of its own, never synchronous.
          pending.push(() => listeners.forEach((l) => l()));
        },
      },
    };
  });

  const flush = () => {
    const run = pending;
    pending = [];
    run.forEach((f) => f());
  };
  const press = () => {
    (globalThis as unknown as { window: { history: { back: () => void } } }).window.history.back();
    flush();
  };

  it('leaves the page at once from the home screen', () => {
    const onBack = vi.fn();
    rt.render(() => useWebBack(true, onBack));
    expect(entries).toHaveLength(1);
    press();
    expect(left).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('comes back home from a menu, and the next Back leaves', () => {
    const onBack = vi.fn();
    rt.render(() => useWebBack(true, onBack));
    rt.render(() => useWebBack(false, onBack)); // the shop opens
    rt.render(() => useWebBack(false, onBack)); // a re-render lays nothing more
    expect(index).toBe(1);
    press();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(left).toBe(false);
    rt.render(() => useWebBack(true, onBack)); // onBack took the app home
    expect(index).toBe(0);
    press();
    expect(left).toBe(true);
  });

  it('lays its step again when the guard kept the app where it was', () => {
    const onBack = vi.fn(); // the table's guard opened "leave the match?"
    rt.render(() => useWebBack(false, onBack));
    expect(index).toBe(1);
    press();
    expect(onBack).toHaveBeenCalledTimes(1);
    rt.render(() => useWebBack(false, onBack));
    expect(index).toBe(1);
    expect(left).toBe(false);
    press(); // and the next Back asks again rather than leaving the page
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(left).toBe(false);
  });

  it('takes its step off when the app goes home by its own buttons', () => {
    const onBack = vi.fn();
    rt.render(() => useWebBack(false, onBack));
    rt.render(() => useWebBack(true, onBack)); // "Natrag" pressed in the app
    flush();
    expect(index).toBe(0);
    expect(onBack).not.toHaveBeenCalled(); // its own popstate is not a Back
    press();
    expect(left).toBe(true);
  });

  it('is what App hands the popstate to: the back guard first', () => {
    const app = src('App.tsx');
    expect(app).toMatch(/useWebBack\(launch === null && menu === 'home', \(\) => \{\s*if \(runBackGuard\(\)\) return;/);
  });
});

describe('leaving mid-match on the web', () => {
  it('asks while the match runs, not after it', () => {
    const t = src('src/TableScreen.tsx');
    expect(t).toMatch(/useLeaveWarning\(!matchOver\);/);
    const w = src('src/ui/webBack.ts');
    const warn = w.slice(w.indexOf('export function useLeaveWarning'));
    expect(warn).toMatch(/if \(!active \|\| Platform\.OS !== 'web'/);
    expect(warn).toMatch(/addEventListener\('beforeunload', onUnload\)/);
    expect(warn).toMatch(/removeEventListener\('beforeunload', onUnload\)/);
  });

  it('closes a picture or a question on Back instead of leaving the screen under it', () => {
    expect(src('src/net/OnlineGame.tsx')).toMatch(/useBackCloses\(qrOpen, \(\) => setQrOpen\(false\)\);/);
    expect(src('src/screens/ShopScreen.tsx')).toMatch(/useBackCloses\(confirming !== null, \(\) => setConfirming\(null\)\);/);
    expect(src('src/screens/SettingsScreen.tsx')).toMatch(/useBackCloses\(asking, \(\) => setAsking\(false\)\);/);
    const g = src('src/ui/backGuard.ts');
    const hook = g.slice(g.indexOf('export function useBackCloses'));
    expect(hook).toMatch(/if \(!open\) return;/);
    expect(hook).toMatch(/setBackGuard\(guard\);\s*return \(\) => clearBackGuard\(guard\);/);
    // Only its own guard is cleared: a screen mounting in the same commit keeps its one.
    expect(g).toMatch(/export function clearBackGuard\(guard: Guard\): void \{\s*if \(current === guard\) current = null;/);
  });
});

describe('the settings', () => {
  const s = src('src/screens/SettingsScreen.tsx');

  it('come in four sections, each a header', () => {
    const order = ['ui.setGeneral', 'ui.setGame', 'ui.setLook', 'ui.setData'].map((k) => s.indexOf(`{section(${k})}`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(s).toMatch(/accessibilityRole="header"/);
  });

  it('ask before erasing, and say what goes and what stays', () => {
    expect(s).not.toMatch(/armed/);
    expect(s).toMatch(/<PressScale onPress=\{\(\) => setAsking\(true\)\}/);
    const dialog = s.slice(s.indexOf('<ConfirmDialog'), s.indexOf('/>', s.indexOf('<ConfirmDialog')));
    expect(dialog).toMatch(/body=\{ui\.resetBody\}/);
    expect(dialog).toMatch(/onConfirm=\{\(\) => \{\s*setAsking\(false\);\s*onProfileChange\(resetProfile\(\)\);/);
    // resetProfile is reached from the dialog only.
    expect(s.match(/resetProfile\(\)/g)).toHaveLength(1);
  });

  it('put the loudness to sleep while the sound is off', () => {
    const vol = s.slice(s.indexOf('{ui.volumeLabel}') - 80, s.indexOf('VOLUME_OPTIONS[2]'));
    expect(vol).toMatch(/!settings\.sound && styles\.asleep/);
    const chip = s.slice(s.indexOf('VOLUME_OPTIONS[2]'), s.indexOf('</PressScale>', s.indexOf('VOLUME_OPTIONS[2]')));
    expect(chip).toMatch(/disabled=\{!settings\.sound\}/);
  });

  it('say what each difficulty changes, whichever is chosen', () => {
    expect(s).toMatch(/settings\.hardMode \? lang\.s\.difficultyHardHint : lang\.s\.difficultyEasyHint/);
  });
});

describe('the profile', () => {
  const p = src('src/screens/ProfileScreen.tsx');

  it('is where the name is typed, with the conduct rules beside it', () => {
    const field = p.indexOf('value={settings.nickname}');
    const rules = p.indexOf('{ui.nicknameRules} ↗');
    expect(field).toBeGreaterThan(-1);
    expect(rules).toBeGreaterThan(field);
    expect(p.slice(field, rules)).toMatch(/onChangeText=\{\(nickname\) => onSettingsChange\(\{ \.\.\.settings, nickname \}\)\}/);
    expect(p.slice(field, rules)).toMatch(/Linking\.openURL\(`https:\/\/belastih\.com\/#\$\{ui\.rulesAnchor\}`\)/);
  });

  it('puts on an owned face, and only an owned one', () => {
    expect(p).toMatch(/const owned = COSMETICS\.filter\(\(c\) => c\.kind === 'avatar' && isOwned\(profile, c\)\);/);
    expect(p).toMatch(/if \(!on\) onProfileChange\(selectCosmetic\(profile, c\)\);/);
    expect(p).toMatch(/accessibilityState=\{\{ checked: on \}\}/);
  });

  it('says how far the next level is and what it opens', () => {
    expect(p).toMatch(/p\.isMax \? ui\.xpMax : ui\.xpToNext\(p\.xp - p\.levelStart, p\.levelEnd - p\.levelStart, p\.level \+ 1\)/);
    expect(p).toMatch(/ui\.nextUnlock\(next\.requiredLevel, ui\.cosmeticName\(next\.id\)\)/);
  });

  it('App gives it both callbacks', () => {
    const app = src('App.tsx');
    const at = app.slice(app.indexOf('<ProfileScreen'), app.indexOf('/>', app.indexOf('<ProfileScreen')));
    expect(at).toMatch(/onSettingsChange=\{updateSettings\}/);
    expect(at).toMatch(/onProfileChange=\{updateProfile\}/);
  });
});

describe('the arranging tip', () => {
  const t = src('src/TableScreen.tsx');

  it('waits for a quiet moment with the cards all in', () => {
    expect(t).toMatch(
      /const tipMoment =\s*arrangeTip && !tipSaid\.current && !settled && !asking && !myTurn && hand\.cards\.length >= 6 && giftTarget === null && !leaving;/,
    );
    const eff = t.slice(t.indexOf('if (!tipMoment) return;'), t.indexOf('}, [tipMoment'));
    expect(eff).toMatch(/text: lang\.s\.ui\.arrangeTip/);
    expect(eff).toMatch(/fade: reducedRef\.current/);
    expect(eff).toMatch(/onArrangeTipRef\.current\?\.\(false\)/);
    expect(eff).toMatch(/return \(\) => clearTimeout\(t\);|clearTimeout/);
  });

  it('is learned by the long-press itself, and offered in two matches at most', () => {
    const lp = t.slice(t.indexOf('const toggleArranging = useCallback('), t.indexOf('}, []);', t.indexOf('const toggleArranging = useCallback(')));
    expect(lp).toMatch(/setArranging\(\(a\) => !a\);/);
    expect(lp).toMatch(/if \(arrangeTipRef\.current\) onArrangeTipRef\.current\?\.\(true\);/);
    expect(t).toMatch(/onLongPress=\{toggleArranging\}\s+delayLongPress=\{500\}/);
    for (const f of ['src/OfflineGame.tsx', 'src/net/OnlineGame.tsx']) {
      const g = src(f);
      expect(g, f).toMatch(/arrangeTip=\{settings\.arrangeTips < 2\}/);
      expect(g, f).toMatch(/arrangeTips: learned \? 2 : settings\.arrangeTips \+ 1/);
    }
  });
});

describe('a held card', () => {
  const t = src('src/TableScreen.tsx');

  it('starts arranging on my turn too, instead of ending as a tap that plays', () => {
    // The playable cards take the touch on my turn, so the fan's own hold never fired there.
    expect(t).toMatch(/onHold=\{toggleArranging\}/);
    expect(t).toMatch(/const onHoldCard = useCallback\(\(\) => holdRef\.current\?\.\(\), \[\]\);/);
    expect(t).toMatch(/onPress=\{onPressCard\}\s+onLongPress=\{onHoldCard\}/);
    const card = t.slice(t.indexOf('const FanCard = memo('));
    expect(card).toMatch(/onPress=\{press\}\s+onLongPress=\{onLongPress\}\s+delayLongPress=\{500\}/);
    // A memoised card must see its hold handler as a prop like any other.
    expect(card).toMatch(/a\.onLongPress === b\.onLongPress/);
  });

  it('gives way to the zvanja question, where a tap marks', () => {
    const lp = t.slice(t.indexOf('const toggleArranging = useCallback('), t.indexOf('}, []);', t.indexOf('const toggleArranging = useCallback(')));
    expect(lp).toMatch(/^const toggleArranging = useCallback\(\(\) => \{\s*if \(declaringRef\.current\) return;/);
    expect(t).toMatch(/useEffect\(\(\) => \{\s*if \(declaring\) setArranging\(false\);\s*\}, \[declaring\]\);/);
  });
});

describe('the shop', () => {
  const s = src('src/screens/ShopScreen.tsx');

  it('asks before it spends, and says why a tile cannot be had', () => {
    expect(s).toMatch(/<ConfirmDialog/);
    expect(s).toMatch(/ui\.shopWhyLocked\(/);
    expect(s).toMatch(/ui\.shopWhyCoins\(/);
  });
});
