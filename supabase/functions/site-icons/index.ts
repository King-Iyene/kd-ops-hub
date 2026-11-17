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
// Anything cached before the logo lookup was improved is looked up again (bump when the lookup changes).
const CACHE_EPOCH = Date.parse('2026-11-17T22:30:00Z');

function json(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
}

async function toDataUrl(res: Response): Promise<{ url: string; width: number } | null> {
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') ?? '').split(';')[0];
  if (!type.startsWith('image/')) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 120 || buf.length > MAX_BYTES) return null; // empty / placeholder / too big
  // PNG width is stored at bytes 16-19; other formats count as unknown (0)
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const width = isPng ? ((buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19]) : type === 'image/svg+xml' ? 128 : 0;
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { url: `data:${type};base64,${btoa(bin)}`, width };
}

const SAFE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const isIp = (h: string) => /^[0-9.]+$/.test(h) || h.includes(':');

/** app.gohighlevel.com -> gohighlevel.com, eu2.make.com -> make.com (the brand's own site usually has the real logo). */
function rootDomain(d: string): string {
  const parts = d.split('.');
  if (parts.length <= 2) return d;
  const twoPartTld = /^(co|com|org|net|gov|ac)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts.slice(twoPartTld ? -3 : -2).join('.');
}

async function grab(url: string, accept = 'image/*'): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KDOpsIcons/1.0)', Accept: accept } });
  } catch {
    return null;
  }
}

/** The icons a site declares in its own page: apple-touch-icon first, then the biggest <link rel="icon">. */
async function declaredIcons(domain: string): Promise<string[]> {
  const res = await grab(`https://${domain}/`, 'text/html');
  if (!res || !res.ok) return [];
  const html = (await res.text()).slice(0, 250_000);
  const found: { href: string; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (!rel.includes('icon') || rel.includes('mask')) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const size = parseInt(/sizes=["'](\d+)x\d+/i.exec(tag)?.[1] ?? '0', 10);
    try {
      const u = new URL(href, res.url || `https://${domain}/`);
      if (u.protocol !== 'https:' || isIp(u.hostname) || !SAFE_HOST.test(u.hostname)) continue; // never follow icons to internal or odd hosts
      found.push({ href: u.toString(), score: (rel.includes('apple-touch') ? 1000 : 0) + (u.pathname.endsWith('.svg') ? 400 : 0) + size });
    } catch { /* bad href */ }
  }
  return found.sort((x, y) => y.score - x.score).slice(0, 3).map((f) => f.href);
}

/** The sharpest logo available for one domain: stops at the first one 96px or bigger, else keeps the largest. */
async function bestFor(domain: string): Promise<{ url: string; width: number } | null> {
  const urls = [
    `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`,
    ...(await declaredIcons(domain)),
    `https://${domain}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];
  let best: { url: string; width: number } | null = null;
  for (const src of urls) {
    const res = await grab(src);
    if (!res) continue;
    const got = await toDataUrl(res);
    if (!got) continue;
    if (got.width >= 96) return got;
    if (!best || got.width > best.width) best = got;
  }
  return best;
}

/** Tries the exact site first, then the brand's main site, and keeps whichever logo is sharper. */
async function fetchLogo(domain: string): Promise<string | null> {
  const first = await bestFor(domain);
  if (first && first.width >= 96) return first.url;
  const root = rootDomain(domain);
  const second = root !== domain ? await bestFor(root) : null;
  const pick = [first, second].filter(Boolean).sort((x, y) => (y!.width || 0) - (x!.width || 0))[0];
  return pick?.url ?? null;
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
    // small (low-resolution) icons are re-checked daily so a sharper source can replace them
    const small = !!row?.icon && (row.icon as string).length < 2500;
    const ttl = row?.icon ? (small ? 24 * 3600 * 1000 : HIT_TTL_MS) : MISS_TTL_MS;
    const stale = !!row && new Date(row.fetched_at as string).getTime() < CACHE_EPOCH;
    if (row && !stale && age < ttl) icons[d] = (row.icon as string | null) ?? null;
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
