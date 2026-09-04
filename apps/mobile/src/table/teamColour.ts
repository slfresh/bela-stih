import type { Seat, TeamId } from '@belot/engine';
import { teamOf } from '@belot/engine';
import { team } from '../theme';

/**
 * Which side of the table something belongs to, in colour.
 *
 * Lives here rather than in `theme.ts` so the palette stays a pure colour
 * module — `theme` is imported by the deck and the menus, none of which should
 * pull the engine in just to know who partners whom.
 */

export interface TeamTone {
  /** Solid, for text that must carry weight. */
  main: string;
  /** Faint fill, for a pill or a plate behind content. */
  dim: string;
  /** Border, the primary carrier — it reads on every felt colour. */
  edge: string;
  /** Light ink, for numbers on a dark ground. */
  ink: string;
}

const US: TeamTone = { main: team.us, dim: team.usDim, edge: team.usEdge, ink: team.usInk };
const THEM: TeamTone = { main: team.them, dim: team.themDim, edge: team.themEdge, ink: team.themInk };

/** The tone for a team, from the viewer's point of view. */
export function teamTone(t: TeamId, mySeat: Seat): TeamTone {
  return t === teamOf(mySeat) ? US : THEM;
}

/** The tone for whoever sits in `seat`, from the viewer's point of view. */
export function seatTone(seat: Seat, mySeat: Seat): TeamTone {
  return teamTone(teamOf(seat), mySeat);
}

/** True when `seat` is the viewer's partner — the one who also gets a marker. */
export function isPartner(seat: Seat, mySeat: Seat): boolean {
  return seat !== mySeat && teamOf(seat) === teamOf(mySeat);
}
