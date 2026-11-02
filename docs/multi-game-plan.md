# Plan: Bela Štih → one app for many card games

## Context

Bela Štih is a finished, well-layered Belot app: a pure deterministic rules engine
(`packages/engine`), bots (`packages/bots`), a seat-aware session layer
(`packages/table`), an authoritative Colyseus room (`apps/server`), and an Expo client
(`apps/mobile`) that renders offline and online play through the same `TableScreen`.
Every layer, though, is typed in Bela's vocabulary: `Seat = 0|1|2|3`, a 32-card
`Card`, a Bela `Action` union, a Bela `PublicView`, Bela `TableEvent`s, Bela quests, Bela
strings. There is no game-agnostic contract anywhere.

The user wants one app that also plays Texas Hold'em, Blackjack, Baccarat and an
Uno-style shedding game (and later more). The outcome of this plan is a multi-game core
that Bela plugs into **without any behaviour change** (golden corpus and wire snapshot
stay green), the four new games built on that core, offline first and then online, one
progression system, and a new umbrella brand.

## Decisions already taken (with the user)

| Question | Decision |
|---|---|
| First wave of games | Texas Hold'em, Blackjack, Baccarat, Uno-style shedding game (all four) |
| Betting games and store rating | Accept the *Simulated Gambling* descriptor / higher age rating. Chips are free play-money: never purchasable, never convertible to coins, refilled daily. |
| Branding | Rebrand to an umbrella card-games name (name to be chosen by the user); app id, deep links, web shell and store listing are Phase 4 work items. |

Constraints the plan honours:

- The Bela engine is **wrapped, never edited**: `packages/engine/test/golden` hashes every
  step and must keep hashing identically.
- `apps/mobile/test/wire-schema.snapshot.json` may only **grow**. `Seat`-typed fields are never
  widened; generic rooms get their own message types.
- Colyseus stays pinned at `@colyseus/core` 0.16.22 / `colyseus.js` 0.16.22; no `@colyseus/schema`
  state sync (we keep sending per-seat redacted views).
- "Uno" is a Mattel trademark: the shedding game ships as **Osmice** (Crazy-Eights family) with its
  own name, card art and action-card names, no "UNO" call ("zadnja!").
- Everything in `packages/` stays pure TS with no IO.

---

## 1. Target layout

```
packages/
  shared-types/  engine/  bots/          unchanged (bots: BotLevel re-exported from game-core)
  game-core/        NEW @belot/game-core   GameDefinition, Session, Rng, harnesses (selfplay, leak, golden)
  cards/            NEW @belot/cards       French 52 deck (Rank52), shoe, cardId52, hand utils
  games/bela/       NEW @belot/game-bela   TableEvent + deriveBelaEvents (moved verbatim), BELA definition
  games/osmice/     NEW                    engine, bots, definition, golden
  games/baccarat/   NEW
  games/holdem/     NEW                    engine, evaluate.ts, pots.ts, betting.ts, showdown.ts, bots
  games/blackjack/  NEW
  registry/         NEW @belot/games       GameId union, GAMES record — the only place importing every game
  table/            KEPT   Table = thin shim over Session<BELA>, same public API
  i18n/             + src/games/<id>/{hr,sr-Cyrl,en}.ts, Lang.game(id)
  progression/      game-aware quests/stats, chips bankroll

apps/server/src/
  room/GameRoom.ts, room/occupants.ts, room/clocks.ts, room/relay.ts   extracted from BelaRoom.ts
  rooms/BelaRoom.ts (extends GameRoom<BELA>), OsmiceRoom.ts, BaccaratRoom.ts, HoldemRoom.ts, BlackjackRoom.ts
  protocol.ts       additive: GameId, MoveMessage, GameRoomMessage, PlayerInfo, WindowInfo, ROOM_NAMES
  smoke/leak.ts + smoke-<game>.ts

apps/mobile/src/
  games/types.ts (ClientGameAdapter), games/registry.ts, games/<id>/{adapter.ts, <Id>Table.tsx}
  shell/GameShell.tsx, shell/SeatRing.tsx, shell/ringGeometry.ts
  shell/useLocalSession.ts (from useGame.ts), net/useNetSession.ts (from useNetGame.ts)
  table/betting/{ChipStack,PotDisplay,BetSlider}.tsx
  deck/french52.tsx (extends deck/french.tsx to ranks 2..A)
  home/GameGrid.tsx, home/GameCard.tsx;  HomeScreen.tsx → lobby;  App.tsx → Launch gains `game`
```

