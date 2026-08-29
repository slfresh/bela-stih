import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Generates the sound effects from maths.
 *
 * Synthesised rather than downloaded on purpose: no third-party audio to license
 * or attribute, no binaries in the repo we did not make, and every sound is a
 * few numbers away from being retuned. If we later want recorded foley, these
 * drop out and CC0 samples drop in under the same filenames.
 *
 *   node scripts/make-sfx.mjs
 */

const RATE = 22050;
const OUT = join(process.cwd(), 'apps', 'mobile', 'assets', 'sfx');

// --- tiny synth -------------------------------------------------------------

const n = (seconds) => Math.round(seconds * RATE);

/** Exponential decay, the shape almost every short effect wants. */
const decay = (i, len, power = 4) => Math.pow(1 - i / len, power);

/** Short fade at both ends so nothing clicks on playback. */
function deClick(buf) {
  const edge = Math.min(64, Math.floor(buf.length / 8));
  for (let i = 0; i < edge; i++) {
    buf[i] *= i / edge;
    buf[buf.length - 1 - i] *= i / edge;
  }
  return buf;
}

function tone(freq, seconds, { power = 4, gain = 0.5, harmonic = 0.35 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const env = decay(i, len, power);
    out[i] =
      gain *
      env *
      (Math.sin(2 * Math.PI * freq * t) + harmonic * Math.sin(4 * Math.PI * freq * t));
  }
  return out;
}

/** Filtered noise — the basis of every paper/card sound. */
function noise(seconds, { power = 3, gain = 0.4, smooth = 0.55 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * smooth + white * (1 - smooth); // one-pole low pass
    out[i] = gain * decay(i, len, power) * last;
  }
  return out;
}

/** A tone whose frequency slides f0 -> f1 — pops, boings, little glides. */
function glide(f0, f1, seconds, { power = 5, gain = 0.4, harmonic = 0.2 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const freq = f0 + (f1 - f0) * k;
    phase += (2 * Math.PI * freq) / RATE;
    out[i] = gain * decay(i, len, power) * (Math.sin(phase) + harmonic * Math.sin(2 * phase));
  }
  return out;
}

/**
 * A whoosh: noise whose low-pass opens and closes again, under a hump
 * envelope — air moving, not paper falling.
 */
function whoosh(seconds, { gain = 0.5 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const hump = Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 1.5; // fast in, slow out
    const smooth = 0.92 - 0.55 * Math.sin(Math.PI * k); // filter opens mid-flight
    const white = Math.random() * 2 - 1;
    last = last * smooth + white * (1 - smooth);
    out[i] = gain * hump * last;
  }
  return out;
}

function silence(seconds) {
  return new Float32Array(n(seconds));
}

function concat(...parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(len);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function mix(...parts) {
  const len = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(len);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

/** A little run of notes, for wins and level-ups. */
function arpeggio(freqs, step, dur, opts) {
  return mix(...freqs.map((f, i) => concat(silence(i * step), tone(f, dur, opts))));
}

// --- WAV encoding -----------------------------------------------------------

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const norm = peak > 0.99 ? 0.99 / peak : 1; // headroom, never clip
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * norm)) * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// --- the kit ----------------------------------------------------------------

const SFX = {
  // the deal: a riffle — a quick run of card slides, each a shade different
  deal: () =>
    mix(
      ...[0, 0.045, 0.085, 0.13, 0.18].map((at, i) =>
        concat(
          silence(at),
          noise(0.09, { power: 3, gain: 0.34 - i * 0.03, smooth: 0.62 + i * 0.04 }),
        ),
      ),
    ),

  // a card landing on the table: slide plus a soft body thump
  play: () =>
    mix(noise(0.11, { power: 3.5, gain: 0.55, smooth: 0.6 }), tone(190, 0.09, { gain: 0.22, power: 6 })),

  // the trick being swept up: a whoosh with a soft landing thump at the end
  trick: () =>
    mix(
      whoosh(0.32, { gain: 0.5 }),
      concat(silence(0.22), tone(240, 0.1, { gain: 0.22, power: 6 })),
    ),

  // announcing zvanja — a polite two-note call
  zvanje: () => arpeggio([587, 784], 0.09, 0.2, { gain: 0.3, power: 5 }),

  // bela — brighter and prouder than zvanja
  bela: () => arpeggio([659, 880, 1175], 0.075, 0.24, { gain: 0.32, power: 5 }),

  // taking the deal: the run, then the chord together — a proper fanfare
  win: () =>
    mix(
      arpeggio([523, 659, 784], 0.085, 0.3, { gain: 0.28, power: 4 }),
      concat(
        silence(0.255),
        mix(
          tone(1047, 0.5, { gain: 0.2, power: 3 }),
          tone(1319, 0.5, { gain: 0.16, power: 3 }),
          tone(1568, 0.5, { gain: 0.12, power: 3 }),
        ),
      ),
    ),

  // losing it — the same shape, falling
  lose: () => arpeggio([440, 392, 294], 0.1, 0.3, { gain: 0.26, power: 4, harmonic: 0.2 }),

  // a level gained
  levelup: () => arpeggio([523, 784, 1047, 1319, 1568], 0.07, 0.42, { gain: 0.28, power: 3.5 }),

  // coins landing: a little cascade of dings, each one lighter
  coin: () =>
    mix(
      ...[
        [1047, 0],
        [1319, 0.05],
        [1568, 0.105],
        [1319, 0.165],
      ].map(([f, at], i) =>
        concat(silence(at), tone(f, 0.14, { gain: 0.24 - i * 0.04, power: 6, harmonic: 0.5 })),
      ),
    ),

  // ordinary button
  tap: () => mix(tone(880, 0.045, { gain: 0.3, power: 8, harmonic: 0.2 })),

  // an emote arriving: a cartoon bubble pop
  pop: () =>
    mix(
      glide(760, 420, 0.09, { gain: 0.4, power: 4, harmonic: 0.25 }),
      noise(0.03, { power: 6, gain: 0.2, smooth: 0.3 }),
    ),
};

mkdirSync(OUT, { recursive: true });
console.log('Writing sfx to', OUT);
let total = 0;
for (const [name, make] of Object.entries(SFX)) {
  const wav = toWav(deClick(make()));
  writeFileSync(join(OUT, `${name}.wav`), wav);
  total += wav.length;
  console.log(`  ${name}.wav  ${(wav.length / 1024).toFixed(1)}KB`);
}
console.log(`Done — ${(total / 1024).toFixed(0)}KB total.`);
