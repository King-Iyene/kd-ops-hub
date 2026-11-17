/**
 * site-icons: official logos for the sites and apps shown in Time Tracking reports.
 *
 * The browser never contacts a favicon service itself (so ad-blockers and privacy tools cannot break
 * it, and viewers' browsers do not tell a third party which sites staff visit). The browser asks this
 * function for a batch of domains; it returns crisp PNGs (up to 128px) as data URLs, fetching each
 * logo once on the server and caching it in time_site_icons.
 *
 * Only bare domain names are ever sent onward (never paths, people or company details).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_DOMAINS = 60;
const MAX_BYTES = 90_000;
const HIT_TTL_MS = 60 * 24 * 3600 * 1000; // good icons are kept 60 days
const MISS_TTL_MS = 3 * 24 * 3600 * 1000; // "no icon found" is retried after 3 days

function json(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
}

async function toDataUrl(res: Response): Promise<string | null> {
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 120 || buf.length > MAX_BYTES) return null; // empty / placeholder / too big
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${type.split(';')[0]};base64,${btoa(bin)}`;
}

/** Best quality first: Google's 128px favicon service, then DuckDuckGo's. */
async function fetchLogo(domain: string): Promise<string | null> {
  const sources = [
    `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: 'follow' });
      const data = await toDataUrl(res);
      if (data) return data;
    } catch {
      // try the next source
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, req);

  // Signed-in users only.
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: 'Not signed in' }, 401, req);

  let body: { domains?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400, req); }
  const domains = [...new Set((Array.isArray(body.domains) ? body.domains : [])
    .map((d) => String(d).trim().toLowerCase().replace(/^www\./, ''))
    .filter((d) => d.length <= 120 && DOMAIN_RE.test(d)))].slice(0, MAX_DOMAINS);
  if (domains.length === 0) return json({ icons: {} }, 200, req);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cached } = await admin.from('time_site_icons').select('domain, icon, fetched_at').in('domain', domains);
  const now = Date.now();
  const icons: Record<string, string | null> = {};
  const todo: string[] = [];
  const known = new Map((cached ?? []).map((r) => [r.domain as string, r]));
  for (const d of domains) {
    const row = known.get(d);
    const age = row ? now - new Date(row.fetched_at as string).getTime() : Infinity;
    if (row && ((row.icon && age < HIT_TTL_MS) || (!row.icon && age < MISS_TTL_MS))) icons[d] = (row.icon as string | null) ?? null;
    else todo.push(d);
  }

  // Fetch the missing ones, 8 at a time.
  const fresh: { domain: string; icon: string | null; fetched_at: string }[] = [];
  for (let i = 0; i < todo.length; i += 8) {
    const chunk = todo.slice(i, i + 8);
    const got = await Promise.all(chunk.map(async (d) => ({ domain: d, icon: await fetchLogo(d), fetched_at: new Date().toISOString() })));
    fresh.push(...got);
  }
  if (fresh.length > 0) {
    await admin.from('time_site_icons').upsert(fresh, { onConflict: 'domain' });
    for (const f of fresh) icons[f.domain] = f.icon;
  }
  return json({ icons }, 200, req);
});