tsconfig/vitest: add `"@belot/game-*": ["../../packages/games/*/src/index.ts"]` to
`apps/mobile/tsconfig.json` paths (its `@belot/*` glob does not reach `packages/games/*`; the
typecheck would silently pass on missing modules), plus root `tsconfig.json`, `vitest.config.ts`,
`apps/server/tsconfig.json`.

---

## 2. The game contract (`packages/game-core/src/definition.ts`)

```ts
export type Rng = () => number;
export type BotLevel = 'easy' | 'medium' | 'hard';
export type SeatStatus = 'active' | 'out' | 'sittingOut';

export interface GameMeta {
  id: string; nameKey: string;
  minPlayers: number; maxPlayers: number;
  teams: { count: number; teamOf(seat: number, seats: number): number } | null;
  deck: 'madarice32' | 'french52' | 'french52-shoe' | 'custom';
  betting: boolean;        // per-seat stacks in state
  casino: boolean;         // lobby grouping + rating questionnaire
  simultaneous: boolean;   // actors() may return more than one seat
  seatFillOrder?(seats: number): number[];   // Bela: [0,2,1,3]
  windowMs: number; nextRoundMs: number;
}

export type Cause<A> =
  | { kind: 'action'; action: A } | { kind: 'startRound' }
  | { kind: 'newMatch'; matchNumber: number } | { kind: 'closeWindow' };

export interface Secret { tokens: string[]; visibleTo: number[] }

export interface GameDefinition<S, A extends { seat: number; type: string }, V, E extends { kind: string }, C> {
  meta: GameMeta; defaultConfig: C;
  createMatch(o: { seats: number; rng: Rng; seed: number; config?: Partial<C>; dealer?: number; stacks?: number[] }): S;
  startRound(s: S): S;  roundOver(s: S): boolean;  matchOver(s: S): boolean;
  actors(s: S): number[];                       // [] none, [x] one, [a,b,c] simultaneous window
  seatStatus(s: S, seat: number): SeatStatus;
  legalActions(s: S, seat: number): A[];        // ranged actions carry min/max
  normalize(s: S, seat: number, raw: unknown): A | null;   // untrusted input → action (server path)
  defaultAction(s: S, seat: number): A;         // timeout action (fold/check, READY, draw, bot move)
  apply(s: S, a: A): S;                         // immutable
  view(s: S, seat: number): V;                  // redacted
  secrets(s: S): Secret[];                      // drives the generic leak test
  isEventPublic(e: E): boolean;
  deriveEvents(before: S, after: S, cause: Cause<A>): E[];
  winners(s: S): number[] | null;
  settlement(s: S): number[] | null;            // chip deltas at matchOver, betting games only
  bot: { decide(view: V, rng: Rng, level: BotLevel, memory?: unknown): A; memory?(s: S): unknown };
}
```

`Session<D>` (`packages/game-core/src/session.ts`) is today's `Table` generalised: `seats`,
`humanSeats`, `setSeatHuman`, `actors()`, `decisionId()` (`${actors}:${moveCount}`, what clocks key
on), `legal(seat)`, `view(seat)`, `submit`, `submitRaw(seat, raw)` (via `normalize`), `botMoveFor`,
`closeWindow()` (applies `defaultAction` for every pending human), `startNextRound`, `newMatch`,
`playWholeMatch`, `drainEvents`, `runBots` (same 4096 guard; picks the first bot among actors).

### Simultaneous actions and clocks

Engines stay time-free. A phase with several actors (Baccarat/Blackjack betting) shrinks
`actors()` as seats act; the last one's `apply` resolves the round. Timing lives in one
`DecisionClock` (`apps/server/src/room/clocks.ts`, replacing `armTimer`/`stopTimer` at
`BelaRoom.ts:1051-1110`), keyed on `decisionId()`, duration `meta.windowMs`, expiry →
`closeWindow()`. Offline, `useLocalSession` runs the same clock only when `meta.simultaneous`.
`TurnRing` draws on every seat in the published `window.seats`.

