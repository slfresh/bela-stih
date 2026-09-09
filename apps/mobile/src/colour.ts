/** Lighten (positive) or darken (negative) a #rrggbb colour by a fraction. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n) || hex.length !== 7) return hex;
  const ch = (v: number) => {
    const x = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(x)));
  };
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
