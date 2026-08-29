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

export const radius = { card: 8, panel: 14, pill: 999 } as const;
