import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cardId,
  createMatch,
  currentActor,
  legalActions,
  publicView,
  startDeal,
  teamOf,
  type Action,
  type Card,
  type EngineConfig,
  type GameState,
  type Seat,
} from '@belot/engine';

/**
 * Announce-or-forfeit (the authentic rule): a seat holding zvanja must call them
 * during trick 1, BEFORE playing its card, or score nothing for them. Staying
 * silent to conceal your hand is a legitimate strategic choice, not a mistake.
 */

function match(config: Partial<EngineConfig> = {}, seed = 7, dealer: Seat = 3): GameState {
  return startDeal(createMatch({ dealer, seed, config }));
}

/** Close the doubling round if this table plays one at all. */
function closeDoubling(s: GameState): GameState {
  while (s.phase === 'DOUBLE') {
    s = applyAction(s, { type: 'DOUBLE_PASS', seat: currentActor(s)! });
  }
  return s;
}

/** Drive bidding to a spade contract with nobody doubling. */
function intoPlay(config: Partial<EngineConfig> = {}, seed = 7): GameState {
  let s = match(config, seed);
  s = applyAction(s, { type: 'BID_CALL', seat: 0, suit: 'spades' });
  return closeDoubling(s);
}

/** Find a seed whose opening deal gives the seat on lead something to declare. */
function seedWithDeclarationOnLead(): { state: GameState; seat: Seat } {
  for (let seed = 1; seed < 400; seed++) {
    const s = intoPlay({}, seed);
    const seat = s.turn!;
    if (s.availableDeclarations[seat]!.length > 0) return { state: s, seat };
  }
  throw new Error('no seed produced a declaration on lead');
}

function types(s: GameState): string[] {
  return legalActions(s).map((a) => a.type);
}

describe('being asked to declare', () => {
  it('offers announce or skip to a seat that holds zvanja, before it may play', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    expect(state.phase).toBe('PLAY');
    expect(currentActor(state)).toBe(seat);
    expect(types(state)).toEqual(['DECLARE_ANNOUNCE', 'DECLARE_SKIP']);
  });

  it('refuses a card while the announcement is still owed', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    const card = state.hands[seat]![0]!;
    expect(() => applyAction(state, { type: 'PLAY_CARD', seat, card })).toThrow(
      /announce or skip/,
    );
  });

  it('never prompts a seat that holds nothing — it just plays', () => {
    // Seat on lead with no zvanja is auto-settled, so its actions are cards.
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const s = intoPlay({}, seed);
      const seat = s.turn!;
      if (s.availableDeclarations[seat]!.length === 0) {
        expect(s.declared[seat]).toBe(true);
        expect(types(s).every((t) => t === 'PLAY_CARD')).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('keeps the turn with the same seat after it declares', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    const after = applyAction(state, { type: 'DECLARE_ANNOUNCE', seat });
    expect(after.turn).toBe(seat); // still owes a card
    expect(types(after).every((t) => t === 'PLAY_CARD')).toBe(true);
  });

  it('will not accept a second declaration from the same seat', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    const after = applyAction(state, { type: 'DECLARE_SKIP', seat });
    expect(() => applyAction(after, { type: 'DECLARE_ANNOUNCE', seat })).toThrow(
      /no declaration is owed/,
    );
  });
});

describe('announcing versus staying silent', () => {
  it('puts announced zvanja into the contest', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    const after = applyAction(state, { type: 'DECLARE_ANNOUNCE', seat });
    expect(after.announcedDeclarations[seat]).toEqual(state.availableDeclarations[seat]);
  });

  it('forfeits them on silence, even though the cards were held', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    const after = applyAction(state, { type: 'DECLARE_SKIP', seat });
    expect(after.availableDeclarations[seat]!.length).toBeGreaterThan(0); // still holds them
    expect(after.announcedDeclarations[seat]).toEqual([]); // but scores nothing
  });
});

/** Play a whole deal, choosing declarations by policy, and return the result. */
function playDeal(start: GameState, announce: (seat: Seat) => boolean): GameState {
  let s = start;
  let guard = 0;
  while (s.phase === 'PLAY') {
    if (guard++ > 128) throw new Error('deal did not terminate');
    const seat = currentActor(s)!;
    const legal = legalActions(s);
    if (legal[0]!.type === 'DECLARE_ANNOUNCE') {
      s = applyAction(s, { type: announce(seat) ? 'DECLARE_ANNOUNCE' : 'DECLARE_SKIP', seat });
      continue;
    }
    s = applyAction(s, legal[0] as Action);
  }
  return s;
}

