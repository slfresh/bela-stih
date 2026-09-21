import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCKED_NAME_PARTS, cleanName, foldName, isBlockedName } from '../../server/src/names';

const here = dirname(fileURLToPath(import.meta.url));

describe("the server's nickname filter", () => {
  it('still strips what cannot be seen, and caps the length', () => {
    expect(cleanName('  Ana​ ‮Marija\t\n ')).toBe('Ana Marija');
    expect(cleanName('x'.repeat(40))).toHaveLength(20);
    expect(cleanName(42)).toBe('');
  });

  it('refuses a name holding a listed word, however it is dressed up', () => {
    const list = ['budala', 'будала'];
    // Dressed up with case, spacing, punctuation, digits, the '@' that stands
    // for an a, a doubled letter, and one letter borrowed from the other script.
    for (const name of ['Budala', 'BUDALA 7', 'b.u.d.a.l.a', 'bud4la', 'Ja sam budala', 'Будала',
      'bud@la', 'BuD@l@', 'buddala', 'budalа', 'Будалa']) {
      expect(isBlockedName(name, list), name).toBe(true);
      expect(cleanName(name, list), name).toBe('');
    }
  });

  it('lets innocent names through, and an empty list blocks nothing', () => {
    const list = ['budala'];
    for (const name of ['Ana', 'Marko 1987', 'Đuro', 'Igrač 3', 'Ђорђе']) expect(isBlockedName(name, list), name).toBe(false);
    expect(isBlockedName('budala', [])).toBe(false);
    expect(isBlockedName('anything', ['', '   ', '.'])).toBe(false);
  });

  it('folds accents and stand-ins, and reads Cyrillic lookalikes as Latin', () => {
    expect(foldName('Đuro Šćekić')).toBe('djurosceki' + 'c');
    // A doubled letter counts once, so 'ss' folds to one s.
    expect(foldName('P4$$w0rd!')).toBe('paswordi');
    // The Cyrillic letters that pass for Latin ones are read as Latin.
    expect(foldName('Ђорђе')).toBe('ђopђe');
    expect(foldName('budalа')).toBe(foldName('budala'));
  });

  it('is the one the room uses, and ships an explicit list', () => {
    const room = readFileSync(join(here, '../../server/src/BelaRoom.ts'), 'utf8');
    expect(room).toMatch(/import \{ cleanName \} from '\.\/names';/);
    expect(room).not.toMatch(/function cleanName/);
    expect(Array.isArray(BLOCKED_NAME_PARTS)).toBe(true);
  });
});
