import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { teamOf } from '@belot/engine';
import { Table, type TableEvent } from '@belot/table';
import { emptyProfile } from '@belot/progression';

vi.mock('../src/audio', () => ({ playSfx: vi.fn() }));
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
}));

import * as Haptics from 'expo-haptics';
import { playSfx } from '../src/audio';
import { emptyTally, landingSound, processEvents, SILENT_EVENTS } from '../src/feedback';
import manifest from '../assets/sfx/manifest.json';

/**
 * The event → sound switch, checked against the real event stream rather
 * than hand-built objects: every kind the table can emit is either heard or
 * on the silent list, a flushed replay is inaudible but pays out the same,
 * and the match's end is a fanfare and not a coin.
 */

/** Written out in full so a new event kind fails here until someone scores it. */
const KINDS: TableEvent['kind'][] = [
  'dealStarted',
  'bidPassed',
  'bidCalled',
  'doubled',
  'doublePassed',
  'handsCompleted',
  'declared',
  'declarationSkipped',
  'declarationsRevealed',
  'belaCalled',
  'cardPlayed',
  'trickWon',
  'dealScored',
  'matchOver',
  'matchStarted',
];

const MY_SEAT = 0;
const sfx = vi.mocked(playSfx);
const heard = () => sfx.mock.calls.map((c) => c[0]);

/**
 * The bots never call kontra, so the two doubling events never occur in bot
 * play; their payloads are trivial enough to build by hand.
 */
const HAND_BUILT: TableEvent[] = [
  { kind: 'doubled', seat: 1, multiplier: 2 },
  { kind: 'doublePassed', seat: 1 },
];

/** Whole seeded matches, drained, until one real event of every kind is in hand. */
function sampleEvents(): { byKind: Map<TableEvent['kind'], TableEvent>; aMatch: TableEvent[] } {
  const byKind = new Map<TableEvent['kind'], TableEvent>(HAND_BUILT.map((e) => [e.kind, e]));
  let aMatch: TableEvent[] = [];
  for (let seed = 1; seed <= 80 && byKind.size < KINDS.length; seed++) {
    const t = new Table({ seed });
    t.playWholeMatch();
    const events = t.drainEvents();
    t.newMatch({ seed: seed + 1000 });
    events.push(...t.drainEvents());
    if (aMatch.length === 0) aMatch = events;
    for (const e of events) if (!byKind.has(e.kind)) byKind.set(e.kind, e);
  }
  return { byKind, aMatch };
}

const { byKind, aMatch } = sampleEvents();

function run(events: TableEvent[], silent = false) {
  return processEvents({
    events,
    profile: emptyProfile(),
    tally: emptyTally(),
    mySeat: MY_SEAT,
    silent,
  });
}

