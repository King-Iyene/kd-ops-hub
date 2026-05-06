// Generate KD Squares branded PWA icons.
//
// Two modes:
//   1. If `public/logo-source.{png,svg,jpg,webp}` exists, USE that file —
//      the actual KD Squares logo. It's composited on a brand background
//      for the maskable + apple variants (Android/iOS need full-bleed)
//      and on a transparent rounded square for the regular variants.
//   2. Otherwise fall back to the "KD" text wordmark on a brand gradient.
//
// Run: `node scripts/gen-icons.mjs` from the repo root.

import sharp from 'sharp';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PUBLIC = join(process.cwd(), 'public');
const BRAND = '#006994';
const BRAND_LIGHT = '#0090c8';

// Look for an actual logo file the user dropped into public/.
const LOGO_CANDIDATES = ['logo-source.png', 'logo-source.svg', 'logo-source.jpg', 'logo-source.webp'];
const logoPath = LOGO_CANDIDATES.map((n) => join(PUBLIC, n)).find(existsSync);

if (logoPath) {
  console.log(`Using real logo: ${logoPath}`);
} else {
  console.log('No public/logo-source.{png,svg,jpg,webp} found — using "KD" wordmark fallback.');
  console.log('Drop your real logo at public/logo-source.png to use it instead.');
}

// Fallback SVGs when no logo file is present.
const svgKDRound = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_LIGHT}"/>
      <stop offset="100%" stop-color="${BRAND}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Inter, Arial, sans-serif" font-size="${Math.round(size * 0.42)}"
        font-weight="800" fill="#ffffff">KD</text>
</svg>`;

const svgKDFlat = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BRAND}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Inter, Arial, sans-serif" font-size="${Math.round(size * 0.32)}"
        font-weight="800" fill="#ffffff">KD</text>
</svg>`;

// Generate one icon. Pure-logo style — the actual KD logo on a transparent
// background, no brand-blue surface, no rounded square. The home-screen
// shows just the logomark like a sticker. Padding is kept minimal so the
// logo reads as large as possible inside the canvas.
async function makeIcon({ size, padding }) {
  // No source logo → fall back to the gradient KD wordmark so the icons
  // still look intentional.
  if (!logoPath) {
    return sharp(Buffer.from(svgKDRound(size))).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  }

  const innerSize = Math.round(size * (1 - padding * 2));
  const innerBuf = await sharp(readFileSync(logoPath))
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Transparent canvas, logo composited centered. No background, no mask.
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: innerBuf, top: Math.round((size - innerSize) / 2), left: Math.round((size - innerSize) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const targets = [
  // Generous logo size — minimal padding so the mark reads at small sizes.
  { name: 'icon-192.png',          size: 192, padding: 0.06 },
  { name: 'icon-512.png',          size: 512, padding: 0.06 },
  // Maskable on transparent: Android will crop into a shape; the device
  // wallpaper shows through the transparent area. Keep the logo small so
  // the OS-applied mask doesn't clip the artwork.
  { name: 'icon-maskable-512.png', size: 512, padding: 0.18 },
  // iOS shows a white background under transparent apple-touch icons.
  // Keep the icon transparent — iOS users will get the logo on a white
  // tile; matches what the user asked for ("no other background color").
  { name: 'apple-touch-icon.png',  size: 180, padding: 0.10 },
];

for (const t of targets) {
  const buf = await makeIcon(t);
  writeFileSync(join(PUBLIC, t.name), buf);
  console.log(`wrote ${t.name} (${buf.length} bytes)`);
}

const favBuf = await makeIcon({ size: 32, padding: 0.04 });
writeFileSync(join(PUBLIC, 'favicon-32.png'), favBuf);
console.log(`wrote favicon-32.png`);
