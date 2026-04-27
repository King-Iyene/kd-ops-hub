// supabase/functions/record-failed-login/index.ts
//
// Two responsibilities:
//
//   POST { action: 'check', email }
//     Returns whether this email is currently rate-limited
//     ({ blocked, remainingMinutes }). Does NOT record anything.
//
//   POST { action: 'record', email, reason? }
//     Records a failed attempt. Returns the count of attempts in the
//     last 15 minutes after recording.
//
// No auth required — these are pre-login. We use service-role key
// internally to write to the table (which has RLS read-only).
//
// IP is hashed (sha-256) so the table doesn't store raw IPs.
//
// Deploy:
//   supabase functions deploy record-failed-login --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WINDOW_MIN = 15;
const MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    const email = (body?.email as string | undefined)?.toLowerCase().trim();
    if (!email || !action) return json({ error: "Missing email or action" }, 400);

    const cutoff = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

    if (action === "check") {
      const { count } = await service
        .from("failed_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("email", email)
        .gte("attempted_at", cutoff);
      const blocked = (count ?? 0) >= MAX_ATTEMPTS;
      return json({ blocked, remainingMinutes: blocked ? WINDOW_MIN : 0, attempts: count ?? 0 });
    }

    if (action === "record") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
      const ip_hash = ip ? await sha256(ip) : null;
      await service.from("failed_login_attempts").insert({
        email,
        ip_hash,
        user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        reason: body?.reason ?? "invalid_credentials",
      });
      const { count } = await service
        .from("failed_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("email", email)
        .gte("attempted_at", cutoff);
      const blocked = (count ?? 0) >= MAX_ATTEMPTS;
      return json({ ok: true, attempts: count ?? 0, blocked });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
