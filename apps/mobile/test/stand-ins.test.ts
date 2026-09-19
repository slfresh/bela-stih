import { describe, expect, it } from 'vitest';
import type { Seat } from '@belot/engine';
import { notePeople, standInsOf } from '../src/net/standIns';

const seat = (s: Seat, bot: boolean) => ({ seat: s, bot });
const lobby = [seat(0, false), seat(1, false), seat(2, false), seat(3, false)];
const started = [seat(0, false), seat(1, true), seat(2, false), seat(3, true)];

describe('the bot line names only the people a bot stands in for', () => {
  it('a table started with bots names nobody', () => {
    let had = notePeople(new Set(), 'waiting', lobby);
    had = notePeople(had, 'playing', started);
    expect(standInsOf(started, had, 0)).toEqual([]);
  });

  it('a player who drops is named, and not once back', () => {
    let had = notePeople(notePeople(new Set(), 'waiting', lobby), 'playing', started);
    const dropped = [seat(0, false), seat(1, true), seat(2, true), seat(3, true)];
    had = notePeople(had, 'playing', dropped);
    expect(standInsOf(dropped, had, 0)).toEqual([seat(2, true)]);
    had = notePeople(had, 'playing', started);
    expect(standInsOf(started, had, 0)).toEqual([]);
  });

  it('a player who left for good stays named, across a rematch', () => {
    let had = notePeople(new Set(), 'playing', started);
    const left = [seat(0, false), seat(1, true), seat(2, true), seat(3, true)];
    for (const status of ['playing', 'finished', 'playing', 'finished'] as const) {
      had = notePeople(had, status, left);
      expect(standInsOf(left, had, 0)).toEqual([seat(2, true)]);
    }
  });

  it('the lobby counts nobody: its reports call every seat human', () => {
    let had = notePeople(new Set(), 'waiting', lobby);
    had = notePeople(had, 'waiting', lobby);
    const now = [seat(0, false), seat(1, true), seat(2, false), seat(3, false)];
    had = notePeople(had, 'playing', now);
    expect(standInsOf(now, had, 0)).toEqual([]);
  });

  it('never names me', () => {
    const had = notePeople(new Set(), 'playing', lobby);
    const meDropped = [seat(0, true), seat(1, false), seat(2, false), seat(3, false)];
    expect(standInsOf(meDropped, had, 0)).toEqual([]);
  });
});
