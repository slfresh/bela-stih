/**
 * The sound bank, as maths.
 *
 * Synthesised rather than downloaded on purpose: no third-party audio to license
 * or attribute, no binaries in the repo we did not make, and every sound is a
 * few numbers away from being retuned. If we later want recorded foley, these
 * drop out and CC0 samples drop in under the same filenames.
 *
 * This module only renders; `make-sfx.mjs` writes the files. Kept apart so the
 * bank test can render the kit in-process and check its levels without
 * touching the assets folder.
 */

export const RATE = 22050;

/**
 * Every file is levelled so its loudest 100 ms sits at this RMS, then trimmed
 * per sound. The old bank had an 11.6 dB spread between its quietest and
 * loudest effect and a "normaliser" that only ever engaged on clipping, so a
 * volume that made the deal audible made the coins startle.
 */
export const TARGET_DBFS = -18;
/** Never closer to full scale than this — a phone speaker's own limiter is worse. */
export const PEAK_CEIL_DBFS = -1;

/**
 * Per-sound trim in dB, on top of the target: the mix. A card landing should be
 * a touch under a fanfare; a tap is a texture, not an event.
 */
export const TRIM = {
  deal: -2,
  play: 0,
  trick: 0,
  lastTrick: 0,
  zvanje: -1,
  bela: 0,
  win: 1,
  lose: -1,
  matchWon: 2,
  matchLost: -1,
  levelup: 1,
  coin: -3,
  tap: -4,
  pop: -3,
  turn: 0,
  tick: -2,
  knock: -3,
  call: -1,
  stamp: -2,
  kontra: 0,
};

// --- tiny synth -------------------------------------------------------------

const n = (seconds) => Math.round(seconds * RATE);

/** Exponential decay, the shape almost every short effect wants. */
const decay = (i, len, power = 4) => Math.pow(1 - i / len, power);

/**
 * Decay with a real attack in front of it: a linear ramp over `attack` seconds.
 * Every sound used to start at full amplitude on sample one, which is a click
 * however short the de-click fade — and it made the chimes sound like taps.
 */
function env(i, len, { power = 4, attack = 0 } = {}) {
  const a = n(attack);
  const ramp = a > 0 ? Math.min(1, i / a) : 1;
  return ramp * decay(i, len, power);
}

/** Short fade at both ends so nothing clicks on playback. */
export function deClick(buf) {
  const edge = Math.min(64, Math.floor(buf.length / 8));
  for (let i = 0; i < edge; i++) {
    buf[i] *= i / edge;
    buf[buf.length - 1 - i] *= i / edge;
  }
  return buf;
}

