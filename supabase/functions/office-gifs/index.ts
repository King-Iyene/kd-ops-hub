// supabase/functions/office-gifs/index.ts
//
// GIF search for Office chat. Asks GIPHY on the signed-in person's behalf so the key never reaches the browser.
// Does nothing until the secret GIPHY_API_KEY exists (a free key from developers.giphy.com); without it the answer is
// { configured: false, gifs: [] } and the chat says GIFs are not set up yet.
//
// Auth: any signed-in KD Ops user (JWT checked here, deployed --no-verify-jwt).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";

interface GiphyImage { url?: string; width?: string; height?: string }
interface GiphyItem { id?: string; title?: string; images?: Record<string, GiphyImage | undefined> }

/** Only GIPHY's own picture hosts are ever handed to the chat (the same rule the app applies before showing one). */
const OK_HOST = /^https:\/\/(media\d*|i)\.giphy\.com\//;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(jwt);
    if (error || !data?.user) return json({ error: "unauthorized" }, 401);

    const key = Deno.env.get("GIPHY_API_KEY");
    if (!key) return json({ configured: false, gifs: [] });

    const body = (await req.json().catch(() => ({}))) as { q?: unknown };
    const q = typeof body.q === "string" ? body.q.trim().slice(0, 60) : "";
    const params = new URLSearchParams({ api_key: key, limit: "24", rating: "pg", lang: "en" });
    if (q) params.set("q", q);
    const r = await fetch(`https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}?${params}`);
    if (!r.ok) return json({ configured: true, gifs: [], error: `giphy ${r.status}` });
    const out = (await r.json()) as { data?: GiphyItem[] };
    const gifs = (out.data ?? []).flatMap((g) => {
      const small = g.images?.fixed_width_small ?? g.images?.fixed_width;
      const full = g.images?.downsized ?? g.images?.fixed_width;
      if (!g.id || !small?.url || !full?.url || !OK_HOST.test(small.url) || !OK_HOST.test(full.url)) return [];
      return [{ id: g.id, title: (g.title ?? "").slice(0, 80), preview: small.url, url: full.url, w: Number(full.width) || 0, h: Number(full.height) || 0 }];
    });
    return json({ configured: true, gifs });
  } catch (e) {
    return json({ configured: true, gifs: [], error: String((e as Error)?.message ?? e) });
  }
});