### Bela adapter (`packages/games/bela/src/definition.ts`), all existing exports

| Contract | Bela |
|---|---|
| createMatch / startRound | `createMatch`, `startDeal` (seats must be 4) |
| roundOver / matchOver | `phase === 'DEAL_OVER'` / `'MATCH_OVER'` |
| actors | `currentActor(s)` → `[]` or `[seat]` |
| legalActions(s, seat) | `legalActions(s)` filtered by seat |
| defaultAction | `decideAction(publicView(s, seat), rng, level)` (today's timeout bot move) |
| apply / view | `applyAction` / `publicView` |
| secrets | `hands[seat]` minus revealed/played cards, `visibleTo [seat]` |
| isEventPublic | `kind !== 'declarationSkipped'` |
| deriveEvents | body of `applyAndRecord` (`packages/table/src/index.ts:307-405`) moved verbatim, plus `matchStarted`/`dealStarted` pushes |
| winners / settlement | `matchWinner` → `[team]`; `null` |
| meta | 4/4 players, teams via `teamOf`, `seatFillOrder [0,2,1,3]`, `windowMs 30_000`, `nextRoundMs 13_000` |

`packages/table/src/index.ts` keeps class `Table` with its exact public surface delegating to a
private `Session<BELA>`; still exports `teamOf`, `BotLevel`, `TableEvent` so `apps/cli`,
`useGame.ts`, `BelaRoom`, `golden/run.ts` and the wire-schema `WANTED` entry compile unchanged.
A differential test (`packages/table/test/shim.test.ts`: pinned copy of the old `Table` vs the
shim over the golden seeds, same events/views/moveCount) guards the swap; deleted after Phase 1.

---

## 3. The four new games on the contract

**Osmice** (`packages/games/osmice`): custom 108-card deck, 4 colours with own art, 0–9, action
cards `preskok`, `obrni`, `vuci2`, `divlja`, `divlja4`; config knobs `stackDraws`, `sevenZeroSwap`,
`matchTarget 500`. State: hands, drawPile, discard, colour, direction, current, pendingDraw,
scores, out[]. Actions `PLAY {card, colour?}`, `DRAW`, `PASS`. Single actor; default `DRAW`/`PASS`.
Secrets: hands and draw pile. Invariant: 108 cards conserved; one empty hand ends a round.
Bots: easy random, medium dumps action cards on a short-handed next player, hard tracks colours.

**Baccarat** (punto banco): 8-deck shoe with cut card, per-seat stacks, bets {player, banker, tie},
ready[]. Actions `BET {on, amount}` (ranged), `CLEAR`, `READY`. Actors = all unready seats with
chips (simultaneous window, default `READY`). Last `READY` deals by the tableau and pays 1:1 /
0.95:1 / 8:1 in the same `apply`. Secrets: shoe. Invariant: Σstacks + house delta constant.

**Texas Hold'em** (no-limit sit-and-go, 2–9 seats): players {stack, status, streetBet, handTotal,
hole}, button, street, board, toAct, minRaiseTo, side pots, blinds schedule. Actions `FOLD`,
`CHECK`, `CALL`, `BET {to}`, `RAISE {to}` (ranged, `normalize` clamps), `ALL_IN`. Files
`evaluate.ts` (7-card best hand), `pots.ts`, `betting.ts` (min-raise, short all-in does not
reopen), `showdown.ts`, `blinds.ts`. Secrets: hole cards until revealed, deck. Invariant:
Σstacks + Σpots + Σbets = seats × startingStack. Bots: easy pair/ace caller; medium Chen preflop +
Monte-Carlo equity vs pot odds on a **separate bot rng stream**; hard adds position and stack depth.
Online: `sitOut`/`sitIn`, joiners sit out until the next hand.

**Blackjack**: simultaneous `BET` window → sequential `HIT/STAND/DOUBLE/SPLIT` → dealer auto-plays
in `apply`. Reuses the Baccarat shoe, chips UI and french52 deck. Cheapest of the four once Baccarat
exists.

Later (shape only): Hearts (pass-3 is a simultaneous window; reuses Bela trick geometry), Rummy.

---

## 4. Server extraction (`apps/server`)

