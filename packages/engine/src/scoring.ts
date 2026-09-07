import type {
  Card,
  DealProgress,
  EngineConfig,
  PlayContext,
  Seat,
  TeamId,
} from '@belot/shared-types';
import { CARD_POINTS_TOTAL, pointValue } from './power';
import type { DeclarationResolution } from './declarations';

/**
 * Deal scoring — encodes the rules a passionate player base 1-stars you for
 * getting wrong. The flow:
 *
 *   1. card points per team (sum to 152) + last-trick bonus (=> 162 trick total)
 *   2. valat (+90) to whoever actually swept all 8 tricks (may be the defenders)
 *   3. declarations: winner of the contest gets ALL its declarations, loser 0
 *   4. bela (trump K+Q) ALWAYS scores for its holder — even on a failed contract
 *   5. contract check: caller succeeds iff caller's total > opponents' total.
 *      An exact tie is a FAIL (pad) under the Balkan convention shipped here;
 *      config.contractTieSucceeds flips it to the French "at least as many"
 *      rule. Bela + declarations both count toward the total.
 *   6. on pad: defenders take the whole table (162 + all valat + all declarations
 *      + their own bela); callers keep only their bela (config.keepBelaOnFailedContract)
 *   7. kontra/rekontra multiplier applied last, scoped per config.kontraScope
 */

export interface DealTrick {
  winnerSeat: Seat;
  cards: Card[];
}

export interface DealScoreInput {
  ctx: PlayContext;
  tricks: DealTrick[]; // 8 tricks, in play order
  teamOf: (s: Seat) => TeamId;
  callerTeam: TeamId;
  multiplier: 1 | 2 | 4;
  declarations: DeclarationResolution;
  belaTeam: TeamId | null;
  config: EngineConfig;
}

export interface DealScoreResult {
  cardPoints: [number, number];
  /** card points + last-trick bonus (sums to 162). */
  trickPoints: [number, number];
  valatTeam: TeamId | null;
  valatBonus: [number, number];
  declarationPoints: [number, number];
  bela: [number, number];
  /** Each team's earned total at face value (pre-multiplier), used for the contract check. */
  rawTotal: [number, number];
  callerMade: boolean;
  /** Final points added to the match score for each team (multiplier applied). */
  finalScore: [number, number];
  /** Set when the deal ended by renons ("auzmeš"): the seat that misplayed. */
  renonsSeat?: Seat | null;
}

const BELA_VALUE = 20;

