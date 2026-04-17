// supabase/functions/paystack-transfer/index.ts
//
// Edge Function that handles ALL Paystack server-to-server API calls.
// The browser NEVER sees the Paystack secret key.
//
// Deploy: supabase functions deploy paystack-transfer --no-verify-jwt
// Set secret: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
//
// Supported actions (passed via JSON body { action, ... }):
//   create_recipient  — create a transfer recipient (NUBAN)
//   initiate_transfer — initiate a transfer to a recipient
//   verify_transfer   — check the status of a transfer by reference
//   resolve_account   — verify a bank account number (used by Quick Pay)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const PAYSTACK_BASE = "https://api.paystack.co";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function paystackFetch(path: string, init: RequestInit = {}) {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY not set in Supabase secrets");

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
    throw new Error(body?.message || `Paystack error (HTTP ${res.status})`);
  }
  return body;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    // Optionally verify the caller is authenticated via Supabase JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        const body = await paystackFetch("/transfer", {
          method: "POST",
          body: JSON.stringify({
            source: "balance",
            reason: params.reason || "KDOps disbursement",
            amount: Math.round((params.amount_ngn ?? 0) * 100), // kobo
            recipient: params.recipient_code,
            reference: params.reference,
          }),
        });
        result = body.data;
        break;
      }

      case "verify_transfer": {
        const body = await paystackFetch(
          `/transfer/verify/${encodeURIComponent(params.reference)}`
        );
        result = {
          status: body.data?.status,
          transfer_code: body.data?.transfer_code,
          reason: body.data?.failures?.[0]?.reason || body.data?.reason,
          raw: body.data,
        };
        break;
      }

      case "resolve_account": {
        const qs = new URLSearchParams({
          account_number: params.account_number,
          bank_code: params.bank_code,
        });
        const body = await paystackFetch(`/bank/resolve?${qs}`);
        result = {
          account_name: body.data?.account_name,
          account_number: body.data?.account_number,
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
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
