import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cardId,
  createMatch,
  currentActor,
  legalActions,
  legalPlays,
  publicView,
  startDeal,
  teamOf,
  type Action,
  type Card,
  type EngineConfig,
  type GameState,
  type Seat,
} from '@belot/engine';
import { HARD_CONFIG_OVERRIDES } from '@belot/shared-types';

/**
 * Hard mode ("prava bela"): renonsMode 'punish' + declarationMode 'blind'.
 * The engine stops policing and starts punishing, the way a real table does.
 */

function intoPlay(config: Partial<EngineConfig> = {}, seed = 11): GameState {
  let s = startDeal(createMatch({ dealer: 3, seed, config }));
  s = applyAction(s, { type: 'BID_CALL', seat: 0, suit: 'spades' });
  return s;
}

const HARD: Partial<EngineConfig> = { ...HARD_CONFIG_OVERRIDES };

/** First actor's hand and an ILLEGAL card for the current trick, if one exists. */
function findIllegalPlay(s: GameState): { seat: Seat; card: Card } | null {
  const seat = currentActor(s)!;
  const hand = s.hands[seat]!;
  const legal = legalPlays({
    hand,
    trick: s.currentTrick,
    mySeat: seat,
    ctx: s.context,
    forcedOvertrumpOverPartner: s.config.forcedOvertrumpOverPartner,
  }).map(cardId);
  const illegal = hand.find((c) => !legal.includes(cardId(c)));
  return illegal ? { seat, card: illegal } : null;
}

/** Walk a deal with first-legal-action moves until someone CAN misplay. */
function reachMisplayableState(config: Partial<EngineConfig>): {
  s: GameState;
  seat: Seat;
  card: Card;
} {
  for (let seed = 1; seed < 200; seed++) {
    let s = intoPlay(config, seed);
    let guard = 0;
    while (s.phase === 'PLAY' && guard++ < 64) {
      const bad = findIllegalPlay(s);
      if (bad) return { s, seat: bad.seat, card: bad.card };
      s = applyAction(s, legalActions(s)[0] as Action);
    }
  }
  throw new Error('no seed produced a misplayable state');
}

describe('renons (auzmeš) under renonsMode punish', () => {
  it('accepts the illegal card and hands the whole deal to the opponents', () => {
    const { s, seat, card } = reachMisplayableState(HARD);
    const before = [...s.matchScores] as [number, number];
    const done = applyAction(s, { type: 'PLAY_CARD', seat, card });

    expect(done.phase === 'DEAL_OVER' || done.phase === 'MATCH_OVER').toBe(true);
    const result = done.lastDealResult!;
    expect(result.renonsSeat).toBe(seat);

    const offTeam = teamOf(seat);
    const defTeam = (1 - offTeam) as 0 | 1;
    expect(result.finalScore[offTeam]).toBe(0);
    // 162 plus whatever zvanja/bela had been announced by ANYONE this deal.
    expect(result.finalScore[defTeam]).toBeGreaterThanOrEqual(162);
    expect(done.matchScores[defTeam]).toBe(before[defTeam] + result.finalScore[defTeam]);
    expect(done.matchScores[offTeam]).toBe(before[offTeam]);
  });

  it('still rejects the same card under the default block mode', () => {
    const { s, seat, card } = reachMisplayableState({ declarationMode: 'blind' });
    expect(() => applyAction(s, { type: 'PLAY_CARD', seat, card })).toThrow(/illegal play/);
  });
});

