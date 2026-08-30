import type { Card, EngineConfig, PlayContext, Seat, TeamId } from '@belot/shared-types';
import { pointValue } from './power';
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
    flatPart[0] = declarationPoints[0] + bela[0];
    flatPart[1] = declarationPoints[1] + bela[1];
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
