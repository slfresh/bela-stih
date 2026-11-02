import { shuffle, type BotLevel, type Rng } from '@belot/game-core';
import { COLOURS, DECK_SIZE, isWild, makeDeck, type Colour, type OCard } from './cards';
import { applyAction, DEFAULT_OSMICE_CONFIG, type OsmiceAction, type OsmiceState } from './state';
import { publicView, type OsmiceView } from './view';

/**
 * Osmice bots: one pure decision over a seat's view, like Bela's.
 *
 *  - easy: plays whatever it can, at random, and calls a wild's colour at random;
 *  - medium: keeps its wilds for when it is stuck, dumps its fattest cards
 *    first, plays its action cards on a player close to going out, and calls
 *    the colour it holds most of;
 *  - hard: looks ahead. For each move it could make it deals the cards it has
 *    not seen out to the other hands at random, many times, plays each round
 *    out with medium at every seat, and makes the move that went out first
 *    most often. Every candidate is tried against the same deals, so the
 *    comparison is between moves, not between lucky and unlucky deals.
 */
export function decideOsmice(view: OsmiceView, rng: Rng, level: BotLevel): OsmiceAction {
  const legal = view.legalActions;
  if (legal.length === 0) throw new Error('bot asked to act with no legal actions');
  if (legal.length === 1) return legal[0]!;
  if (level === 'easy') return easy(legal, rng);
  if (level === 'hard') return lookAhead(view, legal, rng);
  return medium(view, legal);
}

function easy(legal: OsmiceAction[], rng: Rng): OsmiceAction {
  const plays = legal.filter((a) => a.type === 'PLAY');
  const pool = plays.length > 0 ? plays : legal;
  return pool[Math.floor(rng() * pool.length)]!;
}

const handCard = (view: OsmiceView, id: string): OCard =>
  view.hand.find((c) => c.id === id) ?? (view.drawn && view.drawn.id === id ? view.drawn : { id, colour: null, value: 'wild' });

/** The colour this hand holds most of (ignoring `except`). */
function bestColour(hand: OCard[], except?: string): Colour {
  const count: Record<Colour, number> = { red: 0, gold: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.colour && c.id !== except) count[c.colour] += 1;
  return [...COLOURS].sort((a, b) => count[b] - count[a])[0]!;
}

function nextOf(view: OsmiceView, seat: number): number {
  return (((seat + view.direction) % view.seats) + view.seats) % view.seats;
}

type Play = Extract<OsmiceAction, { type: 'PLAY' }>;

