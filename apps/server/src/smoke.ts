import './ws-polyfill';
import { Client, type Room } from 'colyseus.js';
import { cardId, RANKS, SUITS, type Card, type PublicView, type Seat } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import { MSG, ROOM_NAME, type RoomMessage } from './protocol';

/**
 * End-to-end check against a running server.
 *
 * Four real clients join over websockets and play a whole deal. The point is not
 * that the rules work — the engine has 300+ tests for that — but that the
 * *transport* keeps its promise: no client may ever receive a card that is in
 * somebody else's hand.
 *
 *   npm run start --workspace @belot/server     # in one terminal
 *   npm run smoke --workspace @belot/server     # in another
 *
 * WHY THIS FILE IS SHAPED THE WAY IT IS. The first version of this check
 * accumulated every card each client had ever seen, then at the end compared
 * that against the other seats' hands — as read from their FINAL views. By then
 * the deal is over and every hand is empty, so the comparison set was `[]` and
 * the leak counter could not be anything but zero. It printed PASS for months
 * while asserting nothing. Handing all four clients the entire 32-card deck
 * still produced "PASS".
 *
 * Two changes stop that recurring:
 *
 *  1. Assertions run at MESSAGE-RECEIPT time, against hands as they are at that
 *     moment, never against end-of-deal state.
 *  2. `selfTest()` below plants known breaches and requires each one to be
 *     caught. It runs before the live check, so a future edit that makes the
 *     assertions vacuous fails here instead of printing a green PASS.
 */

const ENDPOINT = process.env.SERVER_URL ?? 'ws://localhost:2567';

interface Seated {
  room: Room;
  seat: Seat;
  view: PublicView | null;
}

/**
 * What is actually true at this instant, assembled from the seats' own views.
 *
 * A card only ever leaves a hand by being played, and playing it makes it
 * public — so a slightly stale snapshot can never produce a false accusation.
 */
interface Ground {
  /** seat -> the cards it holds, according to that seat's OWN view. */
  hands: Map<Seat, Set<string>>;
  /** Cards that have legitimately become public: played, or laid face up as zvanja. */
  publicCards: Set<string>;
}

function newGround(): Ground {
  return { hands: new Map(), publicCards: new Set() };
}

/** Every card anywhere inside a value, however deeply nested. */
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

const ids = (cards: Card[]): string[] => cards.map(cardId);

// ---------------------------------------------------------------------------
// The assertions
// ---------------------------------------------------------------------------

/**
 * Cards a view is entitled to carry, listed by the POSITION they may appear in.
 *
 * Whitelisting by position rather than by value is what makes the check bite: a
 * card smuggled into any other field is not in this set, whatever it is.
 */
function entitledInView(view: PublicView): Set<string> {
  const ok = new Set<string>();
  for (const c of view.hand) ok.add(cardId(c)); // this seat's own cards
  for (const p of view.currentTrick) ok.add(cardId(p.card)); // played, face up
  for (const d of view.revealedDeclarations) for (const c of d.cards) ok.add(cardId(c)); // laid out
  for (const d of view.myDeclarations) for (const c of d.cards) ok.add(cardId(c)); // own, already in hand
  for (const c of collectCards(view.legalActions)) ok.add(cardId(c)); // own cards, offered as moves
  return ok;
}

/** Cards an event stream is entitled to carry. */
function entitledInEvents(events: TableEvent[]): Set<string> {
  const ok = new Set<string>();
  for (const e of events) {
    if (e.kind === 'cardPlayed') ok.add(cardId(e.card));
    else if (e.kind === 'declarationsRevealed') {
      for (const d of e.declarations) for (const c of d.cards) ok.add(cardId(c));
    }
  }
  return ok;
}

/** Cards another seat is holding right now, and that are not public. */
function heldElsewhere(seat: Seat, cards: Card[], g: Ground): string[] {
  const bad: string[] = [];
  for (const id of ids(cards)) {
    if (g.publicCards.has(id)) continue;
    for (const [other, held] of g.hands) {
      if (other !== seat && held.has(id)) bad.push(`${id} is in seat ${other}'s hand`);
    }
  }
  return bad;
}

/** Everything wrong with one view message. Empty means clean. */
export function checkView(seat: Seat, msg: { seat: Seat; view: PublicView }, g: Ground): string[] {
  const bad: string[] = [];
  const view = msg.view;
  const entitled = entitledInView(view);

  for (const id of ids(collectCards(msg))) {
    if (!entitled.has(id)) bad.push(`${id} appears somewhere a card has no business being`);
  }
  // The public summaries promise to carry no cards at all — that is the whole
  // reason DeclarationSummary exists alongside Declaration.
  if (collectCards(view.announcedDeclarations).length > 0) {
    bad.push('announcedDeclarations carried cards; it is supposed to be summaries only');
  }
  // A hand that IS shown must be the size the table publicly says it is.
  // Without this, a server could hand over all 32 cards as `hand` and call them
  // "your own", and every other check here would wave them through.
  //
  // Only when cards are actually shown: the waiting room deliberately sends an
  // empty hand while `handCounts` already reports the six dealt cards, so that
  // an early arrival cannot walk the free seats and read three quarters of the
  // deck (BelaRoom.ts, `this.started ? view : {...view, hand: []}`). Being sent
  // FEWER cards than you own is over-redaction, never a leak.
  const expected = view.handCounts[view.seat];
  if (view.hand.length > 0 && view.hand.length !== expected) {
    bad.push(`hand holds ${view.hand.length} cards but handCounts says ${expected}`);
  }
  bad.push(...heldElsewhere(seat, collectCards(msg), g));
  return bad;
}