export function scoreDeal(input: DealScoreInput): DealScoreResult {
  const { ctx, tricks, teamOf, callerTeam, multiplier, declarations, belaTeam, config } = input;

  if (tricks.length !== 8) throw new Error(`expected 8 tricks, got ${tricks.length}`);

  // 1. card points + last trick
  const cardPoints: [number, number] = [0, 0];
  const tricksWon: [number, number] = [0, 0];
  for (const trick of tricks) {
    const t = teamOf(trick.winnerSeat);
    tricksWon[t] += 1;
    for (const c of trick.cards) cardPoints[t] += pointValue(c, ctx);
  }
  const lastTrickTeam = teamOf(tricks[7]!.winnerSeat);
  const trickPoints: [number, number] = [cardPoints[0], cardPoints[1]];
  trickPoints[lastTrickTeam] += config.lastTrickBonus;

  // 2. valat
  let valatTeam: TeamId | null = null;
  if (tricksWon[0] === 8) valatTeam = 0;
  else if (tricksWon[1] === 8) valatTeam = 1;
  const valatBonus: [number, number] = [0, 0];
  if (valatTeam !== null) valatBonus[valatTeam] = config.valatBonus;

  // 3. declarations
  const declarationPoints: [number, number] = [
    declarations.perTeamValue[0],
    declarations.perTeamValue[1],
  ];
  /**
   * "Zvanje se ne priznaje kartaškom paru ukoliko nisu pokupili barem jedan
   * štih" — a pair that takes no trick cannot BANK its own zvanja.
   *
   * It stops them keeping the points; it does not delete the points from the
   * deal. When the table changes hands wholesale — a pad, or a doubled contract
   * that sweeps — the full announced value still travels to the side that won,
   * because that side did take tricks. So this narrower figure is used only
   * where each side keeps what it declared.
   */
  const bankable: [number, number] = [
    tricksWon[0] > 0 ? declarationPoints[0] : 0,
    tricksWon[1] > 0 ? declarationPoints[1] : 0,
  ];

  // 4. bela (always scores for its holder)
  const bela: [number, number] = [0, 0];
  if (belaTeam !== null) bela[belaTeam] = BELA_VALUE;

  // 5. contract check (face value; the multiplier scales both sides equally so it
  // does not affect who wins). Strict tie => FAIL (pad).
  const rawTotal: [number, number] = [
    trickPoints[0] + valatBonus[0] + declarationPoints[0] + bela[0],
    trickPoints[1] + valatBonus[1] + declarationPoints[1] + bela[1],
  ];
  const other: TeamId = (1 - callerTeam) as TeamId;
  const callerMade = config.contractTieSucceeds
    ? rawTotal[callerTeam] >= rawTotal[other]
    : rawTotal[callerTeam] > rawTotal[other];

  // 6 + 7. build final scores from separable parts, then apply the multiplier
  // only to the trick part when kontraScope === 'trickPoints'.
  const trickPart: [number, number] = [0, 0]; // card + last trick + valat (multiplier target)
  const flatPart: [number, number] = [0, 0]; // declarations + bela (face value under 'trickPoints')

  if (callerMade && multiplier > 1 && config.kontraSuccessSweeps) {
    // Mirror of the pad: the winner of the doubled bet takes the whole table.
    trickPart[callerTeam] = trickPoints[0] + trickPoints[1] + valatBonus[0] + valatBonus[1];
    trickPart[other] = 0;
    flatPart[callerTeam] = declarationPoints[0] + declarationPoints[1] + bela[callerTeam];
    flatPart[other] = config.keepBelaOnFailedContract ? bela[other] : 0;
  } else if (callerMade) {
    trickPart[0] = trickPoints[0] + valatBonus[0];
    trickPart[1] = trickPoints[1] + valatBonus[1];
    flatPart[0] = bankable[0] + bela[0];
    flatPart[1] = bankable[1] + bela[1];
  } else {
    // pad: the failing caller falls; defenders take the whole table.
    trickPart[other] = trickPoints[0] + trickPoints[1] + valatBonus[0] + valatBonus[1];
    trickPart[callerTeam] = 0;
    flatPart[other] = declarationPoints[0] + declarationPoints[1] + bela[other];
    flatPart[callerTeam] = config.keepBelaOnFailedContract ? bela[callerTeam] : 0;
  }

  const scaleTrick = multiplier;
  const scaleFlat = config.kontraScope === 'all' ? multiplier : 1;
  const finalScore: [number, number] = [
    trickPart[0] * scaleTrick + flatPart[0] * scaleFlat,
    trickPart[1] * scaleTrick + flatPart[1] * scaleFlat,
  ];

  return {
    cardPoints,
    trickPoints,
    valatTeam,
    valatBonus,
    declarationPoints,
    bela,
    rawTotal,
    callerMade,
    finalScore,
  };
}

// ---------------------------------------------------------------------------
// Live deal progress — the running score players can see mid-deal
// ---------------------------------------------------------------------------

export interface DealProgressInput {
  ctx: PlayContext;
  /** Tricks completed so far, in play order (0..8). */
  tricks: DealTrick[];
  teamOf: (s: Seat) => TeamId;
  callerTeam: TeamId;
  multiplier: 1 | 2 | 4;
  /** Zvanja as they resolve on what has been announced SO FAR. */
  declarations: DeclarationResolution;
  belaTeam: TeamId | null;
  config: EngineConfig;
  /** True while trick 1 is open and some seat may still announce. */
  provisional: boolean;
  belaPending: boolean;
}