function medium(view: OsmiceView, legal: OsmiceAction[]): OsmiceAction {
  const plays = legal.filter((a): a is Play => a.type === 'PLAY');
  if (plays.length === 0) return legal.find((a) => a.type === 'DRAW') ?? legal[0]!;

  const threatened = view.handCounts[nextOf(view, view.seat)]! <= 2;
  const score = (a: Play): number => {
    const card = handCard(view, a.cardId);
    if (isWild(card)) {
      // Keep wilds for when nothing else goes — unless someone is about to win.
      let v = threatened ? 0 : -40;
      if (card.value === 'wild4') v += threatened ? 60 : -10;
      if (a.colour === bestColour(view.hand, card.id)) v += 10;
      return v;
    }
    // Fat cards out first: they cost the most if somebody else goes out.
    let v = card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2' ? 20 : Number(card.value);
    // An attack is worth most against a player close to going out.
    if (card.value === 'draw2' || card.value === 'skip') v += threatened ? 50 : 0;
    if (card.value === 'reverse' && threatened) v += 30;
    // Stay in the colour I hold most of.
    if (card.colour === bestColour(view.hand, card.id)) v += 6;
    return v;
  };

  let best = plays[0]!;
  let bestScore = -Infinity;
  for (const p of plays) {
    const s = score(p);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  // Having drawn, keep a wild rather than spend it while nobody is close.
  if (view.drawn && bestScore < -20 && !threatened) return legal.find((a) => a.type === 'PASS') ?? best;
  return best;
}

/** Rollouts per candidate move. Enough to separate moves, few enough to answer in a blink. */
const ROLLOUTS = 64;
/**
 * How far each rollout looks: a few turns round the table. Whole rounds are
 * too long to read anything from in two dozen tries — the move's effect is
 * lost in what everybody draws later — so the round is scored as it stands.
 */
const rolloutMoves = (seats: number) => seats * 5;

/**
 * One way the hidden cards could lie, consistent with everything this seat
 * has seen: its own hand, the top card, and how many cards each other hand
 * holds. The view counts the discard under the top card as drawable (it is
 * shuffled back in when the pile runs out), so the sample puts every other
 * unseen card in the draw pile: which cards are buried and which are still
 * in the deck is hidden anyway, and a reshuffle would mix them all.
 */
function sampleState(view: OsmiceView, rng: Rng): OsmiceState {
  const known = new Set([...view.hand.map((c) => c.id), ...(view.top ? [view.top.id] : [])]);
  const pool = shuffle(
    makeDeck().filter((c) => !known.has(c.id)),
    rng,
  );
  const hands: OCard[][] = view.handCounts.map((n, seat) => (seat === view.seat ? view.hand.map((c) => ({ ...c })) : pool.splice(0, n)));
  const drawPile = pool.splice(0, view.drawPileCount);
  // Nothing should be left over; anything that is sits under the top card.
  const discard = [...pool, ...(view.top ? [{ ...view.top }] : [])];
  if (hands.flat().length + drawPile.length + discard.length !== DECK_SIZE) throw new Error('sample lost a card');
  return {
    seats: view.seats,
    config: { ...DEFAULT_OSMICE_CONFIG, matchTarget: view.matchTarget, stackDraws: view.pendingDraw > 0 || false },
    rng,
    phase: 'PLAY',
    dealer: view.dealer,
    roundNumber: view.roundNumber,
    hands,
    drawPile,
    discard,
    colour: view.colour,
    direction: view.direction,
    turn: view.seat,
    pendingDraw: view.pendingDraw,
    pendingKind: view.pendingDraw > 0 ? (view.top?.value === 'wild4' ? 'wild4' : 'draw2') : null,
    drawn: view.drawn ? hands[view.seat]!.find((c) => c.id === view.drawn!.id) ?? null : null,
    scores: view.scores.slice(),
    drewOn: view.drewOn.map((d) => d.slice()),
    lastRound: null,
  };
}

/** Play a sampled round out with medium everywhere; how good it went for `me`. */
function rollout(start: OsmiceState, first: OsmiceAction, me: number): number {
  let s: OsmiceState;
  try {
    s = applyAction(start, first);
  } catch {
    return -1;
  }
  for (let i = 0, n = rolloutMoves(start.seats); i < n && s.phase === 'PLAY'; i++) {
    const v = publicView(s, s.turn);
    s = applyAction(s, v.legalActions.length === 1 ? v.legalActions[0]! : medium(v, v.legalActions));
  }
  if (s.phase !== 'PLAY') {
    // Going out first is the point; what I am caught holding is the cost.
    return s.lastRound!.winner === me ? 10 : -3 - s.lastRound!.left[me]! / 50;
  }
  // Unfinished: my cards against the shortest other hand's.
  const mine = s.hands[me]!.length;
  const theirs = Math.min(...s.hands.filter((_, i) => i !== me).map((h) => h.length));
  return theirs - mine;
}

function lookAhead(view: OsmiceView, legal: OsmiceAction[], rng: Rng): OsmiceAction {
  // Medium's judgement decides what is worth considering: never draw or pass
  // while a card would go, and spend a wild only if medium itself would. The
  // look-ahead then chooses among the cards that are left — which colour to
  // turn the pile to, which attack to make — where a few turns ahead is
  // exactly the right distance to see.
  const pick = medium(view, legal);
  const plays = legal.filter((a): a is Play => a.type === 'PLAY');
  if (plays.length === 0 || pick.type !== 'PLAY') return pick;
  const pickIsWild = isWild(handCard(view, pick.cardId));
  const candidates = plays.filter((a) => {
    const wild = isWild(handCard(view, a.cardId));
    if (wild !== pickIsWild) return false;
    if (!wild) return true;
    // A wild: the colours medium would weigh, its own pick first.
    const rest = view.hand.filter((c) => c.id !== a.cardId);
    const first = bestColour(rest);
    return a.colour === first || a.colour === bestColour(rest.filter((c) => c.colour !== first));
  });
  if (candidates.length <= 1) return pick;
  const totals = candidates.map(() => 0);
  for (let r = 0; r < ROLLOUTS; r++) {
    const sample = sampleState(view, rng);
    candidates.forEach((c, i) => {
      totals[i]! += rollout(sample, c, view.seat);
    });
  }
  // Medium's own pick wins a tie: the search has to find a reason to differ.
  let best = candidates.findIndex((c) => c.cardId === pick.cardId && c.colour === pick.colour);
  if (best < 0) best = 0;
  for (let i = 0; i < candidates.length; i++) if (totals[i]! > totals[best]! + ROLLOUTS * 0.25) best = i;
  return candidates[best]!;
}
