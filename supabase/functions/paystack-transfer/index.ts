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

const ALLOWED_ORIGINS = [
  "https://ops.kdsquares.com",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

const PRIVILEGED_ACTIONS = new Set([
  "create_recipient",
  "initiate_transfer",
  "bulk_transfer",
  "verify_transfer",
  "get_balance",
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
  const corsHeaders = getCorsHeaders(req);
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
    // list_banks: open to unauthenticated callers.
    // Returns the full Paystack-supported bank list for Nigeria (~300+).
    // The secret key is used only on the server — never reaches the client.
    // ---------------------------------------------------------------
    if (action === "list_banks") {
      const body = await paystackFetch(
        "/bank?currency=NGN&use_cursor=false&perPage=300&country=nigeria",
      );
      return new Response(
        JSON.stringify({
          ok: true,
          data: (body.data || []).map((b: any) => ({ code: b.code, name: b.name })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------------------------------------------------------------
    // resolve_account: open to unauthenticated callers (public /join form).
    // Account-name lookup is not sensitive — secret key stays server-side.
    // ---------------------------------------------------------------
    if (action === "resolve_account") {
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
    );
    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: authError?.message || "Not authenticated" }), {
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
        break;
      }

      case "initiate_transfer": {
        if (!params.reference) {
          return new Response(
            JSON.stringify({ error: "reference is required for transfer idempotency" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const serviceClient2 = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        // Pre-flight de-dup: if this reference was already dispatched, return
        // the existing transfer instead of firing a duplicate. Paystack stores
        // refs in `paystack_reference`, not `reference` (that column is the
        // human-facing payment label and may collide).
        const { data: existing } = await serviceClient2
          .from("batch_items")
          .select("id, paystack_transfer_code, paystack_reference, status")
          .eq("paystack_reference", params.reference)
          .not("paystack_transfer_code", "is", null)
          .maybeSingle();
        if (existing?.paystack_transfer_code) {
          // We've seen this ref before — verify Paystack so callers receive
          // the live status, not a stale pending. Cheap call, ~250ms.
          let liveStatus = existing.status;
          try {
            const verifyBody = await paystackFetch(
              `/transfer/verify/${encodeURIComponent(params.reference)}`,
            );
            liveStatus = verifyBody.data?.status || existing.status;
          } catch (verifyErr) {
            console.warn("[transfer] verify of existing ref failed:", String(verifyErr));
          }
          result = {
            transfer_code: existing.paystack_transfer_code,
            reference: params.reference,
            status: liveStatus,
            recovered: true,
            verified_status: liveStatus,
          };
          break;
        }
        // Initiate at Paystack. Self-heal if Paystack reports a duplicate ref
        // we don't have on file (covers cases where the DB write failed after
        // a successful Paystack call on a prior attempt).
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
        } catch (initErr) {
          const msg = String((initErr as Error)?.message || "").toLowerCase();
          const isDup =
            msg.includes("reference already exists") ||
            msg.includes("unique reference") ||
            msg.includes("duplicate");
          if (!isDup) throw initErr;
          // Recover: query Paystack for the existing transfer state.
          const verifyBody = await paystackFetch(
            `/transfer/verify/${encodeURIComponent(params.reference)}`,
          );
          result = {
            transfer_code: verifyBody.data?.transfer_code,
            reference: params.reference,
            status: verifyBody.data?.status,
            id: verifyBody.data?.id,
            recovered: true,
            verified_status: verifyBody.data?.status,
          };
        }
        break;
      }

      case "bulk_transfer": {
        // Send up to 100 transfers in a single Paystack API call. Caller is
        // responsible for chunking larger batches and spacing chunks ≥ 5s
        // apart (Paystack rate limit on bulk transfers).
        const transfers = Array.isArray(params.transfers) ? params.transfers : [];
        if (transfers.length === 0) {
          return new Response(
            JSON.stringify({ error: "transfers array is required and non-empty" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (transfers.length > 100) {
          return new Response(
            JSON.stringify({ error: "Paystack bulk_transfer max is 100 items per call" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        for (const t of transfers) {
          if (!t.reference || !t.recipient || t.amount == null) {
            return new Response(
              JSON.stringify({ error: "each transfer requires reference, recipient, and amount (kobo)" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
        const body = await paystackFetch("/transfer/bulk", {
          method: "POST",
          body: JSON.stringify({ source: "balance", transfers }),
        });
        result = body.data;
        break;
      }

      case "verify_transfer": {
        const body = await paystackFetch(
          `/transfer/verify/${encodeURIComponent(params.reference)}`,
        );
        result = {
          status: body.data?.status,
          transfer_code: body.data?.transfer_code,
          reason: body.data?.failures?.[0]?.reason || body.data?.reason,
          raw: body.data,
        };
        break;
      }

      case "get_balance": {
        const body = await paystackFetch('/balance');
        const ngnBalance = Array.isArray(body.data)
          ? body.data.find((b: any) => b.currency === 'NGN')
          : body.data;
        result = {
          available: (ngnBalance?.balance ?? 0) / 100,
          currency: 'NGN',
        };
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
