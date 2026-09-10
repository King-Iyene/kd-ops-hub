import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

function json(body: Record<string, unknown>, status: number, req?: Request): Response {
  const cors = req ? getCorsHeaders(req) : { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const BLOCKED_HOST_RE = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[::1?\])$/i;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  // Require a valid Supabase session (prevents unauthenticated SSRF)
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization' }, 401, req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser(authHeader.slice(7));
  if (authError || !userData?.user) {
    return json({ error: 'Invalid or expired session' }, 401, req);
  }

  try {
    const { url, method = 'POST', headers = {}, payload } = await req.json();

    if (!url || typeof url !== 'string') {
      return json({ error: 'url is required' }, 400, req);
    }

    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return json({ error: 'Only http/https URLs are allowed' }, 400, req);
    }

    // Block internal/private network addresses (SSRF protection)
    if (BLOCKED_HOST_RE.test(parsed.hostname)) {
      return json({ error: 'Internal/private URLs are not allowed' }, 400, req);
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: method !== 'GET' ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    return json({ ok: res.ok, status: res.status }, 200, req);
  } catch (err) {
    const msg = (err as Error).message;
    return json({ ok: false, error: msg }, 502, req);
  }
});