describe('blind zvanja under declarationMode blind', () => {
  it('never forces a declaration decision and hides myDeclarations', () => {
    for (let seed = 1; seed < 100; seed++) {
      const s = intoPlay(HARD, seed);
      if (s.availableDeclarations.some((d) => d.length > 0)) {
        const seat = currentActor(s)!;
        const view = publicView(s, seat);
        expect(view.mustDeclare).toBe(false);
        expect(view.myDeclarations).toEqual([]);
        // A voluntary claim is offered regardless of holdings.
        expect(view.canDeclare).toBe(true);
        expect(legalActions(s).some((a) => a.type === 'DECLARE_ANNOUNCE')).toBe(true);
        // The question is asked of everyone, so no card is playable until it is
        // answered — you cannot slip past the asking by leading.
        expect(legalActions(s).some((a) => a.type === 'PLAY_CARD')).toBe(false);
        return;
      }
    }
    throw new Error('no seed dealt zvanja');
  });

  it('claiming announces exactly what the hand holds', () => {
    for (let seed = 1; seed < 100; seed++) {
      const s = intoPlay(HARD, seed);
      const seat = currentActor(s)!;
      const held = s.availableDeclarations[seat]!;
      if (held.length === 0) continue;
      const after = applyAction(s, { type: 'DECLARE_ANNOUNCE', seat });
      expect(after.announcedDeclarations[seat]).toEqual(held);
      // Claiming again is rejected.
      expect(() => applyAction(after, { type: 'DECLARE_ANNOUNCE', seat })).toThrow();
      return;
    }
    throw new Error('no seed dealt the actor zvanja');
  });

  it('answering "nemam" forfeits silently, holdings or not', () => {
    for (let seed = 1; seed < 100; seed++) {
      const s = intoPlay(HARD, seed);
      const seat = currentActor(s)!;
      if (s.availableDeclarations[seat]!.length === 0) continue;
      const after = applyAction(s, { type: 'DECLARE_SKIP', seat });
      expect(after.announcedDeclarations[seat]).toEqual([]);
      // The question has moved on; this seat does not get asked twice.
      expect(() => applyAction(after, { type: 'DECLARE_ANNOUNCE', seat })).toThrow();
      return;
    }
    throw new Error('no seed dealt the actor zvanja');
  });

  it('a claim that marks the wrong cards simply finds nothing', () => {
    // Blind mode is the mode where the app refuses to spot zvanja for you, so a
    // wrong pick is the authentic embarrassment rather than an error dialog.
    for (let seed = 1; seed < 100; seed++) {
      const s = intoPlay(HARD, seed);
      const seat = currentActor(s)!;
      if (s.availableDeclarations[seat]!.length === 0) continue;
      const notAZvanje = s.hands[seat]!.slice(0, 3);
      const after = applyAction(s, { type: 'DECLARE_ANNOUNCE', seat, cards: notAZvanje });
      expect(after.announcedDeclarations[seat]).toEqual([]);
      expect(after.declareTurn).not.toBe(seat); // the round moved on regardless
      return;
    }
    throw new Error('no seed dealt the actor zvanja');
  });

  /** Answer "nemam" all the way round, so the cards become playable. */
  function pastTheAsking(start: GameState): GameState {
    let s = start;
    while (s.declareTurn !== null) {
      s = applyAction(s, { type: 'DECLARE_SKIP', seat: s.declareTurn });
    }
    return s;
  }

  it('offers the bela try on any trump K/Q and ignores a false call', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = pastTheAsking(intoPlay(HARD, seed));
      const seat = currentActor(s)!;
      const hand = s.hands[seat]!;
      const hasK = hand.some((c) => c.suit === 'spades' && c.rank === 'K');
      const hasQ = hand.some((c) => c.suit === 'spades' && c.rank === 'Q');
      if ((hasK || hasQ) && !(hasK && hasQ)) {
        // Holding exactly ONE of the pair: the try must still be offered...
        const tryBela = legalActions(s).find(
          (a) => a.type === 'PLAY_CARD' && a.announceBela === true,
        );
        if (!tryBela || tryBela.type !== 'PLAY_CARD') continue; // card may be unplayable this trick
        // ...and taking it scores nothing: the false call is ignored.
        const after = applyAction(s, tryBela);
        expect(after.belaAnnouncedSeat).toBeNull();
        return;
      }
    }
    throw new Error('no seed produced a lone trump K/Q');
  });
});
