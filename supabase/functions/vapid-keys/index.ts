// supabase/functions/vapid-keys/index.ts
//
// Generates and rotates VAPID keypairs for the platform's web-push setup.
// Uses the Web Crypto API (native in Deno) instead of the web-push npm
// package, which relies on Node crypto polyfills that produce invalid keys
// in Deno/Supabase edge functions.
//
// Actions:
//   action: "generate" — admin/super_admin only. Creates a new VAPID
//                        keypair, writes both keys to company_settings,
//                        invalidates ALL existing push subscriptions.
//   action: "status"   — any authenticated user. Returns whether the
//                        platform has VAPID keys configured (boolean).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { encode as b64encode } from "https://deno.land/std@0.224.0/encoding/base64url.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const PRIVILEGED = new Set(["super_admin", "admin"]);

async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );

  const pubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return {
    publicKey: b64encode(new Uint8Array(pubRaw)),
    privateKey: privJwk.d!,
  };
}

Deno.serve(async (req) => {
  const headers = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const body = await req.json();
    const { action } = body;
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

      const keys = await generateVapidKeys();
      const subjectFinal = body.subject || "mailto:code@kdsquares.com";

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
