import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Play Store listing assets, drawn from the same hand as the app: felt, gold,
 * and mađarice pips. No stock art, no fonts we do not have — text renders in
 * the system's Segoe UI, which resvg loads from Windows.
 *
 *   node scripts/make-store-assets.mjs
 */

const OUT = join(process.cwd(), 'apps', 'mobile', 'store');
mkdirSync(OUT, { recursive: true });

const FELT_DEEP = '#0d2a1f';
const FELT = '#123a2b';
const GOLD = '#d8a531';
const CREAM = '#f2efe6';
const CARD = '#f7f4ec';
const LEAF = '#3f9e4d';
const VEIN = '#1d5325';
const HEART = '#b3202e';
const ACORN = '#7a4a21';
const ACORN_CAP = '#4d2c10';

const leafPath =
  'M50 6c26 18 36 42 26 60-7 13-18 20-26 26-8-6-19-13-26-26C14 48 24 24 50 6z';
const heartPath =
  'M50 88C24 64 10 46 10 31 10 19 19 10 30 10c8 0 16 5 20 12 4-7 12-12 20-12 11 0 20 9 20 21 0 15-14 33-40 57z';

/** One card with a big centred pip, on its own 0..100x145 canvas. */
function card(pip) {
  const face =
    pip === 'leaf'
      ? `<g transform="translate(24 40) scale(0.52)"><path d="${leafPath}" fill="${LEAF}"/><path d="M48 30h4v60h-4z" fill="${VEIN}"/></g>`
      : pip === 'heart'
        ? `<g transform="translate(24 42) scale(0.52)"><path d="${heartPath}" fill="${HEART}"/></g>`
        : `<g transform="translate(28 40)">
             <ellipse cx="22" cy="34" rx="17" ry="22" fill="${ACORN}"/>
             <path d="M2 22 Q22 4 42 22 L42 30 Q22 20 2 30 Z" fill="${ACORN_CAP}"/>
             <rect x="20" y="0" width="4" height="10" rx="2" fill="${ACORN_CAP}"/>
           </g>`;
  return `<rect width="100" height="145" rx="9" fill="${CARD}"/>
    <rect x="2" y="2" width="96" height="141" rx="7" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="1.6"/>
    ${face}`;
}

const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <radialGradient id="felt" cx="0.38" cy="0.42" r="1.0">
      <stop offset="0" stop-color="${FELT}"/>
      <stop offset="1" stop-color="${FELT_DEEP}"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#felt)"/>
  <ellipse cx="512" cy="250" rx="470" ry="215" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="2"/>

  <!-- the fan: three suits of the mađarice -->
  <g transform="translate(150 120)">
    <g transform="rotate(-16 50 145) translate(-60 24) scale(1.7)">${card('acorn')}</g>
    <g transform="rotate(-1 50 145) translate(28 2) scale(1.7)">${card('leaf')}</g>
    <g transform="rotate(15 50 145) translate(118 26) scale(1.7)">${card('heart')}</g>
  </g>

  <!-- title block -->
  <g font-family="Segoe UI, Arial, sans-serif">
    <text x="620" y="222" font-size="96" font-weight="800" fill="${CREAM}">Bela</text>
    <text x="620" y="318" font-size="96" font-weight="800" fill="${GOLD}">Štih</text>
    <text x="622" y="374" font-size="30" fill="${CREAM}" opacity="0.85">Prava bela s prijateljima</text>
    <text x="622" y="412" font-size="24" fill="${CREAM}" opacity="0.6">besplatno · bez prijave · bez reklama</text>
  </g>
</svg>`;

function render(name, svg, width) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();
  writeFileSync(join(OUT, name), png);
  console.log(`  ${name}  ${(png.length / 1024).toFixed(0)}KB`);
}

console.log('Writing store assets to', OUT);
render('feature-graphic.png', feature, 1024);

// The 512x512 listing icon: same mark as the launcher.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${FELT}"/>
  <g transform="translate(97 97) scale(3.17)">
    <path d="${leafPath}" fill="${LEAF}"/>
    <path d="M48 30h4v60h-4z" fill="${VEIN}"/>
  </g>
</svg>`;
render('icon-512.png', icon, 512);