function tone(freq, seconds, { power = 4, gain = 0.5, harmonic = 0.35, attack = 0 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const e = env(i, len, { power, attack });
    out[i] =
      gain * e * (Math.sin(2 * Math.PI * freq * t) + harmonic * Math.sin(4 * Math.PI * freq * t));
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

/**
 * Noise through a band: a low-pass, minus a slower low-pass, leaves what lies
 * between the two cutoffs. `lo`/`hi` are the smoothing factors, not hertz —
 * hi closer to 1 keeps less of the top.
 */
function bandNoise(seconds, { power = 6, gain = 0.4, lo = 0.9, hi = 0.4 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  let fast = 0;
  let slow = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    fast = fast * hi + white * (1 - hi);
    slow = slow * lo + fast * (1 - lo);
    out[i] = gain * decay(i, len, power) * (fast - slow);
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

// --- levelling --------------------------------------------------------------

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const fromDb = (d) => Math.pow(10, d / 20);

/**
 * RMS of the loudest 100 ms — what the ear takes as "how loud is this" for a
 * short effect, unlike whole-file RMS, which a long tail drags down.
 */
export function loudestRms(buf) {
  const win = Math.min(n(0.1), buf.length);
  let sum = 0;
  let best = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i];
    if (i >= win) sum -= buf[i - win] * buf[i - win];
    if (i >= win - 1) best = Math.max(best, sum / win);
  }
  return Math.sqrt(best);
}

export function peakOf(buf) {
  let peak = 0;
  for (const s of buf) peak = Math.max(peak, Math.abs(s));
  return peak;
}

/**
 * Bring a rendered sound to the target loudness plus its trim, then back off
 * if that would put its peak over the ceiling — the peak ceiling wins.
 */
export function level(buf, trimDb = 0) {
  const target = fromDb(TARGET_DBFS + trimDb);
  let gain = target / Math.max(loudestRms(buf), 1e-9);
  const peak = peakOf(buf);
  if (peak * gain > fromDb(PEAK_CEIL_DBFS)) gain = fromDb(PEAK_CEIL_DBFS) / peak;
  for (let i = 0; i < buf.length; i++) buf[i] *= gain;
  return buf;
}

/** Loudest-window RMS and peak of a finished sound, in dBFS — for the log and the test. */
export function measure(buf) {
  return { rmsDb: db(loudestRms(buf)), peakDb: db(peakOf(buf)) };
}

// --- WAV encoding -----------------------------------------------------------

export function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
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

/** The inverse, for the test: 16-bit mono PCM back to floats. */
export function fromWav(buf) {
  const rate = buf.readUInt32LE(24);
  const channels = buf.readUInt16LE(22);
  const bits = buf.readUInt16LE(34);
  const len = buf.readUInt32LE(40) / 2;
  const samples = new Float32Array(len);
  for (let i = 0; i < len; i++) samples[i] = buf.readInt16LE(44 + i * 2) / 32767;
  return { rate, channels, bits, samples };
}

// --- the kit ----------------------------------------------------------------

export const SFX = {
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

  // the last trick: the same sweep, and the ten points it carries ring on top
  lastTrick: () =>
    mix(
      whoosh(0.32, { gain: 0.5 }),
      concat(silence(0.22), tone(240, 0.1, { gain: 0.22, power: 6 })),
      concat(silence(0.2), tone(1047, 0.22, { gain: 0.18, power: 5, harmonic: 0.4, attack: 0.006 })),
      concat(silence(0.3), tone(1319, 0.28, { gain: 0.16, power: 4, harmonic: 0.4, attack: 0.006 })),
    ),

  // announcing zvanja — a polite two-note call
  zvanje: () => arpeggio([587, 784], 0.09, 0.2, { gain: 0.3, power: 5, attack: 0.004 }),

  // bela — brighter and prouder than zvanja
  bela: () => arpeggio([659, 880, 1175], 0.075, 0.24, { gain: 0.32, power: 5, attack: 0.004 }),

  // taking the deal: the run, then the chord together — a proper fanfare
  win: () =>
    mix(
      arpeggio([523, 659, 784], 0.085, 0.3, { gain: 0.28, power: 4, attack: 0.004 }),
      concat(
        silence(0.255),
        mix(
          tone(1047, 0.5, { gain: 0.2, power: 3, attack: 0.008 }),
          tone(1319, 0.5, { gain: 0.16, power: 3, attack: 0.008 }),
          tone(1568, 0.5, { gain: 0.12, power: 3, attack: 0.008 }),
        ),
      ),
    ),

  // losing it — the same shape, falling
  lose: () =>
    arpeggio([440, 392, 294], 0.1, 0.3, { gain: 0.26, power: 4, harmonic: 0.2, attack: 0.006 }),

  // the match: a longer run and a held chord — the deal fanfare's big brother,
  // so the last deal and the match are told apart by ear
  matchWon: () =>
    mix(
      arpeggio([523, 659, 784, 1047], 0.11, 0.36, { gain: 0.26, power: 4, attack: 0.005 }),
      concat(
        silence(0.44),
        mix(
          tone(1047, 0.95, { gain: 0.2, power: 2.5, harmonic: 0.45, attack: 0.012 }),
          tone(1319, 0.95, { gain: 0.16, power: 2.5, harmonic: 0.45, attack: 0.012 }),
          tone(1568, 0.95, { gain: 0.13, power: 2.5, harmonic: 0.45, attack: 0.012 }),
          tone(2093, 0.9, { gain: 0.07, power: 2.5, harmonic: 0.2, attack: 0.012 }),
        ),
      ),
    ),

  // losing the match: three slow falling notes and a low hum that sits under them
  matchLost: () =>
    mix(
      arpeggio([392, 349, 294], 0.16, 0.45, { gain: 0.24, power: 3.5, harmonic: 0.2, attack: 0.01 }),
      concat(silence(0.3), tone(196, 0.7, { gain: 0.16, power: 2.5, harmonic: 0.1, attack: 0.03 })),
    ),

  // a level gained
  levelup: () =>
    arpeggio([523, 784, 1047, 1319, 1568], 0.07, 0.42, { gain: 0.28, power: 3.5, attack: 0.004 }),

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

  // your turn: a warm two-tone chime, soft attack, the fifth arriving just
  // after the root — unhurried, unlike every call around it. It used to be
  // the emote pop, so a bubble and a turn were the same sound.
  turn: () =>
    mix(
      tone(523, 0.4, { gain: 0.3, power: 3, harmonic: 0.3, attack: 0.012 }),
      concat(silence(0.07), tone(784, 0.36, { gain: 0.22, power: 3, harmonic: 0.3, attack: 0.012 })),
    ),

  // the clock: a woodblock — a burst of mid-band noise with a short body. Not
  // the button tap, which it used to share; the two mean opposite things.
  tick: () =>
    mix(
      bandNoise(0.05, { gain: 0.5, power: 5, lo: 0.85, hi: 0.35 }),
      tone(1200, 0.04, { gain: 0.24, power: 9, harmonic: 0.1 }),
    ),

  // a pass: knuckles on the table — a damped low body and a short burst
  knock: () =>
    mix(
      tone(190, 0.11, { gain: 0.5, power: 7, harmonic: 0.15 }),
      bandNoise(0.03, { gain: 0.35, power: 6, lo: 0.7, hi: 0.2 }),
    ),

  // calling trump: a marimba pair, warmer and lower than the zvanja call
  call: () =>
    arpeggio([392, 523], 0.11, 0.22, { gain: 0.3, power: 6, harmonic: 0.15, attack: 0.003 }),

  // the pip landing on the plaque: a soft thud with a little ring in it
  stamp: () =>
    mix(
      tone(150, 0.08, { gain: 0.45, power: 6, harmonic: 0.1 }),
      concat(silence(0.01), tone(1568, 0.09, { gain: 0.12, power: 8, harmonic: 0.3 })),
    ),

  // kontra: two falling notes with a bit of brass in them — a challenge
  kontra: () =>
    arpeggio([440, 330], 0.13, 0.28, { gain: 0.3, power: 4, harmonic: 0.6, attack: 0.008 }),
};

/**
 * Render one sound, de-clicked and then levelled: the exact samples that go in
 * the file. The fades come first — on a 45 ms tap they take a real bite out of
 * the energy, and levelling afterwards is what makes the measurement honest.
 */
export function render(name) {
  return level(deClick(SFX[name]()), TRIM[name] ?? 0);
}
