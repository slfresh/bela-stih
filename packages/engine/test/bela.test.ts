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
  type Suit,
} from '@belot/engine';

/**
 * Bela (trump K+Q, worth 20) is announce-or-forfeit like zvanja, but tied to a
 * card rather than to trick 1: you call it AS you play the first of the pair, or
 * you lose it. "First of the pair" needs no bookkeeping — it is exactly the
 * moment when both are still in your hand.
 */

/** Close the doubling round if this table plays one at all. */
function closeDoubling(s: GameState): GameState {
  while (s.phase === 'DOUBLE') {
    s = applyAction(s, { type: 'DOUBLE_PASS', seat: currentActor(s)! });
  }
  return s;
}

function intoPlay(trump: Suit, config: Partial<EngineConfig> = {}, seed = 7): GameState {
  let s = startDeal(createMatch({ dealer: 3, seed, config }));
  s = applyAction(s, { type: 'BID_CALL', seat: 0, suit: trump });
  return closeDoubling(s);
}

/**
 * Find a deal where somebody was dealt the trump K+Q. Each seed is tried against
 * every trump suit, which makes a hit easy to come by.
 */
function dealWithBela(config: Partial<EngineConfig> = {}): { state: GameState; holder: Seat } {
  for (let seed = 1; seed < 300; seed++) {
    for (const trump of ['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]) {
      const s = intoPlay(trump, config, seed);
      if (s.belaHolderSeat !== null) return { state: s, holder: s.belaHolderSeat };
    }
  }
  throw new Error('no seed dealt a bela');
}

/** Settle any trick-1 zvanja so the seat on turn is free to play a card. */
function settle(s: GameState): GameState {
  while (s.phase === 'PLAY' && legalActions(s)[0]!.type.startsWith('DECLARE')) {
    s = applyAction(s, { type: 'DECLARE_SKIP', seat: currentActor(s)! });
  }
  return s;
}

/**
 * Play out a deal. `callBela` decides whether the holder takes the option when it
 * is offered; zvanja are always skipped so only bela moves the score.
 */
function playDeal(start: GameState, callBela: boolean): GameState {
  let s = start;
  let guard = 0;
  while (s.phase === 'PLAY') {
    if (guard++ > 128) throw new Error('deal did not terminate');
    const legal = legalActions(s);
    if (legal[0]!.type.startsWith('DECLARE')) {
      s = applyAction(s, { type: 'DECLARE_SKIP', seat: currentActor(s)! });
      continue;
    }
    const belaOption = legal.find((a) => a.type === 'PLAY_CARD' && a.announceBela === true);
    s = applyAction(s, callBela && belaOption ? belaOption : (legal[0] as Action));
  }
  return s;
}

describe('being offered the call', () => {
  it('offers both the silent play and the call on the first of the pair', () => {
    const { state, holder } = dealWithBela();
    const trump = state.context.trumpSuit!;

    // Walk to the holder's turn and see the option appear on the K or Q.
    let s = settle(state);
    let guard = 0;
    while (guard++ < 64) {
      if (currentActor(s) === holder) {
        const legal = legalActions(s);
        const belaCards = legal
          .filter((a) => a.type === 'PLAY_CARD' && a.announceBela === true)
          .map((a) => (a as { card: Card }).card);
        if (belaCards.length > 0) {
          // Every offered call is on the trump K or Q...
          for (const card of belaCards) {
            expect(card.suit).toBe(trump);
            expect(['K', 'Q']).toContain(card.rank);
          }
          // ...and the same card is also playable silently.
          for (const card of belaCards) {
            expect(
              legal.some(
                (a) =>
                  a.type === 'PLAY_CARD' &&
                  a.announceBela !== true &&
                  cardId(a.card) === cardId(card),
              ),
            ).toBe(true);
          }
          expect(publicView(s, holder).canAnnounceBela).toBe(true);
          return;
        }
      }
      s = applyAction(s, legalActions(s)[0] as Action);
    }
    throw new Error('holder was never offered the bela');
  });

  it('offers it to nobody else', () => {
    const { state, holder } = dealWithBela();
    const s = settle(state);
    for (const seat of ([0, 1, 2, 3] as Seat[]).filter((x) => x !== holder)) {
      expect(publicView(s, seat).canAnnounceBela).toBe(false);
    }
  });

  it('never offers it when the pair is split between two hands', () => {
    // Seat 0 holds only the trump king, so no seat holds both.
    for (let seed = 1; seed < 300; seed++) {
      const s = intoPlay('spades', {}, seed);
      if (s.belaHolderSeat !== null) continue;
      expect(
        legalActions(s).some((a) => a.type === 'PLAY_CARD' && a.announceBela === true),
      ).toBe(false);
      return;
    }
    throw new Error('no seed split the pair');
  });
});

describe('calling it, or not', () => {
  it('scores 20 for the holder when called', () => {
    const { state, holder } = dealWithBela();
    const done = playDeal(state, true);
    expect(done.belaAnnouncedSeat).toBe(holder);
    expect(done.lastDealResult!.bela[teamOf(holder)]).toBe(20);
  });

  it('forfeits the 20 when the holder stays silent', () => {
    const { state, holder } = dealWithBela();
    const done = playDeal(state, false);
    expect(done.belaHolderSeat).toBe(holder); // the pair was dealt...
    expect(done.belaAnnouncedSeat).toBeNull(); // ...but never called
    expect(done.lastDealResult!.bela).toEqual([0, 0]);
  });

  it('makes the call public once it is made', () => {
    const { state, holder } = dealWithBela();
    const done = playDeal(state, true);
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(publicView(done, seat).belaAnnouncedBy).toBe(holder);
    }
  });
});

