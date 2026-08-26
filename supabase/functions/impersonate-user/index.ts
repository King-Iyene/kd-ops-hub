// supabase/functions/impersonate-user/index.ts
//
// Mints a one-time sign-in token that lets a Super Admin start a real,
// fully-authenticated session as another user ("log in as Chris"),
// via Supabase Admin's generateLink (magiclink). This does NOT touch the
// target's password or invalidate their own active sessions elsewhere —
// it only issues a fresh, separate credential the caller's browser can
// redeem to become that user for this browser session.
//
// Body: { target_user_id: string }
//
// Auth: requires a super_admin JWT. No other role may call this — this
// is an auth-bypass primitive, kept as narrow as the app's admin role
// hierarchy allows.
//
// The client is responsible for:
//   1. Logging 'user_impersonation_started' (client-side, still authed as
//      the real admin) BEFORE calling this function.
//   2. Storing its own current refresh_token so it can restore the real
//      admin session later via supabase.auth.refreshSession({refresh_token}).
//   3. Redeeming the returned token_hash via
//      supabase.auth.verifyOtp({ type: 'magiclink', token_hash }).
//   4. Logging 'user_impersonation_ended' after restoring the admin
//      session on exit.
//
// Deploy: supabase functions deploy impersonate-user --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const service = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user: caller } } = await userClient.auth.getUser(bearer);
    if (!caller) {
      return json({ ok: false, error: "Not authenticated" }, 401);
    }

    const { data: callerProfile } = await service
      .from("profiles")
      .select("role, full_name, status")
      .eq("id", caller.id)
      .single();
    if (!callerProfile || callerProfile.role !== "super_admin") {
      return json({ ok: false, error: "Only super_admin can impersonate another user" }, 403);
    }
    if (callerProfile.status && callerProfile.status !== "active") {
      return json({ ok: false, error: "Your account is not active" }, 403);
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return json({ ok: false, error: "target_user_id required" }, 400);
    }
    if (target_user_id === caller.id) {
      return json({ ok: false, error: "You are already signed in as this account" }, 400);
    }

    const { data: target } = await service
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("id", target_user_id)
      .single();
    if (!target || !target.email) {
      return json({ ok: false, error: "Target user not found" }, 404);
    }
    if (target.status && !["active", "invited"].includes(target.status)) {
      return json({ ok: false, error: `Cannot impersonate a ${target.status} account` }, 400);
    }

    const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ ok: false, error: linkErr?.message || "Could not generate sign-in token" }, 500);
    }

    return json({
      ok: true,
      token_hash: linkData.properties.hashed_token,
      target: { id: target.id, email: target.email, full_name: target.full_name },
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
