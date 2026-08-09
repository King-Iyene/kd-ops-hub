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
import { getCorsHeaders } from "../_shared/cors.ts";

const WINDOW_MIN = 15;
const MAX_ATTEMPTS = 5;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    // Lockout is scoped to (email + requesting IP), not email alone. Keying on
    // email alone let anyone lock any account out of their genuine session by
    // POSTing 'record' five times from anywhere (a denial-of-service). Scoping
    // to the IP means an attacker can only block their own IP for that email —
    // the real owner, on their own IP, is unaffected — while still throttling
    // brute force from a single source.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ip_hash = ip ? await sha256(ip) : null;

    const countAttempts = async (): Promise<number> => {
      let q = service
        .from("failed_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("email", email)
        .gte("attempted_at", cutoff);
      // When we have an IP, scope to it; null-IP requests fall back to email.
      q = ip_hash ? q.eq("ip_hash", ip_hash) : q.is("ip_hash", null);
      const { count } = await q;
      return count ?? 0;
    };

    if (action === "check") {
      const count = await countAttempts();
      const blocked = count >= MAX_ATTEMPTS;
      return json({ blocked, remainingMinutes: blocked ? WINDOW_MIN : 0, attempts: count });
    }

    if (action === "record") {
      await service.from("failed_login_attempts").insert({
        email,
        ip_hash,
        user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        reason: body?.reason ?? "invalid_credentials",
      });
      const count = await countAttempts();
      const blocked = count >= MAX_ATTEMPTS;
      return json({ ok: true, attempts: count, blocked });
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
