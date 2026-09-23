/**
 * A QR code for the table's invite link, so friends sitting together scan it
 * instead of typing a code.
 *
 * A small encoder of our own rather than a dependency: byte mode only,
 * versions 1-6 (a link of up to 106 bytes at level M; ours is about 31), all
 * four error-correction levels and all eight masks. It follows ISO/IEC 18004
 * and the structure of Project Nayuki's reference implementation (MIT). The
 * tests decode real renders with an independent decoder (OpenCV) across every
 * version, level and mask; the unit tests pin the structure.
 */

export type EccLevel = 'L' | 'M' | 'Q' | 'H';

/** The format-information bits of each level (ISO/IEC 18004, table 12). */
const FORMAT_BITS: Record<EccLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Per version (index 1-6): error-correction codewords per block, and blocks. */
const ECC_PER_BLOCK: Record<EccLevel, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18],
  M: [-1, 10, 16, 26, 18, 24, 16],
  Q: [-1, 13, 22, 18, 26, 18, 24],
  H: [-1, 17, 28, 22, 16, 22, 28],
};
const BLOCKS: Record<EccLevel, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2],
  M: [-1, 1, 1, 1, 2, 2, 4],
  Q: [-1, 1, 1, 2, 2, 4, 4],
  H: [-1, 1, 1, 2, 4, 4, 4],
};

export const MAX_VERSION = 6;

export interface Qr {
  version: number;
  size: number;
  ecc: EccLevel;
  mask: number;
  /** modules[y][x]: true is dark. */
  modules: boolean[][];
}

/** Data modules in a version's symbol, after every function pattern. */
function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    result -= (25 * align - 10) * align - 55;
  }
  return result;
}

/** Data codewords (bytes) a version holds at a level. */
export function dataCapacity(ver: number, ecc: EccLevel): number {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver]! * BLOCKS[ecc][ver]!;
}

// ---- Reed-Solomon over GF(2^8), primitive polynomial 0x11D ----

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i]! ^= gfMul(coef, factor);
    });
  }
  return result;
}

/** The data codewords with their error correction, split into blocks and interleaved. */
function withEcc(data: readonly number[], ver: number, ecc: EccLevel): number[] {
  const numBlocks = BLOCKS[ecc][ver]!;
  const eccLen = ECC_PER_BLOCK[ecc][ver]!;
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ec = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ec));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      // The short blocks' placeholder byte is not transmitted.
      if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]!);
    });
  }
  return result;
}

/** UTF-8 bytes of a string. */
export function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** The byte-mode segment, terminated and padded to a version's capacity. */
function dataCodewords(bytes: readonly number[], ver: number, ecc: EccLevel): number[] {
  const bits: number[] = [];
  const put = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4); // byte mode
  put(bytes.length, 8); // the count is 8 bits wide up to version 9
  for (const b of bytes) put(b, 8);
  const capacity = dataCapacity(ver, ecc) * 8;
  put(0, Math.min(4, capacity - bits.length)); // terminator
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]!;
    out.push(b);
  }
  return out;
}

/** The smallest version that holds `n` bytes at a level, or null past MAX_VERSION. */
export function versionFor(n: number, ecc: EccLevel): number | null {
  for (let v = 1; v <= MAX_VERSION; v++) if (4 + 8 + 8 * n <= dataCapacity(v, ecc) * 8) return v;
  return null;
}

class Grid {
  readonly modules: boolean[][];
  readonly fixed: boolean[][];
  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  set(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.fixed[y]![x] = true;
  }
}

function drawFinder(g: Grid, x: number, y: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && xx < g.size && yy >= 0 && yy < g.size) g.set(xx, yy, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(g: Grid, x: number, y: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) g.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
}

