import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teamOf } from '@belot/engine';
import { Table, type TableEvent } from '@belot/table';
import { emptyProfile } from '@belot/progression';

vi.mock('../src/audio', () => ({ playSfx: vi.fn() }));
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  impactAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
}));

import * as Haptics from 'expo-haptics';
import { playSfx } from '../src/audio';
import { emptyTally, processEvents, SILENT_EVENTS } from '../src/feedback';

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
    haptics: true,
    silent,
  });
}

beforeEach(() => {
  sfx.mockClear();
  vi.mocked(Haptics.impactAsync).mockClear();
});

describe('every event kind is scored', () => {
  it('the sample covers every kind the table can emit', () => {
    for (const kind of KINDS) expect(byKind.has(kind), kind).toBe(true);
  });

  for (const kind of KINDS) {
    it(`${kind}: ${SILENT_EVENTS.includes(kind) ? 'is silent by declaration' : 'makes a sound'}`, () => {
      run([byKind.get(kind)!]);
      expect(heard().length > 0).toBe(!SILENT_EVENTS.includes(kind));
    });
  }
});

describe('a flushed replay', () => {
  it('makes no sound and no buzz, and pays out exactly the same', () => {
    const loud = run(aMatch);
    expect(heard().length).toBeGreaterThan(50);
    sfx.mockClear();
    vi.mocked(Haptics.impactAsync).mockClear();

    const quiet = run(aMatch, true);
    expect(heard()).toEqual([]);
    expect(vi.mocked(Haptics.impactAsync)).not.toHaveBeenCalled();
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

  it('the match ends on a fanfare, not a coin ding', () => {
    const over = byKind.get('matchOver')! as Extract<TableEvent, { kind: 'matchOver' }>;
    const won = over.winner === teamOf(MY_SEAT);
    const r = run([over]);
    expect(r.award?.coins ?? 0).toBeGreaterThan(0); // there ARE coins to ding for
    expect(heard()).toContain(won ? 'matchWon' : 'matchLost');
    expect(heard()).not.toContain('coin');
    expect(heard()).not.toContain('levelup');

    sfx.mockClear();
    const lost = { ...over, winner: (over.winner === 0 ? 1 : 0) as typeof over.winner };
    run([lost]);
    expect(heard()).toContain(won ? 'matchLost' : 'matchWon');
  });

  it('a scored deal still dings its coins', () => {
    const scored = byKind.get('dealScored')!;
    const r = run([scored]);
    if ((r.award?.coins ?? 0) > 0 && r.award?.levelUp === null) expect(heard()).toContain('coin');
    expect(heard().some((n) => n === 'win' || n === 'lose')).toBe(true);
  });
});
