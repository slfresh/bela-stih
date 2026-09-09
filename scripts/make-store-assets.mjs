import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CREAM, fan, feltDefs, markSvg, wordmark } from './brand.mjs';

/**
 * Play Store listing assets, drawn from the same hand as the app: felt, gold,
 * and the deck's own mađarice pips (apps/mobile/brand/paths.json, through
 * scripts/brand.mjs — the same drawing as the launcher icon). No stock art;
 * the wordmark's text renders in the system's Segoe UI, which resvg loads
 * from Windows, until the outlined mark lands.
 *
 *   node scripts/make-store-assets.mjs
 */

const OUT = join(process.cwd(), 'apps', 'mobile', 'store');
mkdirSync(OUT, { recursive: true });

const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>${feltDefs('felt')}</defs>
  <rect width="1024" height="500" fill="url(#felt)"/>
  <ellipse cx="512" cy="250" rx="470" ry="215" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="2"/>

  <!-- the fan: all four suits of the mađarice -->
  ${fan(['acorns', 'leaves', 'hearts', 'bells'], { cx: 300, cy: 250, cardW: 150, spread: 42 })}

  <!-- the mark, outlined: the same shape as on the launcher and in the app -->
  ${wordmark({ x: 560, baselineY: 262, height: 150 })}
  <g font-family="Segoe UI, Arial, sans-serif">
    <text x="562" y="330" font-size="30" fill="${CREAM}" opacity="0.85">Prava bela s prijateljima</text>
    <text x="562" y="368" font-size="24" fill="${CREAM}" opacity="0.6">besplatno · bez prijave · bez reklama</text>
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

// The 512x512 listing icon: the very mark on the launcher.
render('icon-512.png', markSvg({ size: 512 }), 512);
