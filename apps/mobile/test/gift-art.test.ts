import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { GIFT_IDS } from '@belot/progression';
import { garb } from '../src/deck/palette';
import { GIFT_ART_IDS, hasGiftArt } from '../src/giftIds';

/**
 * The table-gift drawings. giftArt.tsx imports react-native-svg, which node
 * cannot load, so the drawings are checked as source: every catalogue gift
 * has one, and every one is drawn in the house style — garb colours only, and
 * no line under the 3 units that still show on a 22 dp badge.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, '../src', rel), 'utf8');
const text = read('giftArt.tsx');
const source = ts.createSourceFile('giftArt.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** The cream disc, exactly as EmoteFace draws it. */
const DISC = '<Circle cx="50" cy="50" r="48" fill={garb.cream} stroke={garb.skinLine} strokeWidth="2" />';

function nodes(root: ts.Node): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    out.push(n);
    n.forEachChild(visit);
  };
  visit(root);
  return out;
}

/** The object literal of `const ART = { ... }`. */
function art(): ts.ObjectLiteralExpression {
  for (const n of nodes(source)) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'ART') {
      if (n.initializer && ts.isObjectLiteralExpression(n.initializer)) return n.initializer;
    }
  }
  throw new Error('giftArt.tsx has no `const ART = { ... }`');
}

/** The GiftArt component — home of the disc, whose rim is the one 2-unit line. */
function giftArt(): ts.FunctionDeclaration {
  for (const n of nodes(source)) {
    if (ts.isFunctionDeclaration(n) && n.name?.text === 'GiftArt') return n;
  }
  throw new Error('giftArt.tsx has no `function GiftArt`');
}

function attrs(root: ts.Node, name: string): ts.JsxAttribute[] {
  return nodes(root).filter(
    (n): n is ts.JsxAttribute => ts.isJsxAttribute(n) && ts.isIdentifier(n.name) && n.name.text === name,
  );
}

const where = (n: ts.Node) => `giftArt.tsx:${source.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.getText()}`;
const within = (n: ts.Node, outer: ts.Node) => n.getStart() >= outer.getStart() && n.getEnd() <= outer.getEnd();

describe('the gift drawings', () => {
  it('cover the catalogue exactly', () => {
    expect(GIFT_ART_IDS).toEqual(GIFT_IDS);
    for (const id of GIFT_IDS) expect(hasGiftArt(id), id).toBe(true);
    for (const id of ['zlato', 'smile', '', 'KAVA']) expect(hasGiftArt(id), id).toBe(false);
  });

  it('draw every gift, in the catalogue order, and nothing else', () => {
    const keys = art().properties.map((p) => {
      if (!ts.isPropertyAssignment(p)) throw new Error(`ART entry is not a plain property: ${where(p)}`);
      return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText();
    });
    expect(keys).toEqual([...GIFT_IDS]);
  });

  it('colour only from garb: every fill and stroke is garb.X or "none"', () => {
    const found = [...attrs(source, 'fill'), ...attrs(source, 'stroke')];
    expect(found.length).toBeGreaterThan(40);
    for (const a of found) {
      const v = a.initializer;
      const ok =
        (v !== undefined && ts.isStringLiteral(v) && v.text === 'none') ||
        (v !== undefined &&
          ts.isJsxExpression(v) &&
          v.expression !== undefined &&
          ts.isPropertyAccessExpression(v.expression) &&
          ts.isIdentifier(v.expression.expression) &&
          v.expression.expression.text === 'garb' &&
          Object.prototype.hasOwnProperty.call(garb, v.expression.name.text));
      expect(ok, where(a)).toBe(true);
    }
  });

  it('draw no line thinner than 3 units, but for the disc rim', () => {
    const fn = giftArt();
    const found = attrs(source, 'strokeWidth').filter((a) => !within(a, fn));
    // The drawings themselves must be among what is checked, not only the helpers.
    expect(attrs(art(), 'strokeWidth').length).toBeGreaterThan(40);
    for (const a of found) {
      const v = a.initializer;
      let w = Number.NaN;
      if (v && ts.isStringLiteral(v)) w = Number(v.text);
      else if (v && ts.isJsxExpression(v) && v.expression && ts.isNumericLiteral(v.expression)) w = Number(v.expression.text);
      expect(w, where(a)).toBeGreaterThanOrEqual(3);
    }
    // ...and the disc is the emotes' own, down to its 2-unit rim.
    expect(fn.getText()).toContain(DISC);
    expect(read('emoteArt.tsx')).toContain(DISC);
  });

  it('type no colour literal and no text', () => {
    expect(text).not.toMatch(/rgba?\(/);
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(text).not.toMatch(/<(Text|TSpan)\b/);
  });
});
