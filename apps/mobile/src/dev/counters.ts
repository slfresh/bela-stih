/**
 * Plain integers bumped from the hot paths, so a dev overlay can say what one
 * director tick actually costs: how many card faces re-rendered, how many
 * anchors re-measured, how many sprites mounted.
 *
 * Free in release. Nothing reads them there, and an integer increment is the
 * cheapest statement in any of the files that carry one.
 */
export const counters = {
  /** `CardFace` bodies rendered (memo hits do not count — that is the point). */
  cardFace: 0,
  /** `measureInWindow` calls issued by anchors. */
  measure: 0,
  spriteMount: 0,
  spriteUnmount: 0,
  /** Director commits observed. */
  ticks: 0,
};

export interface TickCost {
  cardFace: number;
  measure: number;
  sprites: number;
}

let atLastTick = { cardFace: 0, measure: 0, spriteMount: 0 };
let lastTick: TickCost = { cardFace: 0, measure: 0, sprites: 0 };

/** Call once per director commit; the delta since the previous call is that tick's cost. */
export function markTick(): void {
  counters.ticks++;
  lastTick = {
    cardFace: counters.cardFace - atLastTick.cardFace,
    measure: counters.measure - atLastTick.measure,
    sprites: counters.spriteMount - atLastTick.spriteMount,
  };
  atLastTick = {
    cardFace: counters.cardFace,
    measure: counters.measure,
    spriteMount: counters.spriteMount,
  };
}

export function lastTickCost(): TickCost {
  return lastTick;
}

// Reachable from a browser harness (window.__belaCounters) on any build, so a
// production web export can be measured from the outside without the overlay.
(globalThis as { __belaCounters?: unknown }).__belaCounters = { counters, lastTickCost };
