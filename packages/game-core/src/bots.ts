/**
 * Bot strength, one scale for every game. The literals are the ones
 * `@belot/bots` has always exported, so the two types are interchangeable.
 */
export type BotLevel = 'easy' | 'medium' | 'hard';

export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard'];

export function isBotLevel(x: unknown): x is BotLevel {
  return x === 'easy' || x === 'medium' || x === 'hard';
}
