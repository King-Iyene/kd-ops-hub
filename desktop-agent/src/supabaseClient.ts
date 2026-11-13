import { createClient } from '@supabase/supabase-js';

// Same Supabase project as the web app — same Auth, same RLS, no second
// user system. Values come from the agent's own .env (see .env.example),
// not from the web app's Vite env (this isn't a Vite process).
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY — copy .env.example to .env and fill it in.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
