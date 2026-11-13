import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL as BAKED_URL, SUPABASE_ANON_KEY as BAKED_ANON_KEY } from './generated-config';

// Same Supabase project as the web app — same Auth, same RLS, no second
// user system.
//
// Resolution order:
//   1. process.env (dotenv's `.env`, for local `npm start` development —
//      see .env.example)
//   2. the baked values written into src/generated-config.ts at build time
//      (scripts/write-config.js), which is what a packaged installer ships
//      with since there's no .env next to an installed app.
const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || BAKED_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim() || BAKED_ANON_KEY;

export const configError =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'This app build is missing its Supabase connection details. Contact your admin — the installer needs to be rebuilt with SUPABASE_ANON_KEY set.'
    : null;

// Never throw here: a packaged app with a missing key should show a clear
// on-screen message (see main.ts / renderer), not crash on launch.
export const supabase: SupabaseClient | null = configError
  ? null
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