`GameRoom<D>` base class with hooks `readRules(options)`, `handleGameMessage`, `roomExtras()`,
`preStartView(view)`, `onMatchOver()`, `nextRoundMs()`, `windowMs()`. From `BelaRoom.ts`:

| Lines today | Destination |
|---|---|
| Occupant, vacant, seatOf, freeSeat (124–150, 329–340) | `room/occupants.ts`, fill order from `meta.seatFillOrder` |
| onCreate option parsing (255–300) | `readRules` in `rooms/BelaRoom.ts` |
| room code, liveCodes, setPrivate, onMessage('*') hardening (301–327) | `GameRoom.onCreate` |
| onJoin / onLeave / reconnect / release / forget (≈340–507) | `GameRoom`, seat type `number` |
| buildTable / lockTable / rematch (508–577) | `GameRoom` (`buildSession`) |
| handle(): action, sit, clock, pause/resume/away/back/playOn, start, rematch, next, emote, voice, gift (578–889) | `GameRoom.handle`; `action` via `session.submitRaw`; Bela `rules` → `handleGameMessage` |
| afterMove, everyoneReady, armNext/stopNext/startNextDeal (890–963) | `GameRoom` (`roundOver()`), series block → `onMatchOver` |
| hold/pause/handToBot/holdInfo (964–1050), armTimer/stopTimer (1051–1110) | `room/clocks.ts` DecisionClock |
| seatInfo, publish (1133–1206) | `GameRoom.publish()` generic; `BelaRoom` overrides to emit the legacy `RoomMessage` shape |
| VoiceLedger/VoiceLimiter/rate maps | `room/relay.ts` |

Wire protocol (`protocol.ts`), additive only: new `ClientMessage` members `move {action: unknown}`,
`buyIn {amount}`, `sitOut`, `sitIn`; `RoomMessage.game?: 'bela'`; new types `GameId`, `PlayerInfo`
(seat: number, status?, stack?), `WindowInfo {seats, msLeft, totalMs}`, `GameRoomMessage`,
`GameHoldInfo`, `JoinGame {game?, buyIn?}`, `ROOM_NAMES`; `ViewMessage<V = PublicView>`. All added to
`WANTED` in `apps/mobile/test/wire-schema.test.ts`, snapshot refreshed with `SCHEMA_UPDATE=1`;
diff must be additions only. `PROTO` stays 1. `index.ts` defines one room per `ROOM_NAMES` entry;
`/health` lists games. Hidden-information smoke stays adversarial-by-design (a card is public only
if announced on the event stream) via per-game `publicTokensOf(event)` / `tokensOf(view)` with
planted-leak `selfTest()`, plus the pure in-process `harness/leak.ts` over `def.secrets`.

---

## 5. Mobile

Navigation stays hand-rolled. `Launch` gains `game: GameId` (deep links without `?g=` default to
`bela`); `MenuScreen` gains `lobby:${GameId}`; `screenKey` includes the game. `HomeScreen.tsx` top
becomes `home/GameGrid.tsx`; tapping a game opens the lobby, which is today's HomeScreen body
(quick / bots / private / code) parameterised by game. Casino games are grouped in the grid under
their own heading with an age-rating note.

`ClientGameAdapter` (`games/types.ts`): `id`, `def`, `roomName`, `Table` component,
`timings(motion)` for the director, `preDealView`, `onEvent(e, ctx)` → progression outcome + sfx +
haptics, `cueFor`, `fx`, `strings` namespace, `deck`, `offlineConfig(settings)`,
`createOptions(settings, rules)`.

- `shell/useLocalSession.ts` = `useGame.ts` with `Table`→`Session<D>`, `TableEvent`→`E`,
  `processEvents`→`adapter.onEvent`. `net/useNetSession.ts` = `useNetGame.ts` with room name and
  message shape from the adapter. `useGame`/`useNetGame` remain as Bela wrappers so
  `OfflineGame.tsx`/`OnlineGame.tsx` compile untouched in Phase 0.
- `anim/director.ts` → `Director<E extends {kind: string}>`; Bela `DEFAULT_TIMINGS` move to
  `games/bela/adapter.ts`.
