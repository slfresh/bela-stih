import type { Action, Card, PublicView, Seat, Suit, TrickPlay } from '@belot/shared-types';
import { SEATS, SUITS } from '@belot/shared-types';
import { cardId, isTrump, makeDeck, pointValue, rankPower, teamOf, trickWinnerIndex, type DealTrick } from '@belot/engine';
import { bidScore, decidePlay, preferBela, wouldWin, type BidCallAction, type PlayCardAction } from './medium';
import { bestByRollout } from './rollout';

/**
 * The hard bot: medium's rules plus a memory of the deal.
 *
 * Everything it knows beyond its own hand is PUBLIC - every played card was
 * seen by all four, and what the rules forced on a play says what a hand
 * lacks: whoever did not follow a suit has none of it, whoever discarded a
 * plain card when void holds no trump either, whoever followed low under
 * iber holds nothing higher. From that it keeps a table of voids and
 * ceilings per seat and the cards still out, and plays to it: it draws
 * trumps with the master, cashes a master only where nobody can cut it,
 * feeds its partner only when the trick will hold, takes a trick only with
 * a card the players still to come cannot beat, and sheds from its shortest
 * suit. It bids by position, too: a partner who has passed is a weak one.
 *
 * The memory arrives as `BotMemory` from the table, which owns the game
 * state; the hidden-hand-safe view never widens (packages/engine's golden
 * corpus hashes every view). Without it (a caller from before the memory)
 * the hard bot still plays, with medium's eyes.
 */

export interface BotMemory {
  /** The deal's tricks so far, in order, as the engine keeps them. */
  completedTricks: readonly DealTrick[];
}

/** The per-seat tables' columns: the four suits by SUITS order, then the trump as a fifth. */
const TRUMP_SLOT = 4;
const SLOTS = [0, 1, 2, 3, TRUMP_SLOT];
const SUIT_SLOT: Record<Suit, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };

type Ctx = PublicView['context'];

/** What the deal so far says about the other three hands. */
interface Knowledge {
  /** Cards the other three hold between them. */
  unseen: Card[];
  /** voids[seat][slot]: that seat is known to hold nothing of that suit (slot 4: no trump). */
  voids: boolean[][];
  /** caps[seat][slot]: that seat holds nothing of that suit above this power (Infinity: no ceiling known). */
  caps: number[][];
  /** Each trick's leader and led suit, and who took it (null for the one in progress): what a partner has shown. */
  leads: { leader: Seat; suit: Suit; winner: Seat | null }[];
}

const slotOf = (card: Card, ctx: Ctx): number => (isTrump(card, ctx) ? TRUMP_SLOT : SUIT_SLOT[card.suit]);

/**
 * Read the deal: the seats behind every played card (trick one is led by the
 * seat after the dealer, each later one by the last trick's winner, and play
 * goes round in seat order), then what each play says under the rules.
 */
function learn(view: PublicView, memory: BotMemory | undefined): Knowledge {
  const ctx = view.context;
  const voids = SEATS.map(() => SLOTS.map(() => false));
  const caps = SEATS.map(() => SLOTS.map(() => Infinity));
  const played = new Set<string>();

  const tricks: { plays: TrickPlay[]; winner: Seat | null }[] = [];
  let leader = ((view.dealer + 1) % 4) as Seat;
  for (const t of memory?.completedTricks ?? []) {
    tricks.push({ plays: t.cards.map((card, i) => ({ seat: ((leader + i) % 4) as Seat, card })), winner: t.winnerSeat });
    leader = t.winnerSeat;
  }
  tricks.push({ plays: view.currentTrick, winner: null });

  const leads: Knowledge['leads'] = [];
  for (const { plays, winner } of tricks) {
    if (plays.length === 0) continue;
    for (const p of plays) played.add(cardId(p.card));
    const led = plays[0]!.card;
    leads.push({ leader: plays[0]!.seat, suit: led.suit, winner });
    const ledTrump = isTrump(led, ctx);
    const ledSlot = slotOf(led, ctx);
    let highestLed = ledTrump ? -Infinity : rankPower(led, ctx);
    let highestTrump = ledTrump ? rankPower(led, ctx) : -Infinity;
    let cut = ledTrump;
    for (const { seat, card } of plays.slice(1)) {
      const trump = isTrump(card, ctx);
      const power = rankPower(card, ctx);
      if (!ledTrump && card.suit === led.suit && !trump) {
        // Followed. Iber (until the trick is cut): a lower card means nothing higher is held.
        if (!cut && power < highestLed) caps[seat]![ledSlot] = Math.min(caps[seat]![ledSlot]!, highestLed);
        highestLed = Math.max(highestLed, power);
        continue;
      }
      if (!ledTrump) voids[seat]![ledSlot] = true; // did not follow: none of the suit
      if (trump) {
        // Cut, or trump led: a lower trump means no higher one is held.
        if (power < highestTrump) caps[seat]![TRUMP_SLOT] = Math.min(caps[seat]![TRUMP_SLOT]!, highestTrump);
        highestTrump = Math.max(highestTrump, power);
        cut = true;
      } else {
        // Void and still no trump thrown: none held (one must cut when void).
        voids[seat]![TRUMP_SLOT] = true;
      }
    }
  }

  const mine = new Set(view.hand.map(cardId));
  const unseen = makeDeck().filter((c) => !played.has(cardId(c)) && !mine.has(cardId(c)));
  return { unseen, voids, caps, leads };
}

