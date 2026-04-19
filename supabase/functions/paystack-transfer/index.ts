// v2
// supabase/functions/paystack-transfer/index.ts
//
// Edge Function that handles ALL Paystack server-to-server API calls.
// The browser NEVER sees the Paystack secret key.
//
// Deploy: supabase functions deploy paystack-transfer --no-verify-jwt
// Set secret: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
//
// Auth:
//   resolve_account is open to unauthenticated callers (used by the public
//   /join form for bank account verification — account name lookup is not
//   sensitive; the secret key never leaves this function).
//   All other actions require a valid Supabase JWT.
//   Dangerous actions (create_recipient, initiate_transfer, verify_transfer)
//   also require an admin/finance role from the profiles table.
//
// Supported actions (passed via JSON body { action, ... }):
//   resolve_account   — verify a bank account number (unauthenticated OK)
//   create_recipient  — create a transfer recipient (admin/finance only)
//   initiate_transfer — initiate a transfer (admin/finance only)
//   verify_transfer   — check transfer status (admin/finance only)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const PAYSTACK_BASE = "https://api.paystack.co";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRIVILEGED_ACTIONS = new Set([
  "create_recipient",
  "initiate_transfer",
  "verify_transfer",
]);

const PRIVILEGED_ROLES = new Set(["super_admin", "admin", "finance"]);

async function getPaystackSecret(): Promise<string> {
  const envSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (envSecret) return envSecret;

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await serviceClient
    .from("company_settings")
    .select("paystack_secret_key_enc")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  const dbSecret = (data as any)?.paystack_secret_key_enc;
  if (dbSecret) return dbSecret;

  throw new Error(
    "PAYSTACK_SECRET_KEY not found. Set it via Supabase secrets or in Settings → Integrations.",
  );
}

async function paystackFetch(path: string, init: RequestInit = {}) {
  const secret = await getPaystackSecret();

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok || body?.status === false) {
    console.error("[paystack] API error:", res.status, JSON.stringify(body));
    throw new Error(body?.message || `Paystack error (HTTP ${res.status})`);
  }
  return body;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const hasEnvSecret = !!Deno.env.get("PAYSTACK_SECRET_KEY");
    const hasAuth = !!req.headers.get("Authorization");
    console.log("[paystack-transfer] env_secret_present:", hasEnvSecret, "| auth_header_present:", hasAuth);

    const { action, ...params } = await req.json();
    console.log("[paystack-transfer] action:", action);

    // ---------------------------------------------------------------
    // resolve_account: open to unauthenticated callers (public /join form).
    // Account-name lookup is not sensitive — secret key stays server-side.
    // ---------------------------------------------------------------
    if (action === "resolve_account") {
      console.log("[paystack] resolve_account request:", { account_number: params.account_number, bank_code: params.bank_code });
      const qs = new URLSearchParams({
        account_number: params.account_number,
        bank_code: params.bank_code,
      });
      const body = await paystackFetch(`/bank/resolve?${qs}`);
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            account_name: body.data?.account_name,
            account_number: body.data?.account_number,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------------------------------------------------------------
    // All other actions require a logged-in user.
    // ---------------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------------------------------------------------------------
    // Role gate: privileged actions need admin/finance profile.
    // Uses service-role client to bypass RLS on profiles.
    // ---------------------------------------------------------------
    if (PRIVILEGED_ACTIONS.has(action)) {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile?.role || !PRIVILEGED_ROLES.has(profile.role)) {
        return new Response(
          JSON.stringify({ error: "Insufficient permissions" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // ---------------------------------------------------------------
    // Dispatch remaining actions to Paystack.
    // ---------------------------------------------------------------
    let result: unknown;

    switch (action) {
      case "create_recipient": {
        console.log("[paystack] create_recipient request:", { name: params.name, account_number: params.account_number, bank_code: params.bank_code });
        try {
          const body = await paystackFetch("/transferrecipient", {
            method: "POST",
            body: JSON.stringify({
              type: "nuban",
              name: params.name,
              account_number: params.account_number,
              bank_code: params.bank_code,
              currency: "NGN",
            }),
          });
          result = body.data;
        } catch (e) {
          console.error("[paystack] create_recipient failed:", e instanceof Error ? e.message : e);
          throw e;
        }
        break;
      }

      case "initiate_transfer": {
        console.log("[paystack] initiate_transfer request:", { amount_ngn: params.amount_ngn, recipient_code: params.recipient_code, reference: params.reference });
        try {
          const body = await paystackFetch("/transfer", {
            method: "POST",
            body: JSON.stringify({
              source: "balance",
              reason: params.reason || "KDOps disbursement",
              amount: Math.round((params.amount_ngn ?? 0) * 100),
              recipient: params.recipient_code,
              reference: params.reference,
            }),
          });
          result = body.data;
        } catch (e) {
          console.error("[paystack] initiate_transfer failed:", e instanceof Error ? e.message : e);
          throw e;
        }
        break;
      }

      case "verify_transfer": {
        console.log("[paystack] verify_transfer request:", { reference: params.reference });
        try {
          const body = await paystackFetch(
            `/transfer/verify/${encodeURIComponent(params.reference)}`,
          );
          result = {
            status: body.data?.status,
            transfer_code: body.data?.transfer_code,
            reason: body.data?.failures?.[0]?.reason || body.data?.reason,
            raw: body.data,
          };
        } catch (e) {
          console.error("[paystack] verify_transfer failed:", e instanceof Error ? e.message : e);
          throw e;
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

