/**
 * A card-table palette, deliberately NOT casino chrome.
 *
 * This matters beyond taste: the IARC questionnaire assigns a "Simulated
 * Gambling" descriptor — and with it a PEGI 18 rating — to apps that look like a
 * casino. Felt and wood read as a kitchen table, which is what Bela is.
 */
export const theme = {
  felt: '#123a2b',
  feltDeep: '#0d2a1f',
  wood: '#3a2a1d',
  line: 'rgba(255,255,255,0.10)',
  text: '#f2efe6',
  textDim: 'rgba(242,239,230,0.62)',
  cardFace: '#f7f4ec',
  cardBack: '#6b2230',
  cardEdge: 'rgba(0,0,0,0.35)',
  red: '#b3202e',
  black: '#1b1b1b',
  accent: '#d8a531',
  danger: '#c2452f',
  ok: '#4e9d5b',
} as const;

/**
 * Us and them. Green and red are what a bela player already reads as "our pile"
 * and "theirs" — but they are also the classic confusion pair, so colour is
 * NEVER the only carrier here: the Mi/Oni labels stay, the partner keeps a
 * shape marker, and the two hues differ in luminance as well as hue so they
 * survive greyscale and deuteranopia as light-vs-dark.
 *
 * Deliberately separate from `ok`/`danger`, which mean a good or bad OUTCOME
 * and will sometimes have to be drawn on an "Oni" surface.
 */
export const team = {
  us: '#3f9c58',
  usDim: 'rgba(63,156,88,0.22)',
  usEdge: 'rgba(63,156,88,0.75)',
  usInk: '#a8e2b8',
  them: '#c4453a',
  themDim: 'rgba(196,69,58,0.22)',
  themEdge: 'rgba(196,69,58,0.75)',
  themInk: '#f0a79f',
} as const;

/**
 * Signals that are not about outcome or side: cream, not more gold, so the
 * one thing gold still means on the table stays legible.
 */
export const signal = {
  /** "Your turn" — the beacon under the hand and the pulse that announces it. */
  turn: '#fff1c9',
} as const;

export const radius = { card: 8, panel: 14, pill: 999 } as const;
