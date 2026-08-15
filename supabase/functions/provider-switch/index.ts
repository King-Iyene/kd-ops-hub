// supabase/functions/provider-switch/index.ts
//
// Handles the single action of flipping company_settings.active_payment_provider
// and/or company_settings.flutterwave_mode. Super_admin only. Every flip is
// preflight-checked, audited into provider_switches, and cache-invalidated.
//
// Deploy: supabase functions deploy provider-switch
// Auth: JWT required, role must be super_admin.
//
// Actions:
//   preflight     — dry run: proves the target provider is reachable and
//                   returns balance. Called by the confirm dialog BEFORE the
//                   confirm button becomes enabled.
//   switch        — actually flip the toggle. Body:
//                   { to_provider: 'paystack' | 'flutterwave',
//                     to_mode?: 'test' | 'live',  -- optional; only flips FW mode
//                     reason: string,             -- required for audit
//                     confirmation: string        -- must equal to_provider.toUpperCase()
//                                                    OR (for mode switch) to_mode.toUpperCase() }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";
const PAYSTACK_BASE = "https://api.paystack.co";

const ALLOWED_ORIGINS = [
  "https://ops.kdsquares.com",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

// ─────────────────────────────────────────────────────────────────────────
// Preflight probes: hit the target provider's balance endpoint. On success,
// return { ok, balance }; on failure return { ok:false, error }. This is the
// single most important guard — we NEVER let a switch happen unless the target
// is actually reachable with the currently configured secrets.
// ─────────────────────────────────────────────────────────────────────────
async function probeFlutterwave(mode: "test" | "live"): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const secret = mode === "live"
    ? Deno.env.get("FLUTTERWAVE_SECRET_KEY_LIVE")
    : Deno.env.get("FLUTTERWAVE_SECRET_KEY_TEST");
  if (!secret) {
    return { ok: false, error: `FLUTTERWAVE_SECRET_KEY_${mode.toUpperCase()} is not set in Supabase secrets.` };
  }
  try {
    const res = await fetch(`${FLUTTERWAVE_BASE}/balances/NGN`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.status === "error") {
      return { ok: false, error: body?.message || `Flutterwave HTTP ${res.status}` };
    }
    return { ok: true, balance: Number(body?.data?.available_balance ?? 0) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Network error contacting Flutterwave" };
  }
}

async function probePaystack(mode: "test" | "live"): Promise<{ ok: boolean; balance?: number; error?: string }> {
  // Mode-specific env vars first, then legacy fallback, then DB.
  const envName = mode === "live" ? "PAYSTACK_SECRET_KEY_LIVE" : "PAYSTACK_SECRET_KEY_TEST";
  let secret = Deno.env.get(envName) ?? Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) {
    try {
      const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await svc.from("company_settings")
        .select("paystack_secret_key_enc").eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle();
      secret = (data as any)?.paystack_secret_key_enc;
    } catch { /* fall through */ }
  }
  if (!secret) {
    return { ok: false, error: `${envName} (or PAYSTACK_SECRET_KEY) is not set.` };
  }
  return await probePaystackWith(secret);
}

