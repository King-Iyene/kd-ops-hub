// supabase/functions/vapid-keys/index.ts
//
// Generates and rotates VAPID keypairs for the platform's web-push setup.
// Replaces the CLI step (`npx web-push generate-vapid-keys`) — admins click
// a button in KD Ops Settings → Notifications and the keys are minted +
// stored server-side in one round-trip.
//
// Actions:
//   action: "generate" — admin/super_admin only. Creates a new VAPID
//                        keypair, writes both keys to company_settings,
//                        invalidates ALL existing push subscriptions
//                        (because they were signed with the old public key).
//   action: "status"   — any authenticated user. Returns whether the
//                        platform has VAPID keys configured (boolean).
//                        Public key is fetched separately via the RPC.
//
// Why server-side: the private key must never leave the server. Generating
// in the browser would mean shipping the private half to the client first,
// defeating the whole point.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import * as webPush from "https://esm.sh/web-push@3.6.7";

const ALLOWED_ORIGINS = [
  "https://ops.kdsquares.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const PRIVILEGED = new Set(["super_admin", "admin"]);

serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const { action } = await req.json();
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user } } = await anonClient.auth.getUser(jwt);
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── status: does the platform have VAPID keys yet? ────────────────────
    if (action === "status") {
      const { data } = await service
        .from("company_settings")
        .select("vapid_public_key, vapid_subject")
        .eq("id", COMPANY_ID)
        .maybeSingle();
      const pub = (data as any)?.vapid_public_key;
      return new Response(
        JSON.stringify({
          configured: !!pub,
          public_key: pub ?? null,
          subject: (data as any)?.vapid_subject ?? null,
        }),
        { headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    // ── generate: admin/super_admin only ──────────────────────────────────
    if (action === "generate") {
      const { data: profile } = await service
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const role = (profile as any)?.role;
      if (!role || !PRIVILEGED.has(role)) {
        return new Response(
          JSON.stringify({ error: "Only Admin or Super Admin can generate VAPID keys." }),
          { status: 403, headers: { ...headers, "Content-Type": "application/json" } },
        );
      }

      const keys = webPush.generateVAPIDKeys();
      const { subject } = (await req.json().catch(() => ({}))) as { subject?: string };
      const subjectFinal = subject || "mailto:code@kdsquares.com";

      await service
        .from("company_settings")
        .update({
          vapid_public_key: keys.publicKey,
          vapid_private_key: keys.privateKey,
          vapid_subject: subjectFinal,
        })
        .eq("id", COMPANY_ID);

      // Existing subscriptions were signed with the OLD public key — drop
      // them all so users get prompted to re-subscribe with the new one.
      await service.from("push_subscriptions").delete().neq("user_id", null);

      return new Response(
        JSON.stringify({
          ok: true,
          public_key: keys.publicKey,
          subject: subjectFinal,
          subscriptions_invalidated: true,
        }),
        { headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vapid-keys] fatal:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
