#!/usr/bin/env node
// Upload rendered walkthrough videos to Supabase Storage (guide-videos bucket).
// Usage: node upload-videos.mjs
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars (or .env in parent dir)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config({ path: join(import.meta.dirname, '..', '.env') });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const outDir = join(import.meta.dirname, 'out');
const files = readdirSync(outDir).filter(f => f.endsWith('.mp4'));

console.log(`Found ${files.length} videos to upload`);

for (const file of files.sort()) {
  const filePath = join(outDir, file);
  const fileData = readFileSync(filePath);
  console.log(`Uploading ${file} (${(fileData.length / 1024 / 1024).toFixed(1)} MB)...`);

  const { error } = await supabase.storage
    .from('guide-videos')
    .upload(file, fileData, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (error) {
    console.error(`  Failed: ${error.message}`);
  } else {
    const { data } = supabase.storage.from('guide-videos').getPublicUrl(file);
    console.log(`  Done: ${data.publicUrl}`);
  }
}

console.log('\nAll uploads complete.');
