import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  fromWav,
  level,
  manifest as bankManifest,
  measure,
  MIX,
  PEAK_CEIL_DBFS,
  RATE,
  render,
  SFX,
  TARGET_DBFS,
  toWav,
  TRIM,
} from '../../../scripts/sfx-bank.mjs';
import manifest from '../assets/sfx/manifest.json';

/**
 * The bank is maths, so it is tested as maths: rendered in-process and
 * measured. The old normaliser only ever engaged on clipping, which left an
 * 11.6 dB spread between the quietest and loudest effect — nothing checked.
 */

const here = dirname(fileURLToPath(import.meta.url));
const NAMES = Object.keys(SFX);

describe('the sound bank is levelled', () => {
  it('has a mix entry for every sound and a sound for every entry', () => {
    expect(new Set(Object.keys(TRIM))).toEqual(new Set(NAMES));
    expect(new Set(Object.keys(MIX))).toEqual(new Set(NAMES));
    for (const name of NAMES) {
      const m = MIX[name as keyof typeof MIX];
      expect(m.gain).toBeGreaterThan(0);
      expect(m.gain).toBeLessThanOrEqual(1);
      expect(m.poly).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders at 44.1 kHz', () => {
    expect(RATE).toBe(44100);
  });

  it('renders every sound at the target loudness, or peak-limited just under the ceiling', () => {
    for (const name of NAMES) {
      const { rmsDb, peakDb } = measure(render(name));
      expect(peakDb, `${name} peak`).toBeLessThanOrEqual(PEAK_CEIL_DBFS + 0.1);
      if (peakDb < PEAK_CEIL_DBFS - 0.5) {
        // Not limited: the loudest 100 ms sits where the trim table says.
        expect(Math.abs(rmsDb - (TARGET_DBFS + TRIM[name]!)), `${name} rms`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps the whole kit within a narrow band', () => {
    const levels = NAMES.map((n) => measure(render(n)).rmsDb);
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(8);
  });

  it('brings a whisper up and a shout down', () => {
    const sine = (amp: number) =>
      Float32Array.from({ length: RATE / 4 }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / RATE));
    expect(Math.abs(measure(level(sine(0.01))).rmsDb - TARGET_DBFS)).toBeLessThanOrEqual(0.5);
    expect(measure(level(sine(0.99), 12)).peakDb).toBeLessThanOrEqual(PEAK_CEIL_DBFS + 0.05);
  });
});

describe('the bank renders deterministically', () => {
  it('the same recipe gives the same bytes twice', () => {
    const a = toWav(render('deal'));
    const b = toWav(render('deal'));
    expect(a.equals(b)).toBe(true);
  });
});

describe('the files the app plays', () => {
  it('round-trip as 16-bit mono at the bank rate', () => {
    const samples = render('tap');
    const back = fromWav(toWav(samples));
    expect(back.rate).toBe(RATE);
    expect(back.channels).toBe(1);
    expect(back.bits).toBe(16);
    expect(back.samples.length).toBe(samples.length);
    expect(Math.abs(back.samples[100]! - samples[100]!)).toBeLessThan(1e-3);
  });

  it('are exactly the sounds the app asks for, and all of them exist', () => {
    const audio = readFileSync(join(here, '../src/audio.ts'), 'utf8');
    const asked = new Set([...audio.matchAll(/require\('\.\.\/assets\/sfx\/(\w+)\.wav'\)/g)].map((m) => m[1]!));
    expect(asked).toEqual(new Set(NAMES));
    for (const name of NAMES) {
      expect(existsSync(join(here, `../assets/sfx/${name}.wav`)), `${name}.wav`).toBe(true);
    }
    // The committed manifest is what the script would write today.
    expect(manifest).toEqual(bankManifest());
    // The aliases are gone: two meanings, two files.
    expect(audio).not.toMatch(/turn: require\('\.\.\/assets\/sfx\/pop\.wav'\)/);
    expect(audio).not.toMatch(/tick: require\('\.\.\/assets\/sfx\/tap\.wav'\)/);
  });
});