/** Everything wrong with one room message. Empty means clean. */
export function checkRoom(seat: Seat, msg: RoomMessage, g: Ground): string[] {
  const bad: string[] = [];
  const events = msg.events ?? [];
  const entitled = entitledInEvents(events);

  for (const id of ids(collectCards(msg))) {
    if (!entitled.has(id)) bad.push(`${id} rode in on the event stream from an unexpected field`);
  }
  for (const e of events) {
    if (e.kind === 'declared' && collectCards(e.declarations).length > 0) {
      bad.push(`the 'declared' event carried cards; only the number is public`);
    }
  }
  bad.push(...heldElsewhere(seat, collectCards(msg), g));
  return bad;
}

/** Fold a message's legitimately-public cards into the ground truth. */
function absorbView(view: PublicView, g: Ground): void {
  for (const p of view.currentTrick) g.publicCards.add(cardId(p.card));
  for (const d of view.revealedDeclarations) for (const c of d.cards) g.publicCards.add(cardId(c));
}

function absorbEvents(events: TableEvent[], g: Ground): void {
  for (const id of entitledInEvents(events)) g.publicCards.add(id);
}

// ---------------------------------------------------------------------------
// Proof that the assertions can fail
// ---------------------------------------------------------------------------

const card = (suit: string, rank: string): Card => ({ suit, rank }) as unknown as Card;

/** A minimal, entirely legitimate view for seat 0 holding two cards. */
function sampleView(hand: Card[], handCounts: [number, number, number, number]): PublicView {
  return {
    phase: 'PLAY',
    dealer: 3,
    seat: 0,
    hand,
    handCounts,
    context: { contractType: 'SUIT', trumpSuit: 'hearts' },
    callerSeat: 0,
    multiplier: 1,
    trickLeader: 0,
    currentTrick: [],
    toAct: 0,
    declareTurn: null,
    revealedDeclarations: [],
    matchScores: [0, 0],
    announcedDeclarations: [],
    myDeclarations: [],
    mustDeclare: false,
    canDeclare: false,
    canAnnounceBela: false,
    belaAnnouncedBy: null,
    dealProgress: null,
    legalActions: [],
  } as unknown as PublicView;
}

/**
 * Plant breaches we KNOW are breaches and require each to be caught.
 *
 * This is the guard against the failure that made the previous version of this
 * file useless: a check that cannot fail reports success forever.
 */
function selfTest(): boolean {
  const mine = [card('hearts', 'A'), card('hearts', 'K')];
  const theirs = [card('spades', 'A'), card('spades', 'K')];

  const ground = (): Ground => {
    const g = newGround();
    g.hands.set(0, new Set(ids(mine)));
    g.hands.set(1, new Set(ids(theirs)));
    return g;
  };

  const cases: Array<[string, () => string[]]> = [
    [
      "another seat's card smuggled into the hand",
      () => checkView(0, { seat: 0, view: sampleView([...mine, theirs[0]!], [3, 2, 8, 8]) }, ground()),
    ],
    [
      'the whole deck handed over as "your own hand"',
      () => {
        const deck = SUITS.flatMap((s) => RANKS.map((r) => card(s, r)));
        return checkView(0, { seat: 0, view: sampleView(deck, [8, 8, 8, 8]) }, ground());
      },
    ],
    [
      'a card hidden in a field that should never hold one',
      () => {
        const view = sampleView(mine, [2, 2, 8, 8]);
        (view as unknown as Record<string, unknown>).spare = theirs[1];
        return checkView(0, { seat: 0, view }, ground());
      },
    ],
    [
      'summaries carrying the cards they are supposed to hide',
      () => {
        const view = sampleView(mine, [2, 2, 8, 8]);
        (view.announcedDeclarations as unknown as unknown[]).push({
          kind: 'TERCA',
          value: 20,
          length: 3,
          topRank: 'K',
          seat: 1,
          cards: theirs,
        });
        return checkView(0, { seat: 0, view }, ground());
      },
    ],
    [
      "an unplayed card from another hand riding the event stream",
      () =>
        checkRoom(
          0,
          {
            seats: [],
            status: 'playing',
            events: [{ kind: 'cardPlayed', seat: 1, card: theirs[0]! } as TableEvent],
            series: [0, 0],
            matchNumber: 0,
            // a second, unplayed card smuggled alongside the legitimate one
            rematchVotes: [theirs[1] as unknown as Seat],
          } as unknown as RoomMessage,
          ground(),
        ),
    ],
  ];

  let allCaught = true;
  for (const [name, run] of cases) {
    const found = run();
    if (found.length === 0) {
      console.error(`[smoke] SELF-TEST FAILED — planted breach went undetected: ${name}`);
      allCaught = false;
    }
  }

  // ...and the converse: a clean message must NOT be flagged, or the check is
  // just a tripwire that fires at everything and proves nothing either.
  const clean = checkView(0, { seat: 0, view: sampleView(mine, [2, 2, 8, 8]) }, ground());
  if (clean.length > 0) {
    console.error(`[smoke] SELF-TEST FAILED — a legitimate view was flagged: ${clean.join('; ')}`);
    allCaught = false;
  }

  console.log(
    allCaught
      ? `[smoke] self-test: ${cases.length} planted breaches all caught, clean view passed`
      : '[smoke] self-test: the assertions are not working',
  );
  return allCaught;
}