/** The hard bot's choices, given the deal so far. */
class Mind {
  readonly ctx: Ctx;
  readonly me: Seat;
  readonly partner: Seat;
  readonly k: Knowledge;

  constructor(
    readonly view: PublicView,
    memory: BotMemory | undefined,
  ) {
    this.ctx = view.context;
    this.me = view.seat;
    this.partner = ((view.seat + 2) % 4) as Seat;
    this.k = learn(view, memory);
  }

  power(c: Card): number {
    return rankPower(c, this.ctx);
  }
  points(c: Card): number {
    return pointValue(c, this.ctx);
  }
  slot(c: Card): number {
    return slotOf(c, this.ctx);
  }
  unseenOf(slot: number): Card[] {
    return this.k.unseen.filter((c) => this.slot(c) === slot);
  }
  /** Nothing still out ranks it. */
  isMaster(c: Card): boolean {
    const p = this.power(c);
    return !this.unseenOf(this.slot(c)).some((u) => this.power(u) > p);
  }
  /** That seat may still hold a card of the suit. */
  mayHold(seat: Seat, slot: number): boolean {
    return !this.k.voids[seat]![slot] && this.unseenOf(slot).length > 0;
  }
  /** That seat may hold a card of the same suit (or a trump, for a trump) that beats `c`. */
  mayHoldAbove(seat: Seat, c: Card): boolean {
    const slot = this.slot(c);
    const p = this.power(c);
    return (
      !this.k.voids[seat]![slot] && this.k.caps[seat]![slot]! > p && this.unseenOf(slot).some((u) => this.power(u) > p)
    );
  }
  /** That seat may cut a card of this plain suit: it is known to have none, and may hold a trump. */
  couldRuff(seat: Seat, plainSlot: number): boolean {
    if (plainSlot === TRUMP_SLOT) return false;
    const voidKnown = this.k.voids[seat]![plainSlot] || this.unseenOf(plainSlot).length === 0;
    return voidKnown && this.mayHold(seat, TRUMP_SLOT);
  }
  isOpponent(seat: Seat): boolean {
    return teamOf(seat) !== teamOf(this.me);
  }
  /** The seats still to play after me in this trick. */
  after(): Seat[] {
    const n = this.view.currentTrick.length;
    const out: Seat[] = [];
    for (let i = 1; i <= 3 - n; i++) out.push(((this.me + i) % 4) as Seat);
    return out;
  }
  /** Could an opponent still to come beat `c`, as the trick stands with `c` on top? */
  beatenLater(c: Card): boolean {
    const trump = isTrump(c, this.ctx);
    return this.after().some(
      (s) => this.isOpponent(s) && (this.mayHoldAbove(s, c) || (!trump && this.couldRuff(s, this.slot(c)))),
    );
  }
  /** How many cards of the suit I hold (the shortest suit is the one to empty). */
  length(c: Card): number {
    const slot = this.slot(c);
    return this.view.hand.filter((h) => this.slot(h) === slot).length;
  }

