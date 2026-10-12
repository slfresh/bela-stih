import type { Action, PublicView } from '@belot/shared-types';
import { detectDeclarations } from '@belot/engine';
import { decideEasy } from './easy';
import { decideHard, type BotMemory } from './hard';
import { decideBid, decidePlay, preferBela, type PlayCardAction } from './medium';

/**
 * Bots, expressed as ONE pure decision function over a (hidden-hand-safe)
 * PublicView. The same function drives:
 *   - the offline single-player opponents (and the player's partner), and
 *   - the online disconnect-fill / turn-timeout auto-play on the server.
 *
 * Three tiers behind the same signature:
 *   - easy (easy.ts): a beginner - calls only on a clearly good hand, leads
 *     its fattest card, takes a trick with its biggest;
 *   - medium (medium.ts): the rule-based baseline the arena measures from;
 *   - hard (hard.ts): medium's rules plus a memory of the deal, handed in as
 *     `BotMemory` by whoever owns the game state (the table).
 */

export type BotLevel = 'easy' | 'medium' | 'hard';
export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard'];

export function isBotLevel(x: unknown): x is BotLevel {
  return x === 'easy' || x === 'medium' || x === 'hard';
}

export type { BotMemory } from './hard';

export function decideAction(
  view: PublicView,
  rng: () => number,
  level: BotLevel = 'medium',
  /** The deal so far (public: every card in it was seen by all four); the hard bot plays to it. */
  memory?: BotMemory,
): Action {
  const actions = view.legalActions;
  if (actions.length === 0) throw new Error('bot asked to act with no legal actions');
  if (actions.length === 1) return actions[0]!;

  // Answering "ima zvanja?" comes before the difficulty split: a bot never
  // overlooks its zvanja at any level. Staying silent only pays if you can
  // exploit the information you withheld, which a rule-based opponent cannot,
  // and announcing is the only way the points can ever score.
  //
  // The bot MARKS, like everyone else. It works the combination out from its own
  // hand rather than being handed it — which is what hard mode asks of a human,
  // and the only way the engine's marking check can apply to a bot at all.
  const claim = actions.find((a) => a.type === 'DECLARE_ANNOUNCE');
  if (claim) {
    const spotted = detectDeclarations(view.hand, view.seat);
    if (spotted.length === 0) {
      // Nothing there after all — in blind mode the offer is made to every seat
      // precisely so that answering does not reveal whether you hold anything.
      return actions.find((a) => a.type === 'DECLARE_SKIP') ?? claim;
    }
    // Mark the best one; the engine credits the whole holding off a valid mark.
    const best = spotted.reduce((a, b) => (b.value > a.value ? b : a));
    return { type: 'DECLARE_ANNOUNCE', seat: view.seat, cards: best.cards };
  }

  if (level === 'easy') return decideEasy(view, actions);
  if (level === 'hard') return decideHard(view, actions, memory, rng);

  const head = actions[0]!.type;
  if (head === 'BID_PASS' || head === 'BID_CALL') return decideBid(view, actions);
  if (head === 'DOUBLE_KONTRA' || head === 'DOUBLE_REKONTRA' || head === 'DOUBLE_PASS') {
    // conservative: never double in v1
    return actions.find((a) => a.type === 'DOUBLE_PASS') ?? actions[0]!;
  }
  if (head === 'DECLARE_SKIP') return actions[0]!; // nothing to declare
  return decidePlay(
    view,
    preferBela(actions.filter((a): a is PlayCardAction => a.type === 'PLAY_CARD')),
  );
}

// `rng` is kept on the signature for callers and for a tier that may want it;
// every shipped tier is deterministic for a given view (bots.test.ts).
