// Generate KD-branded PWA icons (192, 512, maskable 512) plus apple-touch-icon.
// Brand colour #006994 background, white "KD" wordmark, rounded corners on
// non-maskable variants.

import sharp from 'sharp';
import { writeFileSync } from 'fs';

const BRAND = '#006994';
const BRAND_LIGHT = '#0090c8';

// SVG for the "any" variant — has a rounded square + KD text.
const svgRound = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_LIGHT}"/>
      <stop offset="100%" stop-color="${BRAND}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#g)"/>
  <text
    x="50%" y="50%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="Inter, Arial, sans-serif"
    font-size="${Math.round(size * 0.42)}"
    font-weight="800"
    fill="#ffffff"
    letter-spacing="-${Math.round(size * 0.012)}"
  >KD</text>
</svg>
`;

// Maskable: full-bleed brand background with the logo in the inner safe zone
// (~64% — Android crops outer ~18% per spec). No rounded corners.
const svgMaskable = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BRAND}"/>
  <text
    x="50%" y="50%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="Inter, Arial, sans-serif"
    font-size="${Math.round(size * 0.32)}"
    font-weight="800"
    fill="#ffffff"
  >KD</text>
</svg>
`;

const targets = [
  { name: 'icon-192.png', svg: svgRound(192), size: 192 },
  { name: 'icon-512.png', svg: svgRound(512), size: 512 },
  { name: 'icon-maskable-512.png', svg: svgMaskable(512), size: 512 },
  { name: 'apple-touch-icon.png', svg: svgRound(180), size: 180 },
];

for (const t of targets) {
  const buf = await sharp(Buffer.from(t.svg))
    .resize(t.size, t.size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(`/home/user/kd-ops-hub/public/${t.name}`, buf);
  console.log(`wrote ${t.name} (${buf.length} bytes)`);
}

// Favicon — 32x32 ICO (single-resolution, browser scales as needed).
const favBuf = await sharp(Buffer.from(svgRound(64))).resize(32, 32).png().toBuffer();
writeFileSync('/home/user/kd-ops-hub/public/favicon-32.png', favBuf);
console.log(`wrote favicon-32.png`);
