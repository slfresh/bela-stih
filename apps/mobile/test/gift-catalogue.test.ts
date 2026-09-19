import { describe, expect, it } from 'vitest';
import type { Seat } from '@belot/engine';
import { emptyProfile, GIFT_IDS, xpToReachLevel, type PlayerProfile } from '@belot/progression';
import {
  EMOTE_GAP_MS,
  EMOTE_IDS as SERVER_EMOTE_IDS,
  GIFT_GAP_MS,
  GIFT_IDS as SERVER_GIFT_IDS,
} from '../../server/src/protocol';
import { EMOTE_IDS } from '../src/emotes';
import { applyGiftEcho, GIFT_COOLDOWN_MS, GIFT_ECHO_WAIT_MS, isGiftMessage, reachOf, recipientsOf } from '../src/gifts';

/**
 * The server keeps its own copies of the gift and emote vocabularies (it never
 * imports the mobile app or progression), so nothing but this test stops the
 * lists drifting — and a drifted list fails silently: the server just drops
 * what it does not know, and a player's gift, already paid for, never lands.
 */
describe('the client and the server agree on the vocabularies', () => {
  it('gift ids, in the same order', () => {
    expect([...SERVER_GIFT_IDS]).toEqual([...GIFT_IDS]);
  });

  it('emote ids', () => {
    expect([...SERVER_EMOTE_IDS]).toEqual([...EMOTE_IDS]);
  });

  it('the rate limits leave room for jitter', () => {
    expect(GIFT_GAP_MS).toBeGreaterThan(EMOTE_GAP_MS);
  });
});

describe('a relayed gift', () => {
  const rich = (): PlayerProfile => ({ ...emptyProfile(), xp: xpToReachLevel(20), coins: 5000 });
  const SEATS = [0, 1, 2, 3] as Seat[];

  it('the client waits longer than the server, so jitter never drops a paid gift', () => {
    expect(GIFT_COOLDOWN_MS).toBeGreaterThan(GIFT_GAP_MS);
  });

  it('charges only the sender, and only on the echo', () => {
    for (const id of GIFT_IDS) {
      for (const from of SEATS) {
        for (const to of [recipientsOf('table', from), recipientsOf(((from + 1) % 4) as Seat, from)]) {
          for (const me of SEATS) {
            const p = rich();
            const after = applyGiftEcho(p, { from, to, id }, me);
            if (me === from) expect(after.coins, `${id} ${from}->${to} as ${me}`).toBeLessThan(p.coins);
            // The receiver — and anyone watching — is left exactly as they were.
            else expect(after, `${id} ${from}->${to} as ${me}`).toBe(p);
          }
        }
      }
    }
    expect(applyGiftEcho(rich(), { from: 0, to: [1], id: 'kava' }, null).coins).toBe(5000);
  });

  it('never goes to the giver', () => {
    expect(recipientsOf('table', 2)).toEqual([0, 1, 3]);
    expect(recipientsOf(1, 1)).toEqual([]);
    expect(recipientsOf(3, 1)).toEqual([3]);
  });

  it('never goes to a seat that cannot see it (an older app), and says so by being empty', () => {
    const reach = [true, false, true, true];
    expect(recipientsOf('table', 0, reach)).toEqual([2, 3]);
    expect(recipientsOf(1, 0, reach)).toEqual([]);
    expect(recipientsOf(2, 0, reach)).toEqual([2]);
    expect(recipientsOf('table', 0, [true, false, false, false])).toEqual([]);
  });

  it("reads who can see a gift from the room's seats, and nobody from a room that never says", () => {
    const seat = (s: Seat, seesGifts?: true) => ({ seat: s, ...(seesGifts ? { seesGifts } : {}) });
    expect(reachOf([seat(0, true), seat(1), seat(2, true), seat(3, true)])).toEqual([true, false, true, true]);
    // An old server sends no flag at all: nothing is offered that it would drop.
    expect(reachOf([seat(0), seat(1), seat(2), seat(3)])).toEqual([false, false, false, false]);
    expect(reachOf([])).toEqual([false, false, false, false]);
  });

  it('waits for an echo longer than a stalled connection can live', () => {
    // colyseus ws-transport: a ping every 3 s, closed after 2 unanswered (~9 s).
    expect(GIFT_ECHO_WAIT_MS).toBeGreaterThan(3 * 3000);
    expect(GIFT_ECHO_WAIT_MS).toBeGreaterThan(GIFT_COOLDOWN_MS);
  });

  it('is understood only when well formed and from the catalogue', () => {
    expect(isGiftMessage({ from: 0, to: [1, 2, 3], id: 'kruna' })).toBe(true);
    for (const bad of [
      null,
      'kava',
      { from: 0, to: [1], id: 'zlato' },
      { from: 0, to: [0], id: 'kava' },
      { from: 0, to: [], id: 'kava' },
      { from: 0, to: [4], id: 'kava' },
      { from: 0, to: [1, 1], id: 'kava' },
      { from: 5, to: [1], id: 'kava' },
      { from: 0, to: 1, id: 'kava' },
      { from: 0, to: ['1'], id: 'kava' },
    ]) {
      expect(isGiftMessage(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
