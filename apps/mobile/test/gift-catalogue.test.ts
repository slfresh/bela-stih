import { describe, expect, it } from 'vitest';
import { GIFT_IDS } from '@belot/progression';
import {
  EMOTE_GAP_MS,
  EMOTE_IDS as SERVER_EMOTE_IDS,
  GIFT_GAP_MS,
  GIFT_IDS as SERVER_GIFT_IDS,
} from '../../server/src/protocol';
import { EMOTE_IDS } from '../src/emotes';

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
