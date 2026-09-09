import { describe, expect, it, vi } from 'vitest';

// The hook's module pulls in the sound bank (wav requires) and haptics;
// neither loads under node, and neither is what this tests.
vi.mock('../src/audio', () => ({ playSfx: vi.fn() }));
vi.mock('../src/haptics', () => ({ buzz: vi.fn(), doubleBuzz: vi.fn() }));

import { cueEdge, type CueState } from '../src/table/useTurnCues';

/**
 * The one property the turn cues rest on: a drain of suppressed views yields
 * exactly one edge, at the terminal sync. The hook is a thin shell over
 * `cueEdge`; this scripts the commits it would see.
 */

const quiet: CueState = { myTurn: false, declaring: false };

function replay(states: (CueState & { settled?: boolean })[]) {
  let was: CueState = quiet;
  const edges: string[] = [];
  for (const s of states) {
    const now = { myTurn: s.myTurn, declaring: s.declaring };
    const e = cueEdge(was, now, s.settled ?? false);
    was = now;
    if (e) edges.push(e);
  }
  return edges;
}

describe('cueEdge', () => {
  it('fires once at the end of a drain of suppressed views', () => {
    // The director suppresses toAct/mustDeclare/canDeclare on every
    // intermediate view; only the terminal sync carries them.
    const drain = Array.from({ length: 9 }, () => quiet);
    expect(replay([...drain, { myTurn: true, declaring: false }])).toEqual(['turn']);
  });

  it('does not fire again while the turn is simply held', () => {
    const mine = { myTurn: true, declaring: false };
    expect(replay([mine, mine, mine])).toEqual(['turn']);
  });

  it('fires again after the next drain', () => {
    const mine = { myTurn: true, declaring: false };
    expect(replay([mine, quiet, quiet, mine])).toEqual(['turn', 'turn']);
  });

  it('lets the call win when both edges land in one commit', () => {
    expect(replay([{ myTurn: true, declaring: true }])).toEqual(['declare']);
  });

  it('stays quiet once the deal has settled, and remembers the state anyway', () => {
    const mine = { myTurn: true, declaring: false };
    expect(replay([{ ...mine, settled: true }, mine])).toEqual([]);
  });
});
