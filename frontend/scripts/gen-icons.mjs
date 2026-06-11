// Rasterizes public/favicon.svg into the PNG icon set + an OG banner.
// Run after changing the logo:  npm i --no-save sharp && node scripts/gen-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync('public/favicon.svg');
const DARK = '#0e1118';

const icons = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'apple-touch-icon.png': 180,
  'favicon-32.png': 32,
  'favicon-16.png': 16,
};
for (const [name, size] of Object.entries(icons)) {
  await sharp(svg, { density: 512 }).resize(size, size).flatten({ background: DARK }).png().toFile('public/' + name);
  console.log('wrote', name);
}

// Maskable icon: the mark centered with ~20% safe-area padding on a solid square.
const inner = await sharp(svg, { density: 512 }).resize(330, 330).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: DARK } })
  .composite([{ input: inner, gravity: 'center' }]).png().toFile('public/icon-maskable.png');
console.log('wrote icon-maskable.png');

// Open Graph / Twitter share banner (1200x630).
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><radialGradient id="g" cx="80%" cy="-10%" r="100%">
    <stop offset="0" stop-color="#241606"/><stop offset=".45" stop-color="#0e1118"/><stop offset="1" stop-color="#090b10"/>
  </radialGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(110,205) scale(3.4)">
    <g transform="rotate(135 32 32)">
      <circle cx="32" cy="32" r="20" fill="none" stroke="#363d4b" stroke-width="6" stroke-linecap="round" stroke-dasharray="94.2 125.6"/>
      <circle cx="32" cy="32" r="20" fill="none" stroke="#ff9f1c" stroke-width="6" stroke-linecap="round" stroke-dasharray="60 125.6"/>
    </g>
    <line x1="32" y1="32" x2="44" y2="21" stroke="#ff9f1c" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="5.5" fill="#ff9f1c"/><circle cx="32" cy="32" r="2.2" fill="#0e1118"/>
  </g>
  <text x="410" y="300" font-family="Arial, sans-serif" font-size="98" font-weight="700" fill="#e9edf5">HrvaDrive</text>
  <text x="414" y="356" font-family="Arial, sans-serif" font-size="33" fill="#8a93a6">OBD2 drive intelligence</text>
  <text x="414" y="410" font-family="Arial, sans-serif" font-size="30" fill="#ff9f1c">summary · map · eco &amp; cost tips · engine insights</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile('public/og-image.png');
console.log('wrote og-image.png');