  // Orderings. Ties end on the card id, so the same position always plays the same card.
  cheapest(plays: PlayCardAction[]): PlayCardAction {
    return plays
      .slice()
      .sort((a, b) => this.points(a.card) - this.points(b.card) || this.power(a.card) - this.power(b.card) || cmpId(a, b))[0]!;
  }
  fattest(plays: PlayCardAction[]): PlayCardAction {
    return plays
      .slice()
      .sort((a, b) => this.points(b.card) - this.points(a.card) || this.power(b.card) - this.power(a.card) || cmpId(a, b))[0]!;
  }
  /** A card to give away: never a master if it can be helped, few points, from the shortest suit. */
  shed(plays: PlayCardAction[]): PlayCardAction {
    return plays
      .slice()
      .sort(
        (a, b) =>
          Number(this.isMaster(a.card)) - Number(this.isMaster(b.card)) ||
          this.points(a.card) - this.points(b.card) ||
          this.length(a.card) - this.length(b.card) ||
          this.power(a.card) - this.power(b.card) ||
          cmpId(a, b),
      )[0]!;
  }

  lead(plays: PlayCardAction[]): PlayCardAction {
    const trumps = plays.filter((p) => isTrump(p.card, this.ctx));
    const plains = plays.filter((p) => !isTrump(p.card, this.ctx));
    const opponents = [((this.me + 1) % 4) as Seat, ((this.me + 3) % 4) as Seat];

    // Draw their trumps while the master is mine.
    const masterTrump = trumps.filter((p) => this.isMaster(p.card)).sort((a, b) => this.power(b.card) - this.power(a.card))[0];
    if (masterTrump && opponents.some((s) => this.mayHold(s, TRUMP_SLOT))) return masterTrump;

    // Cash a master nobody can cut.
    const safeMasters = plains.filter((p) => this.isMaster(p.card) && !opponents.some((s) => this.couldRuff(s, this.slot(p.card))));
    if (safeMasters.length) return this.fattest(safeMasters);

    // A suit my partner can cut and the opponent before them cannot: a cheap card there.
    const lho = ((this.me + 1) % 4) as Seat;
    const forPartner = plains.filter((p) => this.couldRuff(this.partner, this.slot(p.card)) && !this.couldRuff(lho, this.slot(p.card)));
    if (forPartner.length) return this.cheapest(forPartner);

    // Otherwise a cheap card from the shortest suit - not a master, and not a
    // ten under an ace still out.
    if (plains.length) {
      return plains
        .slice()
        .sort(
          (a, b) =>
            Number(this.isMaster(a.card)) - Number(this.isMaster(b.card)) ||
            Number(this.exposedTen(a.card)) - Number(this.exposedTen(b.card)) ||
            this.length(a.card) - this.length(b.card) ||
            this.points(a.card) - this.points(b.card) ||
            this.power(a.card) - this.power(b.card) ||
            cmpId(a, b),
        )[0]!;
    }
    return this.cheapest(trumps);
  }
  /** A plain ten whose ace is still out: led, it is simply taken. */
  exposedTen(c: Card): boolean {
    return c.rank === '10' && !isTrump(c, this.ctx) && this.unseenOf(this.slot(c)).some((u) => u.rank === 'A');
  }

  follow(plays: PlayCardAction[]): PlayCardAction {
    const trick = this.view.currentTrick;
    const winnerSeat = trick[trickWinnerIndex(trick.map((p) => p.card), this.ctx)]!.seat;
    const winners = plays.filter((p) => wouldWin(trick, p.card, this.ctx));
    const losers = plays.filter((p) => !wouldWin(trick, p.card, this.ctx));
    const safe = winners.filter((p) => !this.beatenLater(p.card));

    if (winnerSeat === this.partner) {
      const partnerCard = trick.find((p) => p.seat === this.partner)!.card;
      if (!this.beatenLater(partnerCard)) {
        // The trick is ours: feed it, without taking it off them.
        return losers.length ? this.fattest(losers) : this.cheapest(winners);
      }
      // Someone after me may take it from them: hold it myself if I safely can, else give nothing away.
      if (safe.length) return this.cheapest(safe);
      return losers.length ? this.shed(losers) : this.cheapest(winners);
    }

    // An opponent is winning.
    if (safe.length) return this.cheapest(safe);
    if (losers.length === 0) return this.cheapest(winners); // forced (an overtrump, say)
    // No sure winner: a fat trick is still worth a try, a thin one is not.
    const onTable = trick.reduce((n, p) => n + this.points(p.card), 0);
    if (winners.length && onTable >= 20) return this.cheapest(winners);
    return this.shed(losers);
  }