async function probePaystackWith(secret: string): Promise<{ ok: boolean; balance?: number; error?: string }> {
  try {
    const res = await fetch(`${PAYSTACK_BASE}/balance`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.status === false) {
      return { ok: false, error: body?.message || `Paystack HTTP ${res.status}` };
    }
    const ngn = Array.isArray(body.data)
      ? body.data.find((b: any) => b.currency === "NGN")
      : body.data;
    return { ok: true, balance: Number(ngn?.balance ?? 0) / 100 };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Network error contacting Paystack" };
  }
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Auth: everything requires JWT + super_admin role.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return json(cors, { error: "Not authenticated" }, 401);
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await service.from("profiles").select("role, full_name").eq("id", user.id).single();
    if ((profile as any)?.role !== "super_admin") {
      return json(cors, { error: "Only super_admin can change the payment provider or mode" }, 403);
    }

    // Current state.
    const { data: settings } = await service.from("company_settings")
      .select("active_payment_provider, flutterwave_mode, paystack_mode, provider_switched_at, provider_switched_by")
      .eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle();
    const currentProvider = (settings as any)?.active_payment_provider || "paystack";
    const currentFwMode = (settings as any)?.flutterwave_mode || "test";
    const currentPsMode = (settings as any)?.paystack_mode || "live";

    // ────────────────────────────────────────────────────────────────
    // preflight — dry run, no state change
    // ────────────────────────────────────────────────────────────────
    if (action === "preflight") {
      const to = body.to_provider === "flutterwave" ? "flutterwave" : "paystack";
      const toMode = body.to_mode === "live" ? "live" : (body.to_mode === "test" ? "test" : (to === "flutterwave" ? currentFwMode : currentPsMode));
      let probe;
      if (to === "flutterwave") {
        probe = await probeFlutterwave(toMode);
      } else {
        probe = await probePaystack(toMode);
      }
      return json(cors, {
        ok: probe.ok,
        target_provider: to,
        target_mode: toMode,
        balance: probe.balance ?? null,
        error: probe.error ?? null,
        current: {
          provider: currentProvider,
          fw_mode: currentFwMode,
          ps_mode: currentPsMode,
        },
      });
    }

    // ────────────────────────────────────────────────────────────────
    // switch — actually flip. Requires preflight-pass + typed confirmation.
    // ────────────────────────────────────────────────────────────────
    if (action === "switch") {
      const toProvider = body.to_provider === "flutterwave" ? "flutterwave" : "paystack";
      const currentModeForProvider = toProvider === "flutterwave" ? currentFwMode : currentPsMode;
      const toMode = body.to_mode === "live" ? "live" : (body.to_mode === "test" ? "test" : currentModeForProvider);
      const reason = String(body.reason || "").trim();
      const confirmation = String(body.confirmation || "");

      if (!reason) {
        return json(cors, { error: "Reason is required (audit trail)." }, 400);
      }

      const providerChanging = toProvider !== currentProvider;
      const modeChanging = toMode !== currentModeForProvider;
      if (!providerChanging && !modeChanging) {
        return json(cors, { error: "Nothing to change." }, 400);
      }
      const expected = providerChanging ? toProvider.toUpperCase() : toMode.toUpperCase();
      if (confirmation !== expected) {
        return json(cors, { error: `Confirmation mismatch. Type "${expected}" to confirm.` }, 400);
      }

      const probe = toProvider === "flutterwave"
        ? await probeFlutterwave(toMode)
        : await probePaystack(toMode);
      if (!probe.ok) {
        return json(cors, {
          error: `Preflight failed on target ${toProvider} (${toMode}): ${probe.error}`,
          preflight: probe,
        }, 422);
      }

      const ipHash = await sha256Hex(getClientIp(req));
      const userAgent = req.headers.get("user-agent") ?? null;
      const now = new Date().toISOString();

      const { data: switchRow, error: switchErr } = await service
        .from("provider_switches")
        .insert({
          switched_at: now,
          switched_by: user.id,
          from_provider: currentProvider,
          to_provider: toProvider,
          reason,
          auto: false,
          preflight_result: probe,
          actor_ip_hash: ipHash,
          actor_user_agent: userAgent,
        })
        .select("id")
        .single();
      if (switchErr) {
        return json(cors, { error: "Failed to write switch audit — refusing to change state.", detail: switchErr.message }, 500);
      }

      const update: Record<string, any> = {
        provider_switched_at: now,
        provider_switched_by: user.id,
      };
      if (providerChanging) update.active_payment_provider = toProvider;
      if (modeChanging) {
        if (toProvider === "flutterwave") update.flutterwave_mode = toMode;
        else update.paystack_mode = toMode;
      }

      const { error: updErr } = await service
        .from("company_settings")
        .update(update)
        .eq("id", "00000000-0000-0000-0000-000000000001");
      if (updErr) {
        return json(cors, { error: updErr.message, switch_id: switchRow.id }, 500);
      }

      return json(cors, {
        ok: true,
        switched: {
          from_provider: currentProvider,
          to_provider: toProvider,
          from_mode: currentModeForProvider,
          to_mode: toMode,
        },
        switch_id: switchRow.id,
        preflight: probe,
      });
    }

    return json(cors, { error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(corsHeaders(req), { ok: false, error: message }, 500);
  }
});

function json(cors: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
