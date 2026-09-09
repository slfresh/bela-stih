/** Types for the sound bank, so the vitest suite can render and measure it. */
export const RATE: number;
export const TARGET_DBFS: number;
export const PEAK_CEIL_DBFS: number;
export const TRIM: Record<string, number>;
export const MIX: Record<string, { trim: number; gain: number; poly: number; varied: boolean }>;
export function manifest(): Record<string, { gain: number; poly: number; varied: boolean }>;
export const SFX: Record<string, () => Float32Array>;
export function deClick(buf: Float32Array): Float32Array;
export function loudestRms(buf: Float32Array): number;
export function peakOf(buf: Float32Array): number;
export function level(buf: Float32Array, trimDb?: number): Float32Array;
export function measure(buf: Float32Array): { rmsDb: number; peakDb: number };
export function toWav(samples: Float32Array): Buffer;
export function fromWav(buf: Buffer): {
  rate: number;
  channels: number;
  bits: number;
  samples: Float32Array;
};
export function render(name: string): Float32Array;
