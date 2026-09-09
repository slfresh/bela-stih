import { describe, expect, it } from 'vitest';
import { EMOTE_FACES, hasEmoteFace } from '../src/emoteIds';
import { EMOTES } from '../src/emotes';

describe('the drawn emotes', () => {
  it('cover exactly the glyph emotes, and no phrase', () => {
    const glyphs = EMOTES.filter((e) => e.glyph).map((e) => e.id);
    expect(new Set(EMOTE_FACES)).toEqual(new Set(glyphs));
    for (const e of EMOTES) expect(hasEmoteFace(e.id)).toBe(e.glyph !== undefined);
  });
});