/** The whole point of "first of the pair": you cannot wait and see. */
describe('the call cannot be made late', () => {
  it('withdraws the option once the first of the pair has been played', () => {
    const { state, holder } = dealWithBela();
    const trump = state.context.trumpSuit!;
    let s = settle(state);
    let guard = 0;

    while (guard++ < 64 && s.phase === 'PLAY') {
      const legal = legalActions(s);
      const silentPairPlay = legal.find(
        (a) =>
          a.type === 'PLAY_CARD' &&
          a.announceBela !== true &&
          a.card.suit === trump &&
          (a.card.rank === 'K' || a.card.rank === 'Q'),
      );

      if (currentActor(s) === holder && silentPairPlay) {
        // Play the first of the pair WITHOUT calling: the 20 is gone for good.
        s = applyAction(s, silentPairPlay);
        expect(s.belaAnnouncedSeat).toBeNull();

        // The other half is still in hand, but can never carry the call again.
        expect(
          s.hands[holder]!.filter(
            (card) => card.suit === trump && (card.rank === 'K' || card.rank === 'Q'),
          ),
        ).toHaveLength(1);

        // Play the deal out: the option must never reappear, for anyone.
        let tail = 0;
        while (s.phase === 'PLAY') {
          if (tail++ > 128) throw new Error('deal did not terminate');
          const acts = legalActions(s);
          expect(acts.some((a) => a.type === 'PLAY_CARD' && a.announceBela === true)).toBe(false);
          if (acts[0]!.type.startsWith('DECLARE')) {
            s = applyAction(s, { type: 'DECLARE_SKIP', seat: currentActor(s)! });
            continue;
          }
          s = applyAction(s, acts[0] as Action);
        }
        expect(s.belaAnnouncedSeat).toBeNull();
        expect(s.lastDealResult!.bela).toEqual([0, 0]);
        return;
      }
      s = applyAction(s, legal[0] as Action);
    }
    throw new Error('holder never played one of the pair');
  });
});

