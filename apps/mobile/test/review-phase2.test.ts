import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cardId,
  legalPlays,
  pointValue,
  rankPower,
  type Card,
  type PlayContext,
  type PublicView,
  type Seat,
  type Suit,
  type TrickPlay,
} from '@belot/engine';
import { Table, type TableEvent } from '@belot/table';
import { Lang, LOCALE_IDS } from '@belot/i18n';
import { MATCH_TARGETS } from '../../server/src/protocol';
import { MATCH_TARGETS_P } from '../src/net/clock';
import { illegalReason } from '../src/table/illegal';
import { botThinkMs } from '../src/anim/think';
import { Director, ZERO_TIMINGS, type Batch } from '../src/anim/director';
import { EMPTY_LOG, logEvent, summarize } from '../src/matchLog';
import { groupKey, recordMatch, SEEN_KEEP } from '../src/net/series';
import { localeFor } from '../src/locale';
import { PLAIN_LINE, TRUMP_LINE } from '../src/table/rulesCards';
import { EMOTES } from '../src/emotes';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string) => readFileSync(join(here, '..', f), 'utf8');
const server = (f: string) => readFileSync(join(here, '../../server/src', f), 'utf8');
const c = (suit: Suit, rank: Card['rank']): Card => ({ suit, rank });

describe('a private table-s rules, in one place', () => {
  it('offers the same match lengths the server takes', () => {
    expect([...MATCH_TARGETS_P]).toEqual([...MATCH_TARGETS]);
    expect(MATCH_TARGETS).toContain(1001);
  });

  it('are the host-s, before the start, at a private table - and reach the game', () => {
    const room = server('BelaRoom.ts');
    const rules = room.slice(room.indexOf("if (packet.type === 'rules')"), room.indexOf("if (packet.type === 'pause')"));
    expect(rules).toMatch(/if \(this\.started \|\| this\.isPublic \|\| seat !== this\.actingHostSeat\(\)\) return;/);
    expect(rules).toMatch(/MATCH_TARGETS\.includes\(m\.target\)/);
    expect(rules).toMatch(/this\.buildTable\(\);/);
    // The table is built with them (the smoke plays a 501 match to its end).
    expect(room).toMatch(/config: \{ \.\.\.MODE_CONFIG\[this\.mode\], matchTarget: this\.target \}/);
    expect(room).toMatch(/target: this\.target,/);
  });

  it('are shown to everyone in the lobby, changed only by the host', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/label=\{ui\.matchLength\}/);
    expect(o).toMatch(/label=\{net\.lang\.s\.difficulty\}/);
    expect(o).toMatch(/label=\{ui\.turnClock\}/);
    expect(o).toMatch(/disabled=\{!host\}/);
    expect(o).toMatch(/accessibilityState=\{\{ checked: o\.on, disabled: !host \}\}/);
    // And the table says them: the length, and the version beside it, always.
    const t = src('src/TableScreen.tsx');
    expect(t).toMatch(/\{lang\.s\.gameToTarget\(target\)\} · \{modeName\(lang, mode\)\}/);
    expect(o).toMatch(/matchTarget=\{net\.target\}/);
  });
});

describe('the lobby', () => {
  it('says which chair plays with me and which against, in words, without a gendered noun', () => {
    const m = src('src/net/SeatMap.tsx');
    expect(m).toMatch(/isPartner\(seat, mySeat\) \? lang\.s\.ui\.withYou : lang\.s\.ui\.againstYou/);
    const hr = new Lang('hr').s.ui;
    expect([hr.withYou, hr.againstYou]).toEqual(['s tobom', 'protiv tebe']);
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      expect(ui.withYou).not.toBe(ui.againstYou);
    }
  });

  it('in quick play, looks for players and after 15 s offers the bots', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/export const QUICK_BOTS_OFFER_MS = 15_000;/);
    expect(o).toMatch(/const offerBots = quick && longWait && canStart;/);
    expect(o).toMatch(/quick\s*\?\s*ui\.searchingPlayers\(seated\)\s*:\s*ui\.waitingForPlayers\(seated\)/);
    // Somebody new sitting down restarts the wait.
    expect(o).toMatch(/\}, \[quick, net\.status, seated\]\);/);
  });

  it('gives every table a code friends can read, quick play too', () => {
    const room = server('BelaRoom.ts');
    const assigned = room.indexOf('this.roomId = tableCode((c) => liveCodes.has(c));');
    expect(assigned).toBeGreaterThan(-1);
    expect(assigned).toBeLessThan(room.indexOf('if (options.private) {'));
  });

  it('shows the invite as a QR code of the same link', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/const link = `https:\/\/belastih\.com\/join\/\$\{net\.roomId\}`;/);
    expect(o).toMatch(/<QrCode text=\{link\}/);
    expect(o).toMatch(/onRequestClose=\{\(\) => setQrOpen\(false\)\}/);
  });

  it('home says the big IGRAJ is online play', () => {
    const h = src('src/HomeScreen.tsx');
    const hero = h.indexOf('<TableHero');
    const sub = h.indexOf('{ui.playOnlineSub}');
    expect(hero).toBeGreaterThan(-1);
    expect(sub).toBeGreaterThan(hero);
    expect(sub).toBeLessThan(h.indexOf('<View style={styles.modeRow}>'));
  });
});