- `shell/GameShell.tsx` composes the existing `SeatPuck`, `TurnRing`, `EmoteStrip`, `GiftPicker`,
  `HoldPanel`, `MicButton`, `FeltArt`, `EffectsOverlay`; `ringGeometry.ts` places N pucks on an
  ellipse with "me" at the bottom (Bela's `table/geometry.ts` 4-seat version stays).
- `deck/french52.tsx`: `Rank52 = '2'..'A'`, 2–6 pip layouts, reusing `FrenchPip`, corner index and
  courts exported from `deck/french.tsx`; card backs via `CardBackFace` so cosmetics apply everywhere.
- `table/betting/`: `ChipStack` (SVG discs, `useCountUp`), `PotDisplay`, `BetSlider` (gesture
  handler + presets min / ½ pot / pot / all-in).
- `TableScreen.tsx` is **not refactored**; `games/bela/adapter.ts` wraps it with today's props.

---

## 6. Progression, storage, i18n

**Progression** (`packages/progression/src/index.ts`): `Quest` becomes
`{kind: 'playRounds'|'winRounds'|'winMatch'|'special'; game?: GameId; special?: string; …}` with a
load-time map from the legacy kinds (`callZvanja` → special bela/zvanja, etc.);
`questsForDay(day, lastGame)` = 2 generic + 1 for the last game played. `PlayerProfile` gains
`games?: Partial<Record<GameId, GameStats>>`; Bela's existing counters stay authoritative for
`bela` so there is no migration. New `applyRoundOutcome` / `applyMatchResult` share the `award()`
core and the `XP`/`COINS` tables. **Chips**: `profile.chips {balance, refillDay}`, `CHIPS_FLOOR`,
`refillChips(profile, today)` tops up once a day below the floor, `buyIn`, `settle(delta)` from
`def.settlement`. Never purchasable, no coin↔chip conversion, no real-money UI; the existing
"coins never fall through play" test gets a chips twin asserting no path from coins to chips.
Online tables use fixed tier stacks; the client settles its own device-local bankroll (acceptable
with no accounts; documented).

**Storage** (`apps/mobile/src/storage.ts`): `history.v2` with `game: GameId` (v1 migrated once,
tagged `bela`, left in place); series keys gain a `bela:` prefix going forward; `profile.v1` stays
(merge-over-default) with `migrateQuests` + `refillChips` on load; `Settings.lastGame`,
`gameSettings`. Cases added to `apps/mobile/test/settings-migration.test.ts`.

**i18n**: keep `UiStrings`; add `GameStrings` per game in `src/games/<id>/{hr,sr-Cyrl,en}.ts`
(`satisfies` for completeness), `Lang.game(id)`, `Lang.card52`, `Lang.chips`, per-game
`RulesText` so `RulesScreen` takes a game. `questLabel(q)` replaces `questLabel(kind)`.

---

## 7. Tests

- Existing: Bela golden corpus and wire-schema snapshot stay green through every phase.
- `packages/table/test/shim.test.ts` differential (Phase 0 only).
- `game-core/harness/selfplay.ts`: random legal play with per-game invariant callbacks; nightly 100k
  like Bela. `harness/leak.ts`: for every state and seat count in [min, max], the serialised view
  contains no token of a `Secret` not visible to that seat; also run against the Bela adapter.
- Per-game golden (`packages/games/<id>/test/golden`) hashed via `game-core/canon.ts`.
- `game-core/test/session.test.ts`: bot loop stops on humans, `closeWindow` resolves every pending
  human, `decisionId` changes per decision, `setSeatHuman` mid-window.
- Bots: deterministic for a view; `apps/cli/src/arena.ts --game` shows medium beats easy.
- Server: `smoke-<game>.ts` with planted-leak self-test, plus free-seat walking pre-start; room tests
  for the clock on simultaneous windows, hold with N seats, rematch with eliminated players; run
  the six existing Bela smokes and `record-transcript.ts` before/after the extraction.
- Mobile: ring geometry for N seats, registry completeness (adapter + 3 locales + room name per
  `GameId`), history migration, casino grouping.
- CI shape unchanged; `scripts/typecheck.sh` still three projects; `golden-chromium.mjs` replays
  every game's golden.

---

## 8. Phases

| Phase | Scope | Effort |
|---|---|---|
| **0 Core + Bela adapter** (no visible change) | `game-core`, `games/bela`, `Table` shim + differential test, `GameRoom` extraction with identical Bela messages, protocol additions + snapshot refresh, `Director<E>`, `useLocalSession`/`useNetSession` with Bela wrappers, `Launch.game`, registry, tsconfig aliases | 3 wk |
| **1 Osmice offline** | engine + bots + golden + selfplay + leak; `cards` package; `GameShell`, `ringGeometry`, `OsmiceCard`, `OsmiceTable`; i18n ×3; `applyRoundOutcome`; history v2; game grid live | 3 wk |
| **2 Online + Baccarat + Blackjack** | `OsmiceRoom`, `useNetSession` end to end, `smoke-osmice`; Baccarat engine (shoe, tableau, simultaneous window), DecisionClock server + offline, `french52.tsx`, chips bankroll, betting UI kit, `BaccaratRoom`; Blackjack engine/table/room on the same pieces | 5–6 wk |
| **3 Texas Hold'em** | engine files, equity bots, `HoldemTable` (slider, pot odds, reveal), sit-out/buy-in, `HoldemRoom`, smoke | 6–8 wk |
| **4 Lobby, progression, rebrand** | grid design, per-game stats/history/quests/rules screens, shop items (French backs, chip sets), `UiStrings` split, new name: app id, `belastih.com/join` links + `deploy/site`, web shell, icons via `scripts/make-icons.mjs`, store listings, IARC re-questionnaire (simulated gambling), `PROTO` bump if a Bela client starts reading a new field | 3–4 wk |

Roughly 20–24 engineer-weeks for one engineer; Phase 1 and the server half of Phase 2 parallelise.

Order rationale: Osmice first exercises every new axis (variable seats, custom deck, N-seat shell,
generic hooks, i18n namespace, history v2) with the simplest rules and no rating exposure.
Baccarat is the smallest engine that validates the riskiest decision (simultaneous windows + chips)
and builds the whole betting kit; Blackjack then costs little. Hold'em, the headline, is the largest
engine and richest UI and lands once shell, chips, clock and room are stable.

---

## 9. Risks

- **Colyseus pin**: `GameRoom` uses only what `BelaRoom` already uses; `maxClients` set in
  `onCreate` from `seats` (supported in 0.16).
- **`TableScreen.tsx` (3886 lines)**: wrapped, not refactored; chrome divergence limited by sharing
  the same sub-components in `GameShell`.
- **Trademark**: own name/art/terms for Osmice; store text reviewed in Phase 4.
- **Rating**: accepted; chips free and isolated from coins; `meta.casino` groups the games and
  answers the questionnaire honestly.
- **Golden corpus during the Table swap**: event derivation moved verbatim (incl. the conditional
  `double` spread), `declarationSkipped` filtering stays in the room.
- **RNG**: Hold'em Monte-Carlo bots get their own rng stream so the shuffle stays unpredictable;
  server keeps passing a crypto rng.

## Verification (end to end)

1. After Phase 0: `npm test`, `npm run typecheck:all`, `npm run golden:chromium` all green with
   the snapshot diff additions-only; `npm run server` + `npm run smoke` and the five other smokes
   pass; `npm run transcript` before/after shows identical Bela wire traffic; `npm run play` and
   `npm run android` behave as today.
2. Each new game: its selfplay, leak and golden tests; `npm run arena -- --game <id>`;
   `npm run smoke:<id>` against a running server; play a full offline and online match on a device
   through the grid, confirm XP/chips/history update and the Bela table is untouched.
3. Phase 4: deep link with and without `?g=` opens the right table; store questionnaires re-run.

## Critical files

- `packages/table/src/index.ts` (→ shim), `packages/shared-types/src/index.ts` (read-only reference)
- `apps/server/src/BelaRoom.ts`, `apps/server/src/protocol.ts`, `apps/server/src/index.ts`
- `apps/mobile/src/useGame.ts`, `apps/mobile/src/net/useNetGame.ts`, `apps/mobile/App.tsx`,
  `apps/mobile/src/HomeScreen.tsx`, `apps/mobile/src/anim/director.ts`, `apps/mobile/src/deck/french.tsx`,
  `apps/mobile/src/storage.ts`
- `packages/progression/src/index.ts`, `packages/i18n/src/index.ts`
- Guard rails: `packages/engine/test/golden/run.ts`, `apps/mobile/test/wire-schema.test.ts`