  /** The rules' pick, by reading alone. */
  byRules(plays: PlayCardAction[]): PlayCardAction {
    return this.view.currentTrick.length === 0 ? this.lead(plays) : this.follow(plays);
  }

  /**
   * The pick with a look ahead (rollout.ts): every candidate played out to
   * the deal's end over hands dealt from what is still unseen, within what
   * the deal has shown; the rules' own pick goes first and keeps a tie.
   */
  play(plays: PlayCardAction[], rng: () => number): PlayCardAction {
    if (plays.length < 2) return plays[0]!;
    const first = this.byRules(plays);
    const ordered = [first, ...plays.filter((p) => p !== first)];
    const mayHold = (seat: Seat, c: Card): boolean => {
      const slot = this.slot(c);
      return !this.k.voids[seat]![slot] && this.k.caps[seat]![slot]! > this.power(c);
    };
    return bestByRollout(this.view, { unseen: this.k.unseen, mayHold }, ordered, rng, ordered.map((p) => this.convention(p)));
  }

  /**
   * The partner's conventions, as points on top of what the play-outs find
   * (they cannot see the bela 20, nor what a partner meant). In play order:
   * call the bela; never take a trick off a partner who already holds it;
   * when the partner's card may still be beaten, hold the trick for them;
   * on a lead, return the suit the partner led and won, lead through a
   * caller sitting on the left so the partner plays last, and lead where
   * the partner can cut.
   */
  convention(p: PlayCardAction): number {
    let bonus = 0;
    if (p.announceBela === true) bonus += 20;
    const trick = this.view.currentTrick;
    if (trick.length === 0) {
      if (isTrump(p.card, this.ctx)) return bonus;
      const slot = this.slot(p.card);
      // The partner's suit: one they led and we took.
      if (this.k.leads.some((l) => l.leader === this.partner && l.suit === p.card.suit && l.winner !== null && !this.isOpponent(l.winner))) {
        bonus += 4;
      }
      // Through the caller on my left: they commit second, my partner plays last.
      const caller = this.view.callerSeat;
      const lho = ((this.me + 1) % 4) as Seat;
      if (caller !== null && caller === lho && this.isOpponent(caller) && this.mayHold(caller, slot) && !this.isMaster(p.card) && !this.exposedTen(p.card)) {
        bonus += 3;
      }
      // Where the partner can cut and the opponent before them cannot.
      if (this.couldRuff(this.partner, slot) && !this.couldRuff(lho, slot)) bonus += 3;
      return bonus;
    }
    const winnerSeat = trick[trickWinnerIndex(trick.map((t) => t.card), this.ctx)]!.seat;
    if (winnerSeat !== this.partner) return bonus;
    const partnerCard = trick.find((t) => t.seat === this.partner)!.card;
    const holds = !this.beatenLater(partnerCard);
    const wins = wouldWin(trick, p.card, this.ctx);
    // A trick the partner already holds is not taken off them (unless every card would).
    if (holds && wins && !this.view.legalActions.every((a) => a.type !== 'PLAY_CARD' || wouldWin(trick, a.card, this.ctx))) bonus -= 8;
    // One they may lose is held for them, with a card that will keep it.
    if (!holds && wins && !this.beatenLater(p.card)) bonus += 2;
    return bonus;
  }
}

/** The conventions' points for each legal card, for the tests: what the hard bot adds to the look-ahead. */
export function hardConventions(view: PublicView, memory: BotMemory | undefined): { card: Card; bonus: number }[] {
  const mind = new Mind(view, memory);
  const plays = preferBela(view.legalActions.filter((a): a is PlayCardAction => a.type === 'PLAY_CARD'));
  return plays.map((p) => ({ card: p.card, bonus: mind.convention(p) }));
}

function cmpId(a: PlayCardAction, b: PlayCardAction): number {
  return cardId(a.card) < cardId(b.card) ? -1 : cardId(a.card) > cardId(b.card) ? 1 : 0;
}

