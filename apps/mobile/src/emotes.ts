import type { Lang } from '@belot/i18n';

/**
 * The quick-emote vocabulary: six faces and seven table phrases. A fixed set —
 * there is deliberately no free text, so nothing a player sends can ever need
 * moderation. Keep the id list in step with `apps/server/src/protocol.ts`,
 * which is what the server actually accepts.
 */
export const EMOTES: ReadonlyArray<{ id: string; glyph?: string }> = [
  { id: 'smile', glyph: '😄' },
  { id: 'laugh', glyph: '😂' },
  { id: 'wow', glyph: '😮' },
  { id: 'cry', glyph: '😢' },
  { id: 'clap', glyph: '👏' },
  { id: 'think', glyph: '🤔' },
  { id: 'bravo' },
  { id: 'brze' },
  { id: 'ajme' },
  { id: 'hvala' },
  { id: 'dobro' },
  { id: 'ups' },
  { id: 'idemo' },
];

export const EMOTE_IDS: readonly string[] = EMOTES.map((e) => e.id);

/** What an emote id shows on screen: the glyph itself, or a localized phrase. */
export function emoteText(lang: Lang, id: string): string {
  const e = EMOTES.find((x) => x.id === id);
  if (!e) return '';
  return e.glyph ?? lang.s.ui.emotePhrase(id);
}

/** True for the emoji emotes, which render bigger than a phrase bubble. */
export function isGlyphEmote(id: string): boolean {
  return EMOTES.some((e) => e.id === id && e.glyph !== undefined);
}

/** What an offline bot might throw across the table after winning a trick. */
export const BOT_EMOTES: readonly string[] = ['smile', 'laugh', 'clap', 'wow', 'bravo'];
