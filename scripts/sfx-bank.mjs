/**
 * The sound bank, as maths.
 *
 * Synthesised rather than downloaded on purpose: no third-party audio to license
 * or attribute, no binaries in the repo we did not make, and every sound is a
 * few numbers away from being retuned. If we later want recorded foley, these
 * drop out and CC0 samples drop in under the same filenames.
 *
 * This module only renders; `make-sfx.mjs` writes the files and the manifest.
 * Kept apart so the bank test can render the kit in-process and check its
 * levels without touching the assets folder.
 *
 * v2: 44.1 kHz, real attacks, additive bells for the coins and chimes, layered
 * paper for the cards, and one MIX table that both levels the files and tells
 * the app how to play them (gain, polyphony, pitch variation).
 */

export const RATE = 44100;

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
 * The mix. `trim` (dB) shapes the file itself on top of the target; `gain`
 * is what the app plays it at (0–1, times the master volume); `poly` is how
 * many can sound at once; `varied` sounds get a little pitch jitter per play,
 * the way real cards and coins never sound twice the same — melodic ones do
 * not, and neither does the clock, whose two pitches must stay tellable apart.
 *
 * `rare` sounds come once a deal or less. Android lets an app hold 40 audio
 * tracks and every loaded player holds one, playing or not: 55 players held
 * all 40 and left none for a voice message (the 15 past the limit never
 * sounded at all). So on Android a rare sound gets a player only while it
 * sounds, and the pools stay small - `poly` above 1 only where the sound
 * really overlaps itself (the coins land 50 ms apart and ring for 180).
 */
export const MIX = {
  // the cards
  shuffle: { trim: -3, gain: 0.7, poly: 1, varied: true, rare: true },
  deal: { trim: -2, gain: 0.8, poly: 2, varied: true },
  fan: { trim: -4, gain: 0.6, poly: 1, varied: true },
  talon: { trim: -3, gain: 0.7, poly: 1, varied: true, rare: true },
  sort: { trim: -4, gain: 0.5, poly: 1, varied: true },
  play: { trim: 0, gain: 0.9, poly: 2, varied: true },
  sweep: { trim: -1, gain: 0.8, poly: 1, varied: true },
  stack: { trim: -3, gain: 0.7, poly: 1, varied: true },
  trick: { trim: 0, gain: 0.9, poly: 1, varied: true },
  lastTrick: { trim: 0, gain: 1, poly: 1, varied: true, rare: true },
  // the bidding
  knock: { trim: -3, gain: 0.7, poly: 1, varied: true },
  call: { trim: -1, gain: 0.85, poly: 1, varied: false },
  stamp: { trim: -2, gain: 0.7, poly: 1, varied: true, rare: true },
  kontra: { trim: 0, gain: 0.9, poly: 1, varied: false, rare: true },
  // the zvanja
  zvanje: { trim: -1, gain: 0.85, poly: 1, varied: false, rare: true },
  reveal: { trim: -1, gain: 0.8, poly: 1, varied: false, rare: true },
  revealDown: { trim: -3, gain: 0.6, poly: 1, varied: false, rare: true },
  bela: { trim: 0, gain: 0.9, poly: 1, varied: false, rare: true },
  // the reckoning
  stiglja: { trim: 1, gain: 1, poly: 1, varied: false, rare: true },
  win: { trim: 1, gain: 1, poly: 1, varied: false, rare: true },
  lose: { trim: -1, gain: 0.8, poly: 1, varied: false, rare: true },
  matchWon: { trim: 2, gain: 1, poly: 1, varied: false, rare: true },
  matchLost: { trim: -1, gain: 0.85, poly: 1, varied: false, rare: true },
  tick: { trim: -2, gain: 0.7, poly: 1, varied: false },
  coin: { trim: -3, gain: 0.6, poly: 4, varied: true },
  levelup: { trim: 1, gain: 1, poly: 1, varied: false, rare: true },
  // cues
  turn: { trim: 0, gain: 0.9, poly: 1, varied: false },
  callPrompt: { trim: 0, gain: 0.9, poly: 1, varied: false, rare: true },
  settle: { trim: -4, gain: 0.6, poly: 1, varied: true, rare: true },
  // the interface
  arm: { trim: -4, gain: 0.6, poly: 1, varied: true },
  tap: { trim: -4, gain: 0.5, poly: 1, varied: true },
  press: { trim: -5, gain: 0.4, poly: 1, varied: true },
  hold: { trim: -4, gain: 0.6, poly: 1, varied: false },
  pop: { trim: -3, gain: 0.6, poly: 2, varied: true },
  gift: { trim: -3, gain: 0.7, poly: 1, varied: true, rare: true },
  purchase: { trim: 0, gain: 0.9, poly: 1, varied: false, rare: true },
  denied: { trim: -2, gain: 0.7, poly: 1, varied: false },
  seatJoin: { trim: -2, gain: 0.7, poly: 1, varied: false, rare: true },
  seatLeave: { trim: -3, gain: 0.6, poly: 1, varied: false, rare: true },
  reconnected: { trim: -1, gain: 0.8, poly: 1, varied: false, rare: true },
};