// --- bidding -----------------------------------------------------------------

/**
 * The hand's worth with `trump` called, beyond medium's count: length in
 * trumps, a void to cut into, the king and queen together (bela).
 */
export function hardBidScore(hand: readonly Card[], trump: Suit): number {
  let score = bidScore(hand, trump);
  const trumps = hand.filter((c) => c.suit === trump);
  if (trumps.length >= 5) score += 3;
  else if (trumps.length >= 4) score += 2;
  for (const suit of SUITS) {
    if (suit !== trump && !hand.some((c) => c.suit === suit)) score += 1;
  }
  if (trumps.some((c) => c.rank === 'K') && trumps.some((c) => c.rank === 'Q')) score += 2;
  return score;
}

/**
 * What the bidding so far says: the seats before me in the round (it starts
 * after the dealer) have passed. An opponent's pass means the cards may be
 * with us; a partner's pass means they are not with them. Measured in the
 * arena against medium (see the test's numbers in the package README).
 */
export function hardBidThreshold(view: PublicView): number {
  const position = (view.seat - (view.dealer + 1) + 4) % 4;
  // first to speak; one opponent passed; an opponent and my partner passed; everyone passed (I am the dealer)
  return [11, 10, 12, 11][position]!;
}

function decideBidHard(view: PublicView, actions: Action[]): Action {
  const calls = actions.filter((a): a is BidCallAction => a.type === 'BID_CALL');
  const canPass = actions.some((a) => a.type === 'BID_PASS');
  let bestSuit: Suit = SUITS[0]!;
  let bestScore = -Infinity;
  let bestLength = -1;
  for (const suit of SUITS) {
    const sc = hardBidScore(view.hand, suit);
    const len = view.hand.filter((c) => c.suit === suit).length;
    if (sc > bestScore || (sc === bestScore && len > bestLength)) {
      bestScore = sc;
      bestSuit = suit;
      bestLength = len;
    }
  }
  if (canPass && bestScore < hardBidThreshold(view)) return { type: 'BID_PASS', seat: view.seat };
  return calls.find((c) => c.suit === bestSuit) ?? calls[0]!;
}

// --- doubling ----------------------------------------------------------------

/** Kontra on the called suit's jack and nine, or a hand that would have called it; never rekontra. */
function decideDoubleHard(view: PublicView, actions: Action[]): Action {
  const pass = actions.find((a) => a.type === 'DOUBLE_PASS') ?? actions[0]!;
  const kontra = actions.find((a) => a.type === 'DOUBLE_KONTRA');
  const trump = view.context.trumpSuit;
  if (!kontra || trump === null) return pass;
  const trumps = view.hand.filter((c) => c.suit === trump);
  const topPair = trumps.some((c) => c.rank === 'J') && trumps.some((c) => c.rank === '9');
  return topPair || bidScore(view.hand, trump) >= 12 ? kontra : pass;
}

// --- the level ---------------------------------------------------------------

/** The card the rules alone would play (no look-ahead): what the tests pin about the reading of the deal. */
export function hardRulesPick(view: PublicView, actions: Action[], memory: BotMemory | undefined): PlayCardAction {
  const plays = preferBela(actions.filter((a): a is PlayCardAction => a.type === 'PLAY_CARD'));
  return new Mind(view, memory).byRules(plays);
}

/** The hard bot's choice among `actions` (the zvanja answer is decided before this). */
export function decideHard(view: PublicView, actions: Action[], memory: BotMemory | undefined, rng: () => number): Action {
  const head = actions[0]!.type;
  if (head === 'BID_PASS' || head === 'BID_CALL') return decideBidHard(view, actions);
  if (head === 'DOUBLE_KONTRA' || head === 'DOUBLE_REKONTRA' || head === 'DOUBLE_PASS') return decideDoubleHard(view, actions);
  if (head === 'DECLARE_SKIP') return actions[0]!;
  const plays = preferBela(actions.filter((a): a is PlayCardAction => a.type === 'PLAY_CARD'));
  // The memory reads suits against one trump suit; another contract plays medium's way.
  if (view.context.contractType !== 'SUIT') return decidePlay(view, plays);
  return new Mind(view, memory).play(plays, rng);
}