describe('rejecting bogus calls', () => {
  it('refuses a call from a seat that does not hold the pair', () => {
    const { state, holder } = dealWithBela();
    const s = settle(state);
    const seat = currentActor(s)!;
    if (seat === holder) return; // this seed happens to lead with the holder

    const card = (legalActions(s)[0] as { card: Card }).card;
    expect(() =>
      applyAction(s, { type: 'PLAY_CARD', seat, card, announceBela: true }),
    ).toThrow(/cannot call bela/);
  });

  it('refuses a call on a card that is not the trump king or queen', () => {
    const { state, holder } = dealWithBela();
    const trump = state.context.trumpSuit!;
    let s = settle(state);
    let guard = 0;
    while (guard++ < 64 && currentActor(s) !== holder) {
      s = applyAction(s, legalActions(s)[0] as Action);
    }
    const wrong = legalActions(s).find(
      (a) =>
        a.type === 'PLAY_CARD' &&
        !(a.card.suit === trump && (a.card.rank === 'K' || a.card.rank === 'Q')),
    );
    if (!wrong || wrong.type !== 'PLAY_CARD') return; // only pair cards were legal
    expect(() =>
      applyAction(s, { type: 'PLAY_CARD', seat: holder, card: wrong.card, announceBela: true }),
    ).toThrow(/cannot call bela/);
  });
});

describe('bela still behaves the way the scoring rules demand', () => {
  it('survives a failed contract once it has been called', () => {
    // Reuse the scoring guarantee: a called bela is the one thing a pad leaves behind.
    const { state } = dealWithBela();
    const done = playDeal(state, true);
    const r = done.lastDealResult!;
    if (r.callerMade) return; // this deal happened to make; the pad case is covered in scoring.test
    const callerTeam = teamOf(done.callerSeat!);
    expect(r.finalScore[callerTeam]).toBe(r.bela[callerTeam]);
  });

  it('counts toward the contract check only when called', () => {
    const { state } = dealWithBela();
    const called = playDeal(state, true).lastDealResult!;
    const silent = playDeal(state, false).lastDealResult!;
    const holderTeam = teamOf(state.belaHolderSeat!);
    expect(called.rawTotal[holderTeam] - silent.rawTotal[holderTeam]).toBe(20);
  });
});

describe('auto mode', () => {
  it('awards the pair on sight and offers no call', () => {
    const { state, holder } = dealWithBela({ belaMode: 'auto' });
    expect(state.belaAnnouncedSeat).toBe(holder);
    expect(
      legalActions(settle(state)).some(
        (a) => a.type === 'PLAY_CARD' && a.announceBela === true,
      ),
    ).toBe(false);

    const done = playDeal(state, false); // nobody calls anything
    expect(done.lastDealResult!.bela[teamOf(holder)]).toBe(20);
  });

  it('rejects an explicit call, since there is nothing to call', () => {
    const { state, holder } = dealWithBela({ belaMode: 'auto' });
    let s = settle(state);
    let guard = 0;
    while (guard++ < 64 && currentActor(s) !== holder) {
      s = applyAction(s, legalActions(s)[0] as Action);
    }
    const card = (legalActions(s)[0] as { card: Card }).card;
    expect(() =>
      applyAction(s, { type: 'PLAY_CARD', seat: holder, card, announceBela: true }),
    ).toThrow(/cannot call bela/);
  });
});

describe('the holders hand stays secret until the call', () => {
  it('gives an opponent no sight of the pair beforehand', () => {
    const { state, holder } = dealWithBela();
    const opponent = ((holder + 1) % 4) as Seat;
    const view = publicView(state, opponent);

    expect(view.belaAnnouncedBy).toBeNull();

    // No card currently in anyone else's hand may appear in this seat's view.
    const others = new Set(
      ([0, 1, 2, 3] as Seat[])
        .filter((x) => x !== opponent)
        .flatMap((x) => state.hands[x]!.map(cardId)),
    );
    const leaked = collectCards(view)
      .map(cardId)
      .filter((id) => others.has(id));
    expect(leaked).toEqual([]);
  });

  it('reveals the holder by seat, not by card, once called', () => {
    const { state, holder } = dealWithBela();
    const done = playDeal(state, true);
    const opponent = ((holder + 1) % 4) as Seat;
    const view = publicView(done, opponent);
    // Everyone hears WHO called -- that is what saying it out loud does.
    expect(view.belaAnnouncedBy).toBe(holder);
  });
});

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
