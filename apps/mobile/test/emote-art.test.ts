import { describe, expect, it } from 'vitest';
import { EMOTE_FACES, hasEmoteFace } from '../src/emoteIds';
import { EMOTES } from '../src/emotes';
import { Lang, LOCALE_IDS } from '@belot/i18n';

describe('the drawn emotes', () => {
  it('cover exactly the glyph emotes, and no phrase', () => {
    const glyphs = EMOTES.filter((e) => e.glyph).map((e) => e.id);
    expect(new Set(EMOTE_FACES)).toEqual(new Set(glyphs));
    for (const e of EMOTES) expect(hasEmoteFace(e.id)).toBe(e.glyph !== undefined);
  });
});

describe('every drawn emote has a spoken name', () => {
  it('in every locale, a screen reader says what the face shows, never its id', () => {
    for (const locale of LOCALE_IDS) {
      const ui = new Lang(locale).s.ui;
      for (const e of EMOTES.filter((x) => x.glyph)) expect(ui.emoteName(e.id), `${locale} ${e.id}`).not.toBe(e.id);
    }
  });
});
