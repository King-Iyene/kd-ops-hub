import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
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
export const supabaseUrl = SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim() || BAKED_ANON_KEY;

export const configError =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'This app build is missing its Supabase connection details. Contact your admin — the installer needs to be rebuilt with SUPABASE_ANON_KEY set.'
    : null;

// Never throw here: a packaged app with a missing key should show a clear
// on-screen message (see main.ts / renderer), not crash on launch.
//
// realtime.transport: createClient() always eagerly constructs a
// RealtimeClient (this app never calls .channel() / subscribes to anything —
// confirmed by searching this whole source tree — but supabase-js doesn't
// make that client lazy), and that constructor throws synchronously if it
// can't resolve a WebSocket implementation. In a browser there's a native
// `WebSocket` global; in Electron's main process there is not, because
// Electron bundles its own Node.js version (tied to the Electron version,
// not whatever Node the host machine has) and that bundled Node is older
// than the Node 22 the realtime-js library expects for a native global
// WebSocket. This was invisible through every previous build because a
// missing/blank SUPABASE_ANON_KEY (the earlier bug) made configError true,
// which short-circuited this whole branch to `null` — so createClient() was
// never actually called in any packaged build until the key was fixed,
// which is what first surfaced this. The `ws` package is a real, correct
// WebSocket implementation for Node, not a stub — supplying it here matches
// what @supabase/realtime-js itself falls back to in other non-browser
// environments (e.g. Deno/edge runtimes with no native WebSocket).
export const supabase: SupabaseClient | null = configError
  ? null
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    });
