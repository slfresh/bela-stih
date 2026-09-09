import { useEffect, useRef } from 'react';
import { buzz, doubleBuzz } from '../haptics';
import { playSfx } from '../audio';

/**
 * The three cues a player at a real table gets for free and an app has to
 * supply: it is your turn, you have something to call, and your time is
 * nearly up.
 *
 * Edge-triggered, never level-triggered — and it needs no debounce, because
 * `patch.ts:suppress()` forces `toAct`, `mustDeclare` and `canDeclare` false on
 * every intermediate view. During an animation drain all three inputs are
 * structurally false, so an edge can only fire on the director's terminal sync.
 * (If that guarantee is ever "optimised" away, this hook starts buzzing on
 * every frame of a deal — the director test asserts it.)
 *
 * The clock warnings are armed from the ABSOLUTE deadline rather than read off
 * the countdown ring: the ring animates on the UI thread with no JS callback,
 * and its effect re-arms on every room message. Deriving from the deadline is
 * self-correcting after a background/resume, and a threshold already passed is
 * simply dropped — a phone in a pocket must not buzz for a turn that has
 * already timed out.
 */

const WARN_AT_MS = [5_000, 2_000];

export interface TurnCues {
  myTurn: boolean;
  mustDeclare: boolean;
  canDeclare: boolean;
  /** Absolute epoch ms, or null offline where nothing auto-plays. */
  deadline: number | null;
  /** True once the deal is over: the table is settling, stay quiet. */
  settled: boolean;
  /** The cue's visible twin, fired from the very same edge as the sound. */
  onTurnEdge?: () => void;
  onDeclareEdge?: () => void;
}

export interface CueState {
  myTurn: boolean;
  declaring: boolean;
}
export type CueEdge = 'declare' | 'turn' | null;

/**
 * Which cue this commit fires, given the last one. Pure, so the one property
 * the whole hook rests on — a drain of suppressed views yields exactly one
 * edge, at the terminal sync — can be checked without a renderer. Both edges
 * usually land in the same commit; the call is the more specific message, so
 * it wins and the turn cue stays silent. A settled table stays quiet.
 */
export function cueEdge(was: CueState, now: CueState, settled: boolean): CueEdge {
  if (settled) return null;
  if (now.declaring && !was.declaring) return 'declare';
  if (now.myTurn && !was.myTurn) return 'turn';
  return null;
}

export function useTurnCues({
  myTurn,
  mustDeclare,
  canDeclare,
  deadline,
  settled,
  onTurnEdge,
  onDeclareEdge,
}: TurnCues): void {
  const was = useRef<CueState>({ myTurn: false, declaring: false });
  // Fresh callbacks each render; the effect must not re-run for them.
  const onTurnEdgeRef = useRef(onTurnEdge);
  onTurnEdgeRef.current = onTurnEdge;
  const onDeclareEdgeRef = useRef(onDeclareEdge);
  onDeclareEdgeRef.current = onDeclareEdge;

  useEffect(() => {
    const now = { myTurn, declaring: mustDeclare || canDeclare };
    const edge = cueEdge(was.current, now, settled);
    was.current = now;

    if (edge === 'declare') {
      doubleBuzz('medium');
      playSfx('zvanje');
      onDeclareEdgeRef.current?.();
    } else if (edge === 'turn') {
      buzz('select');
      playSfx('turn');
      onTurnEdgeRef.current?.();
    }
  }, [myTurn, mustDeclare, canDeclare, settled]);

  useEffect(() => {
    // Offline there is no clock and nothing auto-plays, so a warning would be
    // a lie. Opponents' clocks are none of my phone's business either.
    if (!myTurn || deadline === null || settled) return;
    const timers = WARN_AT_MS.map((before) => {
      const wait = deadline - Date.now() - before;
      if (wait <= 0) return null;
      return setTimeout(() => {
        buzz('heavy');
        // The same woodblock, a shade higher as the clock gets shorter.
        playSfx('tick', { rate: before <= 2_000 ? 1.25 : 1 });
      }, wait);
    }).filter((t): t is ReturnType<typeof setTimeout> => t !== null);
    return () => timers.forEach(clearTimeout);
  }, [myTurn, deadline, settled]);
}