/**
 * The running score a player can legitimately keep in their head mid-deal —
 * and the one number no rival app shows: how many points the caller still
 * needs ("treba još N").
 *
 * Pinned to `scoreDeal` by test: with all 8 tricks in AND NO VALAT, `callerSafe`
 * must equal `scoreDeal().callerMade`. On a valat the two legitimately disagree,
 * because the +90 below is excluded here and included there. Three deliberate
 * exclusions:
 *   - VALAT is never folded in (a conditional +90 would make the counter jump
 *     ~45 the moment somebody takes a trick); `valatPossible` is exposed so the
 *     UI can caveat instead. `callerNeeds` is exact once it reads [false,false].
 *   - The LAST-TRICK bonus is in the pot from move one but is only credited to
 *     a team at trick 8 — it is known, just unassigned.
 *   - The kontra MULTIPLIER never moves the threshold: `scoreDeal` judges at
 *     face value because doubling scales both sides equally. It rides along
 *     purely so the UI can print "×2".
 */
export function computeDealProgress(input: DealProgressInput): DealProgress {
  const { ctx, tricks, teamOf, callerTeam, multiplier, declarations, belaTeam, config } = input;

  const cardPoints: [number, number] = [0, 0];
  const tricksWon: [number, number] = [0, 0];
  for (const trick of tricks) {
    const t = teamOf(trick.winnerSeat);
    tricksWon[t] += 1;
    for (const c of trick.cards) cardPoints[t] += pointValue(c, ctx);
  }

  const lastTrickTeam = tricks.length === 8 ? teamOf(tricks[7]!.winnerSeat) : null;

  // Face value, matching the rawTotal that scoreDeal judges the contract on. The
  // no-trick rule only limits what a side may BANK at payout, so it does not
  // belong in the running count.
  const declarationPoints: [number, number] = [
    declarations.perTeamValue[0],
    declarations.perTeamValue[1],
  ];
  const bela: [number, number] = [0, 0];
  if (belaTeam !== null) bela[belaTeam] = BELA_VALUE;

  const running: [number, number] = [0, 1].map((t) =>
    cardPoints[t]! +
    (lastTrickTeam === t ? config.lastTrickBonus : 0) +
    declarationPoints[t]! +
    bela[t]!,
  ) as [number, number];

  const pot =
    CARD_POINTS_TOTAL +
    config.lastTrickBonus +
    declarationPoints[0] +
    declarationPoints[1] +
    bela[0] +
    bela[1];
  const target = config.contractTieSucceeds ? Math.ceil(pot / 2) : Math.floor(pot / 2) + 1;

  // Everything still on the table: unplayed card points, plus the last trick
  // bonus while nobody has taken the 8th.
  const remaining =
    CARD_POINTS_TOTAL -
    cardPoints[0] -
    cardPoints[1] +
    (lastTrickTeam === null ? config.lastTrickBonus : 0);

  return {
    tricksPlayed: tricks.length,
    cardPoints,
    tricksWon,
    lastTrickTeam,
    lastTrickBonus: config.lastTrickBonus,
    declarationPoints,
    declarationTeam: declarations.winningTeam,
    bela,
    running,
    callerTeam,
    multiplier,
    pot,
    target,
    callerNeeds: Math.max(0, target - running[callerTeam]),
    callerSafe: running[callerTeam] >= target,
    callerDoomed: running[callerTeam] + remaining < target,
    valatPossible: [
      tricks.length < 8 && tricksWon[0] === tricks.length,
      tricks.length < 8 && tricksWon[1] === tricks.length,
    ],
    provisional: input.provisional,
    belaPending: input.belaPending,
  };
}