// ---------------------------------------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (!selfTest()) {
    console.error('[smoke] FAIL — refusing to report on the server with assertions that do not bite');
    process.exit(1);
  }

  const client = new Client(ENDPOINT);
  const players: Seated[] = [];
  const g = newGround();
  const violations: string[] = [];

  console.log(`[smoke] connecting four clients to ${ENDPOINT}`);
  // Create one PRIVATE room explicitly and join the rest BY ID. `joinOrCreate`
  // can hand clients to different rooms (a stray seat reservation is enough to
  // do it), and comparing hands across two rooms compares two different decks.
  // Private also exempts these four same-machine clients from the public
  // one-seat-per-origin rule, exactly as four friends round one table would be.
  let roomId: string | null = null;
  for (let i = 0; i < 4; i++) {
    const room: Room =
      roomId === null
        ? await client.create(ROOM_NAME, { name: `Test ${i + 1}`, private: true })
        : await client.joinById(roomId, { name: `Test ${i + 1}` });
    roomId ??= room.roomId;
    const seated: Seated = { room, seat: 0 as Seat, view: null };

    room.onMessage(MSG.view, (msg: { seat: Seat; view: PublicView }) => {
      seated.seat = msg.seat;
      seated.view = msg.view;
      // Public cards first, so a card played this very tick is not mistaken for
      // one still sitting in the player's hand.
      absorbView(msg.view, g);
      for (const v of checkView(msg.seat, msg, g)) {
        violations.push(`seat ${msg.seat}: ${v}`);
        console.error(`[smoke] LEAK — seat ${msg.seat}: ${v}`);
      }
      // Only now update this seat's own holdings, so the check above compared
      // against the OTHER seats as they stood.
      g.hands.set(msg.seat, new Set(ids(msg.view.hand)));
    });
    room.onMessage(MSG.room, (msg: RoomMessage) => {
      absorbEvents(msg.events ?? [], g);
      for (const v of checkRoom(seated.seat, msg, g)) {
        violations.push(`seat ${seated.seat}: ${v}`);
        console.error(`[smoke] LEAK — seat ${seated.seat}: ${v}`);
      }
    });
    room.onMessage(MSG.error, (msg: { reason: string }) => {
      console.log(`[smoke] seat ${seated.seat} rejected: ${msg.reason}`);
    });

    players.push(seated);
  }

  await wait(900);
  const seats = players.map((p) => p.seat);
  console.log('[smoke] room', roomId, 'seats:', seats.join(', '));
  if (new Set(seats).size !== 4) {
    console.error('[smoke] FAIL — clients did not take four distinct seats in one room');
    process.exit(1);
  }

  // Play until the deal is scored, always taking the first legal action.
  let moves = 0;
  for (let step = 0; step < 200; step++) {
    const actor = players.find((p) => p.view && p.view.toAct === p.seat && p.view.legalActions.length);
    if (!actor?.view) {
      await wait(120);
      continue;
    }
    actor.room.send('action', { action: actor.view.legalActions[0] });
    moves++;
    await wait(90);
    if (players.some((p) => p.view?.phase === 'DEAL_OVER' || p.view?.phase === 'MATCH_OVER')) break;
  }

  console.log(`[smoke] ${moves} moves played, ${g.publicCards.size} card(s) legitimately public`);

  // A deal that never got going would pass every assertion by never testing one.
  const played = players.some((p) => p.view?.phase === 'DEAL_OVER' || p.view?.phase === 'MATCH_OVER');
  if (!played) {
    console.error('[smoke] FAIL — the deal never reached a conclusion, so nothing was really checked');
    for (const p of players) await p.room.leave();
    process.exit(1);
  }

  console.log(
    violations.length === 0
      ? `[smoke] PASS — ${moves} moves, no client was ever sent a card another seat was holding`
      : `[smoke] FAIL — ${violations.length} violation(s)`,
  );

  for (const p of players) await p.room.leave();
  process.exit(violations.length === 0 && moves > 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[smoke] failed', err);
  process.exit(1);
});