beforeEach(() => {
  // A multi-step pattern schedules its later taps on timers; frozen here so
  // one test's fanfare cannot land inside the next test's silence.
  vi.useFakeTimers();
  sfx.mockClear();
  vi.mocked(Haptics.impactAsync).mockClear();
  vi.mocked(Haptics.notificationAsync).mockClear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('every event kind is scored', () => {
  it('the sample covers every kind the table can emit', () => {
    for (const kind of KINDS) expect(byKind.has(kind), kind).toBe(true);
  });

  for (const kind of KINDS) {
    it(`${kind}: ${SILENT_EVENTS.includes(kind) ? 'is silent by declaration' : 'makes a sound'}`, () => {
      const e = byKind.get(kind)!;
      // A card of MINE sounds as it leaves the hand; another seat's sounds as
      // it lands, from the end-of-beat (tested below). A scored deal's
      // stinger is at the end too, with the sheet.
      run([e.kind === 'cardPlayed' ? { ...e, seat: MY_SEAT } : e]);
      if (kind === 'dealScored') landingSound(e, MY_SEAT);
      expect(heard().length > 0).toBe(!SILENT_EVENTS.includes(kind));
      // ...and every name it asked for is a real file in the bank.
      for (const name of heard()) expect(Object.keys(manifest)).toContain(name);
    });
  }

  it("an opponent's card is silent as it leaves and sounds as it lands", () => {
    const e = byKind.get('cardPlayed')! as Extract<TableEvent, { kind: 'cardPlayed' }>;
    run([{ ...e, seat: ((MY_SEAT + 1) % 4) as typeof e.seat }]);
    expect(heard()).toEqual([]);
    landingSound({ ...e, seat: ((MY_SEAT + 1) % 4) as typeof e.seat }, MY_SEAT);
    expect(heard()).toEqual(['play']);
    sfx.mockClear();
    landingSound({ ...e, seat: MY_SEAT }, MY_SEAT);
    expect(heard()).toEqual([]); // mine already sounded at the tap
  });
});

describe('a flushed replay', () => {
  it('makes no sound and no buzz, and pays out exactly the same', () => {
    const loud = run(aMatch);
    expect(heard().length).toBeGreaterThan(50);
    expect(vi.mocked(Haptics.notificationAsync)).toHaveBeenCalled(); // the match's own verdict
    sfx.mockClear();
    vi.mocked(Haptics.impactAsync).mockClear();
    vi.mocked(Haptics.notificationAsync).mockClear();

    const quiet = run(aMatch, true);
    expect(heard()).toEqual([]);
    expect(vi.mocked(Haptics.impactAsync)).not.toHaveBeenCalled();
    expect(vi.mocked(Haptics.notificationAsync)).not.toHaveBeenCalled();
    expect(quiet.profile).toEqual(loud.profile);
    expect(quiet.award).toEqual(loud.award);
  });
});

describe('the sounds that carry meaning', () => {
  it('the last trick has its own sound; the others pitch by whose it was', () => {
    const trick = byKind.get('trickWon')! as Extract<TableEvent, { kind: 'trickWon' }>;
    const mine = ((MY_SEAT + 2) % 4) as typeof trick.seat; // partner: my team
    const theirs = ((MY_SEAT + 1) % 4) as typeof trick.seat;

    run([{ ...trick, seat: mine, isLastTrick: false }]);
    expect(sfx).toHaveBeenLastCalledWith('trick', { rate: 1 });
    run([{ ...trick, seat: theirs, isLastTrick: false }]);
    expect(sfx).toHaveBeenLastCalledWith('trick', { rate: 0.85 });
    run([{ ...trick, seat: theirs, isLastTrick: true }]);
    expect(sfx).toHaveBeenLastCalledWith('lastTrick');
  });

  it('a pass knocks, a call is its own sound, kontra is a challenge', () => {
    run([{ kind: 'bidPassed', seat: 1 }]);
    expect(heard()).toEqual(['knock']);
    sfx.mockClear();
    run([byKind.get('bidCalled')!]);
    expect(heard()).toEqual(['call']);
    sfx.mockClear();
    run([{ kind: 'doubled', seat: 1, multiplier: 4 }]);
    expect(sfx).toHaveBeenLastCalledWith('kontra', { rate: 1.12 });
    sfx.mockClear();
    landingSound(byKind.get('bidCalled')!, MY_SEAT);
    expect(heard()).toEqual(['stamp']);
  });

  it('the match ends on a fanfare, not a coin ding', () => {
    const over = byKind.get('matchOver')! as Extract<TableEvent, { kind: 'matchOver' }>;
    const won = over.winner === teamOf(MY_SEAT);
    const r = run([over]);
    expect(r.award?.coins ?? 0).toBeGreaterThan(0); // there ARE coins to ding for
    expect(heard()).toContain(won ? 'matchWon' : 'matchLost');
    expect(heard()).not.toContain('coin');
    expect(heard()).not.toContain('levelup');
    expect(vi.mocked(Haptics.notificationAsync)).toHaveBeenCalled(); // won or lost, the phone says so

    sfx.mockClear();
    const lost = { ...over, winner: (over.winner === 0 ? 1 : 0) as typeof over.winner };
    run([lost]);
    expect(heard()).toContain(won ? 'matchLost' : 'matchWon');
  });

  it('a scored deal keeps its verdict for the end, and never dings here', () => {
    const scored = byKind.get('dealScored')! as Extract<TableEvent, { kind: 'dealScored' }>;
    run([scored]);
    expect(heard()).not.toContain('coin');
    expect(heard()).not.toContain('levelup');
    expect(heard().some((n) => n === 'win' || n === 'lose')).toBe(false);
    sfx.mockClear();
    landingSound(scored, MY_SEAT);
    expect(heard().some((n) => n === 'win' || n === 'lose')).toBe(true);
    expect(vi.mocked(Haptics.notificationAsync)).toHaveBeenCalledTimes(1);
  });

  it('a bigger zvanje calls higher', () => {
    const declared = byKind.get('declared')! as Extract<TableEvent, { kind: 'declared' }>;
    run([{ ...declared, declarations: [{ ...declared.declarations[0]!, value: 20 }] }]);
    expect(sfx).toHaveBeenLastCalledWith('zvanje', { rate: 1 });
    run([{ ...declared, declarations: [{ ...declared.declarations[0]!, value: 150 }] }]);
    expect(sfx).toHaveBeenLastCalledWith('zvanje', { rate: 1.18 });
  });

  it('a štiglja announces itself as the beat starts', () => {
    const scored = byKind.get('dealScored')! as Extract<TableEvent, { kind: 'dealScored' }>;
    run([{ ...scored, result: { ...scored.result, valatTeam: 1 } }]);
    expect(heard()).toContain('stiglja');
  });
});