describe('a dimmed card, tapped, says why', () => {
  const ctx: PlayContext = { contractType: 'SUIT', trumpSuit: 'hearts' };
  const why = (hand: Card[], trick: TrickPlay[], card: Card) => {
    const legal = legalPlays({ hand, trick, mySeat: 0, ctx, forcedOvertrumpOverPartner: true });
    return illegalReason(card, legal, trick, 'hearts');
  };

  it('follow the suit', () => {
    const hand = [c('spades', 'A'), c('clubs', '7'), c('hearts', '9')];
    const trick = [{ seat: 1 as Seat, card: c('spades', '10') }];
    expect(why(hand, trick, c('clubs', '7'))).toEqual({ kind: 'follow', suit: 'spades' });
    expect(why(hand, trick, c('hearts', '9'))).toEqual({ kind: 'follow', suit: 'spades' });
    expect(why(hand, trick, c('spades', 'A'))).toBeNull();
  });

  it('trump when the suit is gone - even over the partner', () => {
    const hand = [c('clubs', '7'), c('hearts', '8')];
    const trick = [
      { seat: 2 as Seat, card: c('spades', 'A') },
      { seat: 3 as Seat, card: c('spades', '7') },
    ];
    expect(why(hand, trick, c('clubs', '7'))).toEqual({ kind: 'trump' });
  });

  it('beat it when a higher card is held (iber)', () => {
    const hand = [c('spades', 'A'), c('spades', '7')];
    const trick = [{ seat: 1 as Seat, card: c('spades', 'K') }];
    expect(why(hand, trick, c('spades', '7'))).toEqual({ kind: 'beat' });
    // Over-trumping, too.
    const hand2 = [c('hearts', 'J'), c('hearts', '7'), c('clubs', '8')];
    const trick2 = [
      { seat: 1 as Seat, card: c('spades', 'K') },
      { seat: 2 as Seat, card: c('hearts', '10') },
    ];
    expect(why(hand2, trick2, c('hearts', '7'))).toEqual({ kind: 'beat' });
    expect(why(hand2, trick2, c('clubs', '8'))).toEqual({ kind: 'trump' });
  });

  it('never for a lead, and never in Prava bela', () => {
    const hand = [c('spades', 'A'), c('clubs', '7')];
    expect(why(hand, [], c('clubs', '7'))).toBeNull();
    const t = src('src/TableScreen.tsx');
    expect(t).toMatch(/if \(card && plays\.length > 0 && !freePlay\) \{/);
    expect(t).toMatch(/disabled=\{!playable && !arranging && !marking && !illegalNow\}/);
    expect(t).toMatch(/onIllegal=\{explainIllegal\}/);
    // The words: the led suit's pip goes with "follow", so no suit is declined.
    expect(t).toMatch(/\.\.\.\(why\.kind === 'follow' \? \{ pip: why\.suit \} : \{\}\)/);
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      expect(new Set([ui.mustFollow, ui.mustTrump, ui.mustBeat, ui.moveRefused]).size).toBe(4);
    }
  });
});

