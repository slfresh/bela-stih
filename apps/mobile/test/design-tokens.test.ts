import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The visual system is a set of tokens in src/theme.ts. This test keeps the
 * screens on it: a colour typed inline is a colour the next cosmetic cannot
 * recolour, a 10 px label is one nobody over forty can read, and a dingbat
 * renders as a different glyph on every phone.
 *
 * The literal counts are a RATCHET, not a ban: these files carry the
 * literals they had when the tokens were introduced, and the number may only
 * go down. Lower a file's number here when you move its literals onto tokens.
 */

const SRC = join(__dirname, '../src');

/** Files whose colours are data, not styling: the deck's own palette and art, the room cosmetics. */
const PALETTE_FILES = new Set(['theme.ts', 'cosmetics.ts', 'avatars.tsx', 'emotes.ts']);

/** rgba(...) and '#hex' literals still allowed per file (path relative to src, forward slashes). */
const LITERAL_BASELINE: Record<string, number> = {
  'HomeScreen.tsx': 0,
  'PlayingCard.tsx': 2,
  'TableScreen.tsx': 10,
  'anim/EffectsOverlay.tsx': 1,
  'net/OnlineGame.tsx': 1,
  'screens/ProfileScreen.tsx': 1,
  'screens/SettingsScreen.tsx': 2,
  'screens/ShopScreen.tsx': 1,
  'table/EmoteStrip.tsx': 2,
  'table/RevealRow.tsx': 1,
  'table/SeatPuck.tsx': 2,
};

/** Glyphs that must be drawn (src/ui/icons.tsx), never typed. */
const TYPED_GLYPHS = ['●', '○', '⚙', '✓', '‹', '›', '★', '◆', '⏱', '✕'];
/** Where a typed glyph is still tolerated, and which — each one a known debt. */
const GLYPH_ALLOW: Record<string, string[]> = {
  // The partner marker beside the top seat's name.
  'TableScreen.tsx': ['◆'],
  // The partner marker on a puck: colour is never the only carrier of "us".
  'table/SeatPuck.tsx': ['◆'],
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'deck' || name === 'dev') continue;
      out.push(...sources(p));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = sources(SRC).map((p) => ({
  rel: relative(SRC, p).replace(/\\/g, '/'),
  text: readFileSync(p, 'utf8'),
}));

describe('the design tokens', () => {
  it('own every colour: no file grows new rgba()/#hex literals', () => {
    for (const f of files) {
      if (PALETTE_FILES.has(f.rel)) continue;
      const rgba = (f.text.match(/rgba?\([^)]*\)/g) ?? []).length;
      const hex = (f.text.match(/'#[0-9a-fA-F]{3,8}'/g) ?? []).length;
      const n = rgba + hex;
      const allowed = LITERAL_BASELINE[f.rel] ?? 0;
      expect(n, `${f.rel}: ${n} colour literals, baseline ${allowed} — use theme/surface/stroke/ink`).toBeLessThanOrEqual(
        allowed,
      );
    }
  });

  it('set no text below the caption size', () => {
    for (const f of files) {
      for (const m of f.text.matchAll(/fontSize:\s*(\d+)/g)) {
        expect(Number(m[1]), `${f.rel}: fontSize ${m[1]}`).toBeGreaterThanOrEqual(11);
      }
    }
  });

  it('draw their glyphs instead of typing dingbats', () => {
    for (const f of files) {
      if (PALETTE_FILES.has(f.rel)) continue;
      const allowed = GLYPH_ALLOW[f.rel] ?? [];
      for (const g of TYPED_GLYPHS) {
        if (allowed.includes(g)) continue;
        expect(f.text.includes(g), `${f.rel} types "${g}" — draw it in ui/icons.tsx`).toBe(false);
      }
    }
  });

  it('keep emoji to the emote table', () => {
    // Emoji render in the phone's colour font next to illustrated avatars;
    // only the emotes (until they are drawn too) may use them.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    // Known debts, each removed with the milestone that redraws it.
    const allow: Record<string, string[]> = {
      // The emote-strip toggle (M5.9 draws the emotes).
      'TableScreen.tsx': ['😄'],
    };
    for (const f of files) {
      if (PALETTE_FILES.has(f.rel)) continue;
      let text = f.text;
      for (const a of allow[f.rel] ?? []) text = text.split(a).join('');
      expect(emoji.test(text), `${f.rel} contains an emoji`).toBe(false);
    }
  });

  it('keep the home a lobby: the table, two tiles, one daily panel, no form field but the code', () => {
    const home = files.find((f) => f.rel === 'HomeScreen.tsx')!.text;
    expect(home).toMatch(/<TableHero/);
    expect(home).toMatch(/<Wordmark/);
    expect((home.match(/<ModeTile/g) ?? []).length).toBe(2);
    expect((home.match(/<TextInput/g) ?? []).length).toBe(1); // the table code; the nickname moved to Settings
    expect(home).toMatch(/<Anchor id="bonus">/);
    expect(home).toMatch(/<Anchor id=\{`quest:\$\{i\}`\}>/);
    expect(files.find((f) => f.rel === 'screens/SettingsScreen.tsx')!.text).toMatch(/settings\.nickname/);
  });

  it('are what the screens import: the one panel, the drawn icons', () => {
    const home = files.find((f) => f.rel === 'HomeScreen.tsx')!.text;
    expect(home).toMatch(/from '\.\/ui\/Panel'/);
    expect(home).not.toMatch(/styles\.panel\b/);
    const common = files.find((f) => f.rel === 'screens/common.tsx')!.text;
    expect(common).toMatch(/export \{ Panel \} from '\.\.\/ui\/Panel'/);
  });
});
