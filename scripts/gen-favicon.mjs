// Generate a proper multi-resolution favicon.ico from public/favicon-32.png.
// favicon.ico shipped with the Lovable starter template was branded "lovable"
// — replacing it here with our own KD logo at multiple resolutions so the
// browser tab icon lands correctly even on the legacy ICO path.

import pngToIco from 'png-to-ico';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PUBLIC = join(process.cwd(), 'public');
const SRC = join(PUBLIC, 'favicon-32.png');

// ICO files traditionally embed multiple resolutions so the OS picks the
// best one for context (taskbar, tab, jumplist). Build 16/32/48 from
// our 32-px source.
const sizes = [16, 32, 48];
const buffers = [];
for (const size of sizes) {
  const buf = await sharp(readFileSync(SRC)).resize(size, size).png().toBuffer();
  buffers.push(buf);
}

const icoBuf = await pngToIco(buffers);
writeFileSync(join(PUBLIC, 'favicon.ico'), icoBuf);
console.log(`wrote favicon.ico (${icoBuf.length} bytes, ${sizes.join('×')} resolutions)`);
