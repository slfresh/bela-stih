import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { dataCapacity, encodeQr, formatBits, qrPath, utf8, versionFor, type EccLevel } from '../src/net/qr';

const LEVELS: EccLevel[] = ['L', 'M', 'Q', 'H'];
const bitsOf = (rows: boolean[][]) => rows.map((r) => r.map((m) => (m ? '1' : '0')).join('')).join('\n');

describe('the invite QR code', () => {
  it('holds exactly the standard capacities (ISO/IEC 18004, table 7, byte mode)', () => {
    // Bytes a version holds at each level, versions 1-6.
    const bytes: Record<EccLevel, number[]> = {
      L: [17, 32, 53, 78, 106, 134],
      M: [14, 26, 42, 62, 84, 106],
      Q: [11, 20, 32, 46, 60, 74],
      H: [7, 14, 24, 34, 44, 58],
    };
    for (const ecc of LEVELS) {
      for (let v = 1; v <= 6; v++) {
        expect(Math.floor((dataCapacity(v, ecc) * 8 - 12) / 8), `v${v}${ecc}`).toBe(bytes[ecc][v - 1]);
        expect(versionFor(bytes[ecc][v - 1]!, ecc)).toBe(v);
      }
    }
    expect(versionFor(107, 'M')).toBeNull();
    expect(encodeQr('x'.repeat(107))).toBeNull();
  });

  it('carries the level and mask in format bits a reader can check', () => {
    // Known values from the standard's annex C: M with mask 0, and L with mask 4.
    expect(formatBits('M', 0)).toBe(0b101010000010010);
    expect(formatBits('L', 4)).toBe(0b110011000101111);
    for (const ecc of LEVELS) {
      for (let mask = 0; mask < 8; mask++) {
        const q = encodeQr('https://belastih.com/join/K7M2Q', ecc, mask)!;
        // The copy along the bottom-left column reads the same bits back.
        let bits = 0;
        for (let i = 8; i < 15; i++) bits |= (q.modules[q.size - 15 + i]![8] ? 1 : 0) << i;
        for (let i = 0; i < 8; i++) bits |= (q.modules[8]![q.size - 1 - i] ? 1 : 0) << i;
        expect(bits).toBe(formatBits(ecc, mask));
      }
    }
  });

  it('draws the three finders, the timing lines and the dark module', () => {
    const q = encodeQr('https://belastih.com/join/K7M2Q')!;
    expect(q.version).toBe(3);
    expect(q.size).toBe(29);
    const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
    const at = (x0: number, y0: number) =>
      finder.every((row, dy) => [...row].every((c, dx) => q.modules[y0 + dy]![x0 + dx] === (c === '1')));
    expect(at(0, 0) && at(q.size - 7, 0) && at(0, q.size - 7)).toBe(true);
    for (let i = 8; i < q.size - 8; i++) {
      expect(q.modules[6]![i]).toBe(i % 2 === 0);
      expect(q.modules[i]![6]).toBe(i % 2 === 0);
    }
    expect(q.modules[q.size - 8]![8]).toBe(true);
  });

  it('is the code an independent reader decoded (OpenCV, every version, level and mask)', () => {
    // These three were rendered and decoded back to their text; a change to
    // the encoder that alters them must be checked the same way again.
    const fp = (t: string) => {
      const q = encodeQr(t)!;
      return [q.version, q.ecc, q.mask, createHash('sha256').update(bitsOf(q.modules)).digest('hex').slice(0, 16)];
    };
    expect(fp('https://belastih.com/join/K7M2Q')).toEqual([3, 'M', 2, 'e6aa8e392485293f']);
    expect(fp('https://belastih.com/join/ABCDE')).toEqual([3, 'M', 0, 'edf60c94ecf2f4f7']);
    expect(fp('x')).toEqual([1, 'M', 4, '1968f60e71355997']);
  });

  it('draws one run per stretch of dark modules, inside the quiet zone', () => {
    const q = encodeQr('x')!;
    const d = qrPath(q);
    // The top-left finder's first row is a single run of seven, four modules in.
    expect(d.startsWith('M4 4h7v1h-7z')).toBe(true);
    const cells = [...d.matchAll(/h(\d+)v1/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(cells).toBe(q.modules.flat().filter(Boolean).length);
  });

  it('encodes text as UTF-8', () => {
    expect(utf8('Šč')).toEqual([0xc5, 0xa0, 0xc4, 0x8d]);
    expect(utf8('a€')).toEqual([0x61, 0xe2, 0x82, 0xac]);
  });
});
