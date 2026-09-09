import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FELT, markSvg } from './brand.mjs';

/**
 * Generates the app icons from drawn SVG — no binary art to keep in the repo
 * and no licensing questions.
 *
 * The mark is two fanned mađarice cards, an acorn and a heart, on felt in a
 * thin matte-gold rim: unmistakably a pack of cards, and deliberately NOT
 * casino imagery. Chips, dice and slot reels are what push the IARC
 * questionnaire toward a "Simulated Gambling" descriptor and PEGI 18. The
 * cards are the deck's own pips (apps/mobile/brand/paths.json), so the icon,
 * the store art and the cards on the table are one drawing.
 *
 *   node scripts/make-icons.mjs
 */

const OUT = join(process.cwd(), 'apps', 'mobile', 'assets');

function render(name, svg, width) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
    .render()
    .asPng();
  writeFileSync(join(OUT, name), png);
  console.log(`  ${name}  ${width}x${width}  ${(png.length / 1024).toFixed(0)}KB`);
}

console.log('Writing icons to', OUT);

// Store / launcher icon: the whole mark, full bleed (the platform rounds it).
render('icon.png', markSvg({ size: 1024 }), 1024);

// Adaptive icon: the inner ~66% is the only guaranteed-visible area, so the
// cards sit well inside it and the background is the felt alone.
render('android-icon-foreground.png', markSvg({ size: 1024, bg: false, cardScale: 0.26 }), 1024);
render(
  'android-icon-background.png',
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${FELT}"/></svg>`,
  1024,
);
render('android-icon-monochrome.png', markSvg({ size: 1024, bg: false, cardScale: 0.26, mono: '#ffffff' }), 1024);

// Splash mark sits on the themed background from app.json.
render('splash-icon.png', markSvg({ size: 1024, bg: false, cardScale: 0.34 }), 1024);
render('favicon.png', markSvg({ size: 96, cardScale: 0.42 }), 96);

console.log('Done.');