describe('what silence costs at scoring time', () => {
  /** A deal where exactly one team holds zvanja, so its choice decides the points. */
  function dealWithOneSidedDeclarations(): { state: GameState; team: 0 | 1 } {
    for (let seed = 1; seed < 600; seed++) {
      const s = intoPlay({}, seed);
      const holders = ([0, 1, 2, 3] as Seat[]).filter(
        (seat) => s.availableDeclarations[seat]!.length > 0,
      );
      if (holders.length === 0) continue;
      const teams = new Set(holders.map(teamOf));
      if (teams.size === 1) return { state: s, team: [...teams][0]! };
    }
    throw new Error('no seed produced one-sided declarations');
  }

  it('scores the declarations when the holding team speaks up', () => {
    const { state, team } = dealWithOneSidedDeclarations();
    const done = playDeal(state, () => true);
    expect(done.lastDealResult!.declarationPoints[team]).toBeGreaterThan(0);
  });

  it('scores nothing at all when the holding team stays silent', () => {
    const { state } = dealWithOneSidedDeclarations();
    const done = playDeal(state, () => false);
    expect(done.lastDealResult!.declarationPoints).toEqual([0, 0]);
  });

  /** The headline: silence hands the contest to a strictly weaker announced holding. */
  it('lets a weaker announced holding beat a stronger silent one', () => {
    for (let seed = 1; seed < 800; seed++) {
      const s = intoPlay({}, seed);
      const best = (t: 0 | 1) =>
        Math.max(
          0,
          ...([0, 1, 2, 3] as Seat[])
            .filter((seat) => teamOf(seat) === t)
            .flatMap((seat) => s.availableDeclarations[seat]!.map((d) => d.value)),
        );
      const [b0, b1] = [best(0), best(1)];
      if (b0 === 0 || b1 === 0 || b0 === b1) continue;

      const strong: 0 | 1 = b0 > b1 ? 0 : 1;
      const weak: 0 | 1 = strong === 0 ? 1 : 0;

      // Everyone announces: the stronger team takes the contest.
      const bothSpeak = playDeal(s, () => true).lastDealResult!;
      expect(bothSpeak.declarationPoints[strong]).toBeGreaterThan(0);
      expect(bothSpeak.declarationPoints[weak]).toBe(0);

      // The stronger team stays silent: the weaker announced holding wins it.
      const strongSilent = playDeal(s, (seat) => teamOf(seat) !== strong).lastDealResult!;
      expect(strongSilent.declarationPoints[strong]).toBe(0);
      expect(strongSilent.declarationPoints[weak]).toBeGreaterThan(0);
      return;
    }
    throw new Error('no seed produced a strong/weak declaration split');
  });
});

describe('auto mode', () => {
  it('never prompts and counts everything, as before', () => {
    const s = intoPlay({ declarationMode: 'auto' }, 7);
    expect(s.declared).toEqual([true, true, true, true]);
    expect(s.announcedDeclarations).toEqual(s.availableDeclarations);
    expect(types(s).every((t) => t === 'PLAY_CARD')).toBe(true);
  });

  it('rejects a declaration action outright', () => {
    const s = intoPlay({ declarationMode: 'auto' }, 7);
    expect(() => applyAction(s, { type: 'DECLARE_ANNOUNCE', seat: s.turn! })).toThrow(
      /no declaration is owed/,
    );
  });
});

/** Announcing tells the table WHAT you hold, never WHICH CARDS. */
describe('an announcement does not leak the cards behind it', () => {
  function collectCards(value: unknown, out: Card[] = []): Card[] {
    if (Array.isArray(value)) {
      for (const v of value) collectCards(v, out);
    } else if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>;
      if (typeof o.suit === 'string' && typeof o.rank === 'string') out.push(o as unknown as Card);
      else for (const v of Object.values(o)) collectCards(v, out);
    }
    return out;
  }

  it('publishes value, length and top rank but no cards', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    const after = applyAction(state, { type: 'DECLARE_ANNOUNCE', seat });

    const opponent = ((seat + 1) % 4) as Seat;
    const view = publicView(after, opponent);

    expect(view.announcedDeclarations.length).toBeGreaterThan(0);
    for (const d of view.announcedDeclarations) {
      expect(d.value).toBeGreaterThan(0);
      expect(d.seat).toBe(seat);
      expect(d).not.toHaveProperty('cards');
    }

    // The announcer's cards must still be invisible to the opponent.
    const mine = new Set(after.hands[opponent]!.map(cardId));
    const leaked = collectCards(view)
      .map(cardId)
      .filter((id) => !mine.has(id));
    expect(leaked).toEqual([]);
  });

  it('shows a seat its own zvanja so the UI can offer the call', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    const view = publicView(state, seat);
    expect(view.mustDeclare).toBe(true);
    expect(view.myDeclarations).toEqual(state.availableDeclarations[seat]);
  });

  it('never sets mustDeclare for a seat that is not on turn', () => {
    const { state, seat } = seedWithDeclarationOnLead();
    for (const other of ([0, 1, 2, 3] as Seat[]).filter((x) => x !== seat)) {
      expect(publicView(state, other).mustDeclare).toBe(false);
    }
  });
});