describe('the last trick, looked at', () => {
  it('is offered on my turn in play, for this deal-s last trick only', () => {
    const t = src('src/TableScreen.tsx');
    expect(t).toMatch(
      /const peekable =\s*view\.phase === 'PLAY' &&\s*myTurn &&\s*!settled &&\s*lastTrick\.current !== null &&\s*lastTrick\.current\.after === view\.dealProgress\?\.tricksPlayed;/,
    );
    expect(t).toMatch(/lastTrick\.current = \{ plays: view\.currentTrick, after: view\.dealProgress\.tricksPlayed \+ 1 \};/);
    expect(t).toMatch(/export const PEEK_MS = 4000;/);
    // Its name where it fits, an eye where the side cards leave 26-28.
    expect(t).toMatch(/export const PEEK_TEXT_W = 44;/);
    expect(t).toMatch(/\{peekW >= PEEK_TEXT_W \? \(\s*<Text style=\{\[styles\.peekText/);
    expect(t).toMatch(/<Eye size=\{16\} colour=\{peeking \? theme\.accent : ink\.mid\} \/>/);
    expect(t).toMatch(/const peekW = Math\.min\(56, 2 \* Math\.round\(slot\.slotW \* \(31 \/ 46\)\) - 14\);/);
    expect(t).toMatch(/const shownTrick = peeking && peekable \? lastTrick\.current!\.plays : view\.currentTrick;/);
  });
});

describe('bots think at their own pace', () => {
  const view = (trick: number) => ({ currentTrick: new Array(trick).fill({ seat: 1, card: c('spades', '7') }) }) as unknown as PublicView;
  const card: TableEvent = { kind: 'cardPlayed', seat: 1, card: c('spades', '7') };

  it('a follow may be quick, a lead takes longer, a call longest', () => {
    expect(botThinkMs(card, view(2), 0)).toBe(0);
    expect(botThinkMs(card, view(2), 0.999)).toBeLessThanOrEqual(200);
    expect(botThinkMs(card, view(0), 0)).toBeGreaterThanOrEqual(100);
    expect(botThinkMs(card, view(0), 0.999)).toBeLessThanOrEqual(400);
    expect(botThinkMs({ kind: 'bidCalled', seat: 1, suit: 'hearts' }, view(0), 0)).toBeGreaterThanOrEqual(350);
    expect(botThinkMs({ kind: 'trickWon', seat: 1, trickNumber: 1, points: 10, isLastTrick: false }, view(0), 0.5)).toBe(0);
  });

  it('only for bots: never my moves, never a person online, never under reduce-motion', () => {
    const g = src('src/useGame.ts');
    expect(g).toMatch(/motionRef\.current !== 'reduced' && 'seat' in e && e\.seat !== HUMAN \? botThinkMs\(e, v, Math\.random\(\)\) : 0/);
    const n = src('src/net/useNetGame.ts');
    expect(n).toMatch(/e\.seat !== mySeatRef\.current &&\s*seatsRef\.current\[e\.seat\]\?\.bot === true/);
  });

  describe('in the director', () => {
    afterEach(() => vi.useRealTimers());
    it('holds before the move, lights the thinker, and a fast-forward mid-think flushes it', () => {
      vi.useFakeTimers();
      const table = new Table({ humanSeats: [0], seed: 11 });
      const initial = table.view(0);
      const started: string[] = [];
      const flushed: string[] = [];
      const thought: string[] = [];
      const d = new Director(0, initial, {
        onView: () => {},
        onEventStart: (e, f) => (f ? flushed : started).push(e.kind),
        onIdle: () => {},
        thinkMs: (e) => (e.kind === 'bidPassed' ? 300 : 0),
        onThink: (e) => thought.push(e.kind),
      }, ZERO_TIMINGS);
      const batch: Batch = {
        events: [
          { kind: 'bidPassed', seat: 1 },
          { kind: 'bidPassed', seat: 2 },
        ],
        finalView: initial,
      };
      d.enqueue(batch);
      expect(started).toEqual([]);
      expect(thought).toEqual(['bidPassed']);
      vi.advanceTimersByTime(299);
      expect(started).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(started).toEqual(['bidPassed']);
      // The second one is thinking now; skip ahead: it is flushed, not lost.
      expect(thought).toEqual(['bidPassed', 'bidPassed']);
      d.fastForward();
      expect(flushed).toEqual(['bidPassed']);
      vi.advanceTimersByTime(1000);
      expect(started).toEqual(['bidPassed']);
    });
  });
});

describe('more quick phrases, each no wider than the rail-s chip', () => {
  it('are the fixed list, both sides', () => {
    const ids = EMOTES.map((e) => e.id);
    for (const id of ['dobro', 'ups', 'idemo']) expect(ids).toContain(id);
  });

  it('fit: measured in Rubik-700 at 13 px, none past en "Thanks!" (50.9)', () => {
    // Measured widths (dp) of every phrase; "Dobar potez!" was 82 and
    // "Let's go!" 54. A phrase changed here must be measured again.
    const MEASURED: Record<string, number> = {
      'Dobro!': 43, 'Добро!': 46, 'Great!': 40.4,
      'Ups!': 28.6, 'Упс!': 27.5, 'My bad!': 48.8,
      'Idemo!': 43.8, 'Идемо!': 47.5, "Let's go": 50.5,
    };
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      for (const e of ['dobro', 'ups', 'idemo']) {
        const text = ui.emotePhrase(e);
        expect(MEASURED[text], `${id} ${e}: "${text}" unmeasured`).toBeDefined();
        expect(MEASURED[text]!).toBeLessThanOrEqual(50.9);
      }
    }
  });

  it('scroll inside the box instead of growing it', () => {
    const s = src('src/table/EmoteStrip.tsx');
    expect(s).toMatch(/<View style=\{vertical \? styles\.phraseBox : styles\.phraseRow\}>\s*<ScrollView\s*horizontal=\{!vertical\}/);
  });
});

describe('the sheet explains itself', () => {
  it('who called, on which trump, and the verdict in the callers- numbers', () => {
    const t = src('src/TableScreen.tsx');
    expect(t).toMatch(/call\.name === null \? lang\.s\.calledByYou : lang\.s\.calledBy\(call\.name\)/);
    expect(t).toMatch(/\{call\.trump && <SuitPip suit=\{call\.trump\} size=\{14\} \/>\}/);
    expect(t).toMatch(
      /\(made \? lang\.s\.ui\.madeLine : lang\.s\.ui\.padLine\)\(\s*call\.team === us,\s*result\.rawTotal\[call\.team\],\s*result\.rawTotal\[\(1 - call\.team\) as TeamId\],\s*\)/,
    );
    const hr = new Lang('hr').s.ui;
    expect(hr.madeLine(true, 96, 66)).toBe('Prošli smo, 96 prema 66.');
    expect(hr.padLine(false, 76, 86)).toBe('Pad: 76 prema 86, a zvač mora imati više. Sve ide nama.');
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      expect(ui.madeLine(true, 1, 2)).not.toBe(ui.madeLine(false, 1, 2));
      expect(ui.padLine(true, 3, 4)).toMatch(/3.*4/);
    }
  });

  it('with the series from our side, as the header has it', () => {
    expect(src('src/TableScreen.tsx')).toMatch(/series=\{series \? \[series\[us\], series\[them\]\] : null\}/);
  });
});

describe('the match, summed up', () => {
  const scored = (a: number, b: number): TableEvent =>
    ({ kind: 'dealScored', result: { finalScore: [a, b] }, matchScores: [0, 0] }) as unknown as TableEvent;

  it('deals taken and our best, when the whole match was seen', () => {
    let log = EMPTY_LOG;
    for (const [a, b] of [[100, 62], [0, 182], [120, 42], [90, 72]] as const) log = logEvent(log, scored(a, b));
    expect(summarize(log, [310, 358], 0)).toEqual({ won: [3, 1], best: { points: 120, deal: 3 } });
    expect(summarize(log, [310, 358], 1)).toEqual({ won: [3, 1], best: { points: 182, deal: 2 } });
  });

  it('nothing rather than something wrong after a missed deal, and a new match starts clean', () => {
    let log = logEvent(EMPTY_LOG, scored(100, 62));
    expect(summarize(log, [300, 62], 0)).toBeNull();
    log = logEvent(log, { kind: 'matchStarted', matchNumber: 1 });
    expect(log.deals).toEqual([]);
    expect(summarize(log, [0, 0], 0)).toBeNull();
  });

  it('is fed every event in both games, and shown only at the end', () => {
    for (const f of ['src/useGame.ts', 'src/net/useNetGame.ts']) {
      expect(src(f)).toMatch(/const logged = logEvent\(matchLogRef\.current, e\);/);
    }
    expect(src('src/TableScreen.tsx')).toMatch(/summary=\{matchOver && matchLog \? summarize\(matchLog, matchScores, teamOf\(mySeat\)\) : null\}/);
  });
});

describe('the same four, across evenings', () => {
  it('are one group however they sit or spell, two when partners swap', () => {
    const a = groupKey(['Ana', 'Ivo'], ['Marko', 'petra ']);
    expect(groupKey(['ivo', 'ana'], ['Petra', 'MARKO'])).toBe(a);
    expect(groupKey(['Ana', 'Marko'], ['Ivo', 'Petra'])).not.toBe(a);
  });

  it('count each match once, and remember a bounded list', () => {
    let book = recordMatch({}, 'k', 'd1:ABCDE:0', true);
    book = recordMatch(book, 'k', 'd1:ABCDE:0', true);
    expect(book.k).toMatchObject({ us: 1, them: 0 });
    book = recordMatch(book, 'k', 'd1:ABCDE:1', false);
    expect(book.k).toMatchObject({ us: 1, them: 1 });
    for (let i = 0; i < SEEN_KEEP + 10; i++) book = recordMatch(book, 'k', `m${i}`, true);
    expect(book.k!.seen.length).toBe(SEEN_KEEP);
  });

  it('only a table of four people, a dropped friend included; "Revanš!" for them', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/const fourPeople = net\.seats\.length === 4 && net\.seats\.every\(\(s\) => s\.name !== SERVER_FALLBACK\(s\.seat\)\);/);
    expect(o).toMatch(/const id = `\$\{isoDay\(new Date\(\)\)\}:\$\{net\.roomId\}:\$\{net\.matchNumber\}`;/);
    expect(o).toMatch(/rematchLabel=\{fourPeople \? net\.lang\.s\.ui\.revans : undefined\}/);
    expect(o).toMatch(/series=\{shownSeries\}/);
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      expect(ui.revans).not.toBe(ui.playAgain);
    }
  });
});

