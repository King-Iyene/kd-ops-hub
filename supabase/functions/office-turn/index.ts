// supabase/functions/office-turn/index.ts
//
// Hands the Virtual Office short-lived TURN relay credentials from Cloudflare
// (free tier) so voice/video works on strict networks. Does nothing until the
// two secrets exist:  CF_TURN_KEY_ID  and  CF_TURN_API_TOKEN
// Without them it returns { iceServers: [] } and the office keeps using STUN.
//
// Auth: any signed-in KD Ops user (JWT checked here, deployed --no-verify-jwt).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";

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

    const keyId = Deno.env.get("CF_TURN_KEY_ID");
    const token = Deno.env.get("CF_TURN_API_TOKEN");
    if (!keyId || !token) return json({ iceServers: [], configured: false });

    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!r.ok) return json({ iceServers: [], configured: true, error: `cloudflare ${r.status}` });
    const out = await r.json();
    return json({ iceServers: out.iceServers ?? [], configured: true });
  } catch (e) {
    return json({ iceServers: [], error: String((e as Error)?.message ?? e) });
  }
});