/** The trims alone, for the leveller and the log. */
export const TRIM = Object.fromEntries(Object.entries(MIX).map(([k, v]) => [k, v.trim]));

// --- tiny synth -------------------------------------------------------------

const n = (seconds) => Math.round(seconds * RATE);

/**
 * Noise from a seeded generator, reseeded per sound in `render()`: the same
 * source renders the same bytes, so regenerating the bank changes only the
 * files whose recipe changed instead of every noise-based one.
 */
let rngState = 1;
function seed(name) {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  rngState = h >>> 0 || 1;
}
function random() {
  // mulberry32
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Exponential decay, the shape almost every short effect wants. */
const decay = (i, len, power = 4) => Math.pow(1 - i / len, power);

/**
 * Attack, hold, decay: a linear ramp over `attack` seconds, flat for `hold`,
 * then the exponential tail. Every sound used to start at full amplitude on
 * sample one, which is a click however short the de-click fade — and it made
 * the chimes sound like taps.
 */
function env(i, len, { power = 4, attack = 0, hold = 0 } = {}) {
  const a = n(attack);
  const h = n(hold);
  const ramp = a > 0 ? Math.min(1, i / a) : 1;
  if (i < a + h) return ramp;
  const j = i - a - h;
  const rest = Math.max(1, len - a - h);
  return decay(Math.min(j, rest), rest, power);
}

/** Short fade at both ends so nothing clicks on playback. */
export function deClick(buf) {
  const edge = Math.min(128, Math.floor(buf.length / 8));
  for (let i = 0; i < edge; i++) {
    buf[i] *= i / edge;
    buf[buf.length - 1 - i] *= i / edge;
  }
  return buf;
}

function tone(freq, seconds, { power = 4, gain = 0.5, harmonic = 0.35, attack = 0, hold = 0 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const e = env(i, len, { power, attack, hold });
    out[i] =
      gain * e * (Math.sin(2 * Math.PI * freq * t) + harmonic * Math.sin(4 * Math.PI * freq * t));
  }
  return out;
}

/**
 * Additive: a fundamental and its partials, each with its own weight and
 * decay — what makes a bell a bell and a coin a coin. Ratios: a bell
 * [1, 2.76, 5.4, 8.9]; struck metal [1, 1.5, 2.3, 3.7].
 */
function partials(freq, list, seconds, { gain = 0.4, attack = 0.003 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  const a = n(attack);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const ramp = a > 0 ? Math.min(1, i / a) : 1;
    let v = 0;
    for (const p of list) {
      v += p.amp * Math.exp(-t * p.decay) * Math.sin(2 * Math.PI * freq * p.ratio * t);
    }
    out[i] = gain * ramp * v;
  }
  return out;
}

const BELL = [
  { ratio: 1, amp: 1, decay: 5 },
  { ratio: 2.76, amp: 0.55, decay: 9 },
  { ratio: 5.4, amp: 0.3, decay: 14 },
  { ratio: 8.9, amp: 0.12, decay: 22 },
];
const METAL = [
  { ratio: 1, amp: 1, decay: 7 },
  { ratio: 1.5, amp: 0.6, decay: 11 },
  { ratio: 2.3, amp: 0.35, decay: 16 },
  { ratio: 3.7, amp: 0.15, decay: 24 },
];
/** Glass: thin, inharmonic and quick to die — a clink, not a ring. */
const GLASS = [
  { ratio: 1, amp: 1, decay: 13 },
  { ratio: 2.32, amp: 0.5, decay: 20 },
  { ratio: 4.25, amp: 0.22, decay: 30 },
];

/** Filtered noise — the basis of every paper/card sound. */
function noise(seconds, { power = 3, gain = 0.4, smooth = 0.55, attack = 0 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = random() * 2 - 1;
    last = last * smooth + white * (1 - smooth); // one-pole low pass
    out[i] = gain * env(i, len, { power, attack }) * last;
  }
  return out;
}

/**
 * Noise through a band: a low-pass, minus a slower low-pass, leaves what lies
 * between the two cutoffs. `lo`/`hi` are the smoothing factors, not hertz —
 * hi closer to 1 keeps less of the top.
 */
function bandNoise(seconds, { power = 6, gain = 0.4, lo = 0.9, hi = 0.4, attack = 0 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  let fast = 0;
  let slow = 0;
  for (let i = 0; i < len; i++) {
    const white = random() * 2 - 1;
    fast = fast * hi + white * (1 - hi);
    slow = slow * lo + fast * (1 - lo);
    out[i] = gain * env(i, len, { power, attack }) * (fast - slow);
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
 * envelope — air moving, not paper falling. `rise` is where the hump peaks
 * (0–1): a sweep rises slowly so its loudest moment meets the cards moving.
 */
function whoosh(seconds, { gain = 0.5, rise = 0.35 } = {}) {
  const len = n(seconds);
  const out = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const hump =
      k < rise ? Math.sin((Math.PI / 2) * (k / rise)) : Math.cos((Math.PI / 2) * ((k - rise) / (1 - rise)));
    const smooth = 0.95 - 0.6 * Math.sin(Math.PI * k); // filter opens mid-flight
    const white = random() * 2 - 1;
    last = last * smooth + white * (1 - smooth);
    out[i] = gain * hump * hump * last;
  }
  return out;
}

/** A paper slide: three noise bands under a soft body, the way a card actually sounds. */
function slide(seconds, { gain = 0.5, body = 190 } = {}) {
  return mix(
    bandNoise(seconds, { gain: gain * 0.7, power: 3, lo: 0.97, hi: 0.5 }),
    bandNoise(seconds * 0.7, { gain: gain * 0.5, power: 4, lo: 0.85, hi: 0.2 }),
    noise(seconds * 0.5, { gain: gain * 0.35, power: 5, smooth: 0.8 }),
    tone(body, seconds * 0.8, { gain: gain * 0.4, power: 6, harmonic: 0.1 }),
  );
}

/** Gentle saturation on the hits, so a thud has a little weight without clipping. */
function softClip(buf, drive = 1.6) {
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / Math.tanh(drive);
  return buf;
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

/** A run of the same sound, `count` times, `step` apart, each a shade different. */
function run(count, step, make) {
  return mix(...Array.from({ length: count }, (_, i) => concat(silence(i * step), make(i))));
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
  // ---- the cards
  // the pack being squared and riffled once before the deal
  shuffle: () =>
    mix(
      run(7, 0.028, (i) => bandNoise(0.05, { gain: 0.3 - i * 0.02, power: 4, lo: 0.9, hi: 0.35 })),
      concat(
        silence(0.22),
        run(6, 0.03, (i) => bandNoise(0.05, { gain: 0.28 - i * 0.02, power: 4, lo: 0.9, hi: 0.4 })),
      ),
      tone(140, 0.4, { gain: 0.15, power: 5, harmonic: 0.1 }),
    ),

  // the deal: twelve slides, 75 ms apart, matched to the backs flying
  deal: () => run(12, 0.075, (i) => slide(0.1, { gain: 0.42 - (i % 3) * 0.05 })),

  // my six cards fanning open at once
  fan: () =>
    mix(run(6, 0.018, () => slide(0.07, { gain: 0.3 })), tone(240, 0.12, { gain: 0.15, power: 7 })),

  // the talon: two slides, close together
  talon: () => run(2, 0.11, () => slide(0.1, { gain: 0.45 })),

  // the fan re-sorting: a quick flick of paper
  sort: () => run(4, 0.022, () => slide(0.05, { gain: 0.28 })),

  // a card landing on the table: paper and a soft body
  play: () => mix(slide(0.11, { gain: 0.6 }), tone(190, 0.09, { gain: 0.25, power: 6 })),

  // the four cards sweeping to the winner: air rising to meet them
  sweep: () => whoosh(0.4, { gain: 0.5, rise: 0.55 }),

  // the pile landing at the puck
  stack: () =>
    softClip(mix(tone(120, 0.1, { gain: 0.5, power: 6, harmonic: 0.2 }), slide(0.05, { gain: 0.3 }))),

  // an ordinary trick: the sweep with a soft landing at the end
  // The sweep alone: the cards land 570–690 ms in, on 'stack' — a landing
  // tone at 240 ms here answered nothing on screen.
  trick: () => whoosh(0.34, { gain: 0.55, rise: 0.45 }),

  // the last trick: the same sweep, and the ten points it carries ring on top
  lastTrick: () =>
    mix(
      whoosh(0.34, { gain: 0.5, rise: 0.45 }),
      concat(silence(0.24), tone(240, 0.1, { gain: 0.22, power: 6 })),
      concat(silence(0.2), partials(1047, BELL, 0.3, { gain: 0.16 })),
      concat(silence(0.3), partials(1319, BELL, 0.35, { gain: 0.14 })),
    ),

  // ---- the bidding
  // a pass: knuckles on the table — a damped low body and a short burst
  knock: () =>
    softClip(
      mix(
        tone(190, 0.11, { gain: 0.5, power: 7, harmonic: 0.15 }),
        bandNoise(0.03, { gain: 0.35, power: 6, lo: 0.7, hi: 0.2 }),
      ),
    ),

  // calling trump: a marimba pair, warmer and lower than the zvanja call
  call: () => arpeggio([392, 523], 0.11, 0.22, { gain: 0.3, power: 6, harmonic: 0.15, attack: 0.003 }),

  // the pip landing on the plaque: a soft thud with a little ring in it
  stamp: () =>
    softClip(
      mix(
        tone(150, 0.08, { gain: 0.45, power: 6, harmonic: 0.1 }),
        concat(silence(0.01), partials(1568, METAL, 0.1, { gain: 0.1 })),
      ),
    ),

  // kontra: two falling notes with a bit of brass in them — a challenge
  kontra: () => arpeggio([440, 330], 0.13, 0.28, { gain: 0.3, power: 4, harmonic: 0.6, attack: 0.008 }),

  // ---- the zvanja
  // announcing zvanja — a polite two-note call (the weight is played by pitch)
  zvanje: () => arpeggio([587, 784], 0.09, 0.2, { gain: 0.3, power: 5, attack: 0.004 }),

  // the zvanja going up: a quick bright shimmer, four notes climbing
  reveal: () =>
    arpeggio([784, 988, 1175, 1568], 0.055, 0.3, { gain: 0.22, power: 4, harmonic: 0.4, attack: 0.004 }),

  // ...and coming down: two soft notes falling, no fuss
  revealDown: () => arpeggio([988, 784], 0.1, 0.22, { gain: 0.22, power: 5, harmonic: 0.3, attack: 0.006 }),

  // bela — a real little bell, brighter and prouder than zvanja
  bela: () =>
    mix(
      partials(880, BELL, 0.45, { gain: 0.32 }),
      concat(silence(0.09), partials(1175, BELL, 0.4, { gain: 0.24 })),
    ),

  // ---- the reckoning
  // štiglja — every trick to one side: a low hit, then a fanfare climbing out of it
  stiglja: () =>
    mix(
      tone(98, 0.5, { gain: 0.32, power: 3, harmonic: 0.5, attack: 0.004 }),
      bandNoise(0.06, { gain: 0.3, power: 5, lo: 0.8, hi: 0.3 }),
      concat(
        silence(0.12),
        arpeggio([392, 523, 659, 784], 0.075, 0.5, { gain: 0.28, power: 3, harmonic: 0.5, attack: 0.005 }),
      ),
    ),

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
  lose: () => arpeggio([440, 392, 294], 0.1, 0.3, { gain: 0.26, power: 4, harmonic: 0.2, attack: 0.006 }),

  // the match: a longer run and a held chord — the deal fanfare's big brother
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

  // the tally being written: a woodblock. Also the clock, a shade higher.
  tick: () =>
    mix(
      bandNoise(0.05, { gain: 0.5, power: 5, lo: 0.85, hi: 0.35 }),
      tone(1200, 0.04, { gain: 0.24, power: 9, harmonic: 0.1 }),
    ),

  // one coin landing: a small bright ding — the cascade plays one per coin
  coin: () => partials(2093, METAL, 0.18, { gain: 0.3, attack: 0.002 }),

  // a level gained
  levelup: () =>
    arpeggio([523, 784, 1047, 1319, 1568], 0.07, 0.42, { gain: 0.28, power: 3.5, attack: 0.004 }),

  // ---- cues
  // your turn: a warm two-tone chime, soft attack, the fifth arriving just after the root
  turn: () =>
    mix(
      tone(523, 0.4, { gain: 0.3, power: 3, harmonic: 0.3, attack: 0.012 }),
      concat(silence(0.07), tone(784, 0.36, { gain: 0.22, power: 3, harmonic: 0.3, attack: 0.012 })),
    ),

  // "anything to call?": a rising question — three notes up, the last held
  callPrompt: () =>
    arpeggio([659, 784, 988], 0.08, 0.3, { gain: 0.26, power: 4, harmonic: 0.25, attack: 0.008 }),

  // the director skipping ahead: a short settle of air
  settle: () => whoosh(0.18, { gain: 0.35, rise: 0.3 }),

  // ---- the interface
  // arming a card: a softer, lower click than a button
  arm: () => tone(660, 0.04, { gain: 0.3, power: 8, harmonic: 0.15 }),

  // ordinary button
  tap: () => tone(880, 0.045, { gain: 0.3, power: 8, harmonic: 0.2 }),

  // finger down on a button: barely there
  press: () => tone(520, 0.025, { gain: 0.25, power: 9, harmonic: 0.1 }),

  // a long press taking hold: a low swell
  hold: () => tone(196, 0.24, { gain: 0.3, power: 2, harmonic: 0.3, attack: 0.12 }),

  // an emote arriving: a cartoon bubble pop
  pop: () =>
    mix(
      glide(760, 420, 0.09, { gain: 0.4, power: 4, harmonic: 0.25 }),
      noise(0.03, { power: 6, gain: 0.2, smooth: 0.3 }),
    ),

  // a table gift landing: two glasses touching, the second a fourth higher
  gift: () =>
    mix(
      partials(1760, GLASS, 0.22, { gain: 0.26, attack: 0.001 }),
      concat(silence(0.07), partials(2349, GLASS, 0.2, { gain: 0.2, attack: 0.001 })),
    ),

  // bought: a coin and a little confirming chord
  purchase: () =>
    mix(
      partials(2093, METAL, 0.2, { gain: 0.24 }),
      concat(
        silence(0.08),
        mix(
          tone(784, 0.35, { gain: 0.18, power: 3, attack: 0.006 }),
          tone(1175, 0.35, { gain: 0.14, power: 3, attack: 0.006 }),
        ),
      ),
    ),

  // refused: a short low buzz, no drama
  denied: () => tone(140, 0.14, { gain: 0.35, power: 3, harmonic: 0.8, attack: 0.004, hold: 0.06 }),

  // someone sat down / left / came back
  seatJoin: () => arpeggio([659, 880], 0.09, 0.22, { gain: 0.26, power: 5, attack: 0.005 }),
  seatLeave: () => arpeggio([880, 659], 0.09, 0.22, { gain: 0.24, power: 5, attack: 0.005 }),
  reconnected: () => arpeggio([659, 784, 1047], 0.07, 0.28, { gain: 0.26, power: 4, attack: 0.005 }),
};

/** Render one sound, de-clicked and then levelled: the exact samples that go in the file. */
export function render(name) {
  seed(name);
  return level(deClick(SFX[name]()), TRIM[name] ?? 0);
}

/** What the app needs to know about each file: how to play it. */
export function manifest() {
  return Object.fromEntries(
    Object.keys(SFX).map((name) => {
      const { gain, poly, varied, rare = false } = MIX[name];
      return [name, { gain, poly, varied, rare }];
    }),
  );
}