describe('Kako se igra', () => {
  it('shows the cards in the engine-s own order and points', () => {
    const trump: PlayContext = { contractType: 'SUIT', trumpSuit: 'hearts' };
    const check = (line: typeof TRUMP_LINE, suit: Suit) => {
      let prev = Infinity;
      let sum = 0;
      for (const [rank, points] of line) {
        const card = c(suit, rank);
        expect(pointValue(card, trump), `${suit} ${rank}`).toBe(points);
        const power = rankPower(card, trump);
        expect(power).toBeLessThan(prev);
        prev = power;
        sum += points;
      }
      return sum;
    };
    // 62 in trump and 30 in each of the three others: 152, as the note says.
    expect(check(TRUMP_LINE, 'hearts') + 3 * check(PLAIN_LINE, 'spades')).toBe(152);
  });

  it('says the engine-s numbers in every language', () => {
    for (const id of LOCALE_IDS) {
      const r = new Lang(id).s.rules;
      const all = [...r.sections.flatMap((s) => s.lines), r.cardsNote].join(' ');
      for (const n of ['1001', '501', '701', '20', '50', '100', '200', '150', '152', '162', '90', '10']) {
        expect(all, `${id} says ${n}`).toMatch(new RegExp(`\\b${n}\\b`));
      }
      expect(r.sections.length).toBeGreaterThanOrEqual(5);
      expect(r.glossary.length).toBeGreaterThanOrEqual(10);
    }
    // Serbian all in Cyrillic.
    const sr = new Lang('sr-Cyrl').s.rules;
    const srText = [sr.title, sr.cardsTitle, sr.trumpRow, sr.plainRow, sr.cardsNote, sr.glossaryTitle, ...sr.sections.flatMap((s) => [s.title, ...s.lines]), ...sr.glossary.flat()].join(' ');
    expect(srText).not.toMatch(/[A-Za-zČĆĐŠŽčćđšž]/);
  });

  it('opens from home and from settings', () => {
    const app = src('App.tsx');
    expect(app).toMatch(/menu === 'rules' \? \(\s*<RulesScreen/);
    expect(src('src/HomeScreen.tsx')).toMatch(/<Button label=\{lang\.s\.rules\.title\} tone="plain" onPress=\{onOpenRules\} \/>/);
    expect(src('src/screens/SettingsScreen.tsx')).toMatch(/<Button label=\{lang\.s\.rules\.title\} tone="plain" onPress=\{onOpenRules\} \/>/);
  });
});

describe('the first launch speaks the phone-s language', () => {
  it('maps the phone-s language to one of ours', () => {
    expect(localeFor('hr-HR')).toBe('hr');
    expect(localeFor('bs')).toBe('hr');
    expect(localeFor('sr-Latn-RS')).toBe('sr-Cyrl');
    expect(localeFor('sr_RS')).toBe('sr-Cyrl');
    expect(localeFor('en-GB')).toBe('en');
    expect(localeFor('de-AT')).toBe('en');
    expect(localeFor(undefined)).toBe('hr');
  });

  it('only when nothing at all is stored, and keeps it', () => {
    const s = src('src/storage.ts');
    expect(s).toMatch(/if \(store\.getString\(KEY\.settings\) === undefined && store\.getString\(KEY\.profile\) === undefined\) \{\s*const first = \{ \.\.\.DEFAULT_SETTINGS, locale: localeFor\(deviceTag\(\)\) \};\s*write\(KEY\.settings, first\);\s*return first;/);
  });
});

// Identity of card ids is used by the peek and the shake.
it('card ids are stable strings', () => {
  expect(cardId(c('hearts', 'J'))).toBe(cardId(c('hearts', 'J')));
});
