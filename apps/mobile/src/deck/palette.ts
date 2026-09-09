/**
 * The deck's shared palette.
 *
 * Real Tell-pattern courts are MULTICOLOURED — blue coats, red sleeves, gold
 * trim, mixed per character — with the suit carried by the pip alone. Tinting
 * whole figures by suit (what our first deck did) is precisely what made it
 * read as an app instead of a pack of cards, so scenes and courts draw from
 * this fixed garb palette and never from the suit colour.
 */
export const garb = {
  blue: '#2e5d8c',
  blueDark: '#1d3f63',
  red: '#c0202e',
  redDark: '#8a121d',
  green: '#2f7d3a',
  greenLight: '#7cae3e',
  greenDark: '#1d5325',
  gold: '#d9a41c',
  goldDark: '#a3760a',
  brown: '#7a4a21',
  brownDark: '#4d2c10',
  skin: '#f0d8b6',
  skinLine: '#b98f5f',
  steel: '#9aa5ad',
  steelDark: '#5f6b73',
  cream: '#f7f4ec',
  ink: '#2b2620',
  snow: '#e9eef2',
  flame: '#e2711d',
  flameBright: '#f2a71b',
  grape: '#5c4a77',
} as const;