/** The 15 format bits: level and mask, BCH-protected and XOR-masked. */
export function formatBits(ecc: EccLevel, mask: number): number {
  const data = (FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(g: Grid, ecc: EccLevel, mask: number): void {
  const bits = formatBits(ecc, mask);
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;
  const n = g.size;
  // Around the top-left finder.
  for (let i = 0; i <= 5; i++) g.set(8, i, bit(i));
  g.set(8, 7, bit(6));
  g.set(8, 8, bit(7));
  g.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) g.set(14 - i, 8, bit(i));
  // The copy beside the other two.
  for (let i = 0; i < 8; i++) g.set(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) g.set(8, n - 15 + i, bit(i));
  g.set(8, n - 8, true); // the dark module
}

function drawFunctionPatterns(g: Grid, ver: number): void {
  const n = g.size;
  for (let i = 0; i < n; i++) {
    g.set(6, i, i % 2 === 0);
    g.set(i, 6, i % 2 === 0);
  }
  drawFinder(g, 3, 3);
  drawFinder(g, n - 4, 3);
  drawFinder(g, 3, n - 4);
  // Versions 2-6 have one alignment pattern, at the bottom right.
  if (ver >= 2) drawAlignment(g, n - 7, n - 7);
  drawFormat(g, 'L', 0); // reserve the format area; drawn for real after masking
}

function drawCodewords(g: Grid, data: readonly number[]): void {
  const n = g.size;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (!g.fixed[y]![x] && i < data.length * 8) {
          g.modules[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function maskHits(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(g: Grid, mask: number): void {
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (!g.fixed[y]![x] && maskHits(mask, x, y)) g.modules[y]![x] = !g.modules[y]![x];
    }
  }
}

/** The standard's penalty score: lower scans more easily. Only picks the mask. */
function penalty(g: Grid): number {
  const n = g.size;
  let score = 0;
  const lines = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < n; a++) {
      let colour = false;
      let run = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      const addHistory = (len: number) => {
        if (history[0] === 0) len += n; // a light border before the first run
        history.pop();
        history.unshift(len);
      };
      const finderLike = () => {
        const k = history[1]!;
        const core = k > 0 && history[2] === k && history[3] === k * 3 && history[4] === k && history[5] === k;
        return (core && history[0]! >= k * 4 && history[6]! >= k ? 1 : 0) + (core && history[6]! >= k * 4 && history[0]! >= k ? 1 : 0);
      };
      for (let b = 0; b < n; b++) {
        if (get(a, b) === colour) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score++;
        } else {
          addHistory(run);
          if (!colour) score += finderLike() * 40;
          colour = get(a, b);
          run = 1;
        }
      }
      if (colour) {
        addHistory(run);
        run = 0;
      }
      addHistory(run + n); // a light border after the last run
      score += finderLike() * 40;
    }
  };
  lines((y, x) => g.modules[y]![x]!);
  lines((x, y) => g.modules[y]![x]!);
  let dark = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = g.modules[y]![x]!;
      if (c) dark++;
      if (x < n - 1 && y < n - 1 && c === g.modules[y]![x + 1] && c === g.modules[y + 1]![x] && c === g.modules[y + 1]![x + 1]) score += 3;
    }
  }
  const total = n * n;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * Encode `text` (UTF-8, byte mode) at `ecc`, in the smallest version that
 * holds it. `mask` forces one of the eight masks; by default the one with
 * the lowest penalty is used. Null when the text is too long for version 6.
 */
export function encodeQr(text: string, ecc: EccLevel = 'M', mask?: number): Qr | null {
  const bytes = utf8(text);
  const version = versionFor(bytes.length, ecc);
  if (version === null) return null;
  const g = new Grid(version * 4 + 17);
  drawFunctionPatterns(g, version);
  drawCodewords(g, withEcc(dataCodewords(bytes, version, ecc), version, ecc));
  let chosen = mask ?? -1;
  if (chosen < 0) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(g, m);
      drawFormat(g, ecc, m);
      const p = penalty(g);
      if (p < best) {
        best = p;
        chosen = m;
      }
      applyMask(g, m); // undo: masking is its own inverse
    }
  }
  applyMask(g, chosen);
  drawFormat(g, ecc, chosen);
  return { version, size: g.size, ecc, mask: chosen, modules: g.modules };
}

/**
 * The dark modules as one SVG path, a rectangle per horizontal run, offset
 * by the quiet zone (four modules, as the standard asks).
 */
export function qrPath(qr: Qr, quiet = 4): string {
  let d = '';
  qr.modules.forEach((row, y) => {
    let x = 0;
    while (x < qr.size) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < qr.size && row[end]) end++;
      d += `M${x + quiet} ${y + quiet}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return d;
}
