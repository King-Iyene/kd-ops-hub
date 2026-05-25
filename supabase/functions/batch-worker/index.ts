// supabase/functions/batch-worker/index.ts
//
// Server-side batch dispatcher. Replaces the browser-driven serial loop in
// BatchDetail.tsx with a chunked, concurrent worker that survives the
// operator closing their tab.
//
// Deploy:
//   supabase functions deploy batch-worker
//   supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
//
// Auth modes:
//   1. JWT (Authorization: Bearer …): caller must have admin/finance role.
//      Frontend kicks the worker once after Process is clicked.
//   2. Service-role key (X-Cron-Secret matches CRON_SHARED_SECRET):
//      pg_cron tick — picks up any orphaned batch in 'processing' state
//      whose updated_at is older than 60 s and reinvokes itself.
//
// Body:
//   { batch_id?: string }   — when supplied, work that batch only.
//   {}                       — cron mode: scan for orphaned batches.
//
// Behaviour:
//   - Pulls batch_items WHERE batch_id = X AND paystack_reference IS NULL
//     AND status NOT IN ('succeeded','failed','rejected') in chunks of 50.
//   - Dispatches each chunk with concurrency 8.
//   - Stops cleanly after 120 s wall clock so we stay under the 150 s edge
//     timeout. Whatever remains is picked up on the next invocation.
//
// Idempotency:
//   - The Paystack reference is derived deterministically from batch_item.id
//     so retries don't double-charge.
//   - paystack_reference is set ONLY after Paystack accepts the transfer,
//     so partial failures still have the row visible to the next pass.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ──────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────
const PAYSTACK_BASE      = "https://api.paystack.co";
const TIME_BUDGET_MS     = 120_000;    // stay under 150 s edge timeout
const CHUNK_SIZE         = 50;          // items per pull
const CONCURRENCY        = 8;           // parallel dispatches per chunk
const ORPHAN_THRESHOLD_S = 60;          // cron picks up batches stale > this

const ALLOWED_ORIGINS = [
  "https://ops.kdsquares.com",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Paystack helpers
// ──────────────────────────────────────────────────────────────────────────
async function getPaystackSecret(svc: SupabaseClient): Promise<string> {
  const env = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (env) return env;
  const { data } = await svc
    .from("company_settings")
    .select("paystack_secret_key_enc")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  const v = (data as any)?.paystack_secret_key_enc;
  if (!v) throw new Error("PAYSTACK_SECRET_KEY not configured");
  return v;
}

function generateRef(itemId: string): string {
  return `kdops_${itemId.replace(/-/g, "").slice(0, 20)}`;
}

// Rate-limit handling: HTTP 429 means the request was REJECTED, not processed,
// so retrying is safe (cannot double-send). Honour Retry-After, else back off
// exponentially with jitter. We do NOT retry 5xx/timeouts (may have processed).
const PAYSTACK_MAX_RETRIES = 3;
const PAYSTACK_MAX_BACKOFF_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryDelayMs(res: Response, attempt: number): number {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, PAYSTACK_MAX_BACKOFF_MS);
    const when = Date.parse(ra);
    if (!Number.isNaN(when)) return Math.max(0, Math.min(when - Date.now(), PAYSTACK_MAX_BACKOFF_MS));
  }
  const base = Math.min(500 * 2 ** attempt, PAYSTACK_MAX_BACKOFF_MS);
  return base + Math.floor(Math.random() * 250);
}

async function paystackPost(
  secret: string,
  path: string,
  body: unknown,
): Promise<any> {
  for (let attempt = 0; attempt <= PAYSTACK_MAX_RETRIES; attempt++) {
    const res = await fetch(`${PAYSTACK_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < PAYSTACK_MAX_RETRIES) {
      const waitMs = retryDelayMs(res, attempt);
      console.warn(`[batch-worker] paystack 429 on ${path}; retry ${attempt + 1}/${PAYSTACK_MAX_RETRIES} in ${waitMs}ms`);
      try { await res.text(); } catch { /* ignore */ }
      await sleep(waitMs);
      continue;
    }

    const json = await res.json();
    if (!res.ok || json?.status === false) {
      const msg = json?.message || `Paystack ${res.status}`;
      throw new Error(msg);
    }
    return json.data;
  }

  throw new Error("Paystack rate-limited the request (HTTP 429) after retries");
}

// ──────────────────────────────────────────────────────────────────────────
// Bank code resolution (kept inline so the function is self-contained).
// Mirrors src/lib/nigerian-banks.ts for the major banks. The recipient-create
// path will surface a clear error if a niche bank isn't here yet — and the
// row is marked failed so the rest of the batch keeps moving.
// ──────────────────────────────────────────────────────────────────────────
const BANK_CODES: Record<string, string> = {
  "access bank": "044", "access bank (diamond)": "063", "citibank nigeria": "023",
  "coronation bank": "559", "ecobank nigeria": "050", "fidelity bank": "070",
  "first bank of nigeria": "011", "first city monument bank": "214", "fcmb": "214",
  "first city monument bank (fcmb)": "214",
  "globus bank": "103", "gtbank": "058", "guaranty trust bank": "058",
  "jaiz bank": "301", "keystone bank": "082", "lotus bank": "303",
  "nova merchant bank": "060", "parallex bank": "104", "polaris bank": "076",
  "premium trust bank": "105", "providus bank": "101", "rubies bank": "125",
  "stanbic ibtc bank": "221", "standard chartered bank nigeria": "068",
  "sterling bank": "232", "suntrust bank": "100", "taj bank": "302",
  "titan trust bank": "102", "union bank of nigeria": "032",
  "united bank for africa": "033", "uba": "033", "unity bank": "215",
  "wema bank": "035", "zenith bank": "057",
  "kuda bank": "50211", "kuda": "50211", "opay": "999992", "palmpay": "999991",
  "moniepoint mfb": "50515", "moniepoint": "50515", "fairmoney mfb": "50211",
};

function getBankCode(name: string | null | undefined): string | null {
  if (!name) return null;
  return BANK_CODES[name.trim().toLowerCase()] ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Per-item dispatch — returns { ok, reason? }. On error the row is marked
// failed in the DB so the next pass skips it.
// ──────────────────────────────────────────────────────────────────────────
async function dispatchItem(
  svc: SupabaseClient,
  secret: string,
  it: any,
  batchName: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const amount = Number(it.amount_ngn || 0);
    if (amount < 1)        return fail("Minimum transfer amount is ₦1");
    // Single-transfer caps live in check_transfer_caps now (read by the
    // approve_payment_batch RPC up-front + paystack-transfer at dispatch).
    // The previous hardcoded ₦5M literal duplicated those caps and silently
    // diverged when a super_admin raised them — closes H-7.

    let recipientCode: string | null = it.paystack_recipient_code || null;
    if (!recipientCode) {
      const bankCode = getBankCode(it.bank_name);
      if (!bankCode) return fail(`Unknown bank "${it.bank_name}" — no Paystack code`);

      const recipient = await paystackPost(secret, "/transferrecipient", {
        type: "nuban",
        name: it.full_name || "Unknown Recipient",
        account_number: it.account_number,
        bank_code: bankCode,
        currency: "NGN",
      });
      recipientCode = recipient.recipient_code;
    }

    const reference = generateRef(it.id);
    const transfer = await paystackPost(secret, "/transfer", {
      source: "balance",
      reason: `KDOps · ${batchName}`,
      amount: Math.round(amount * 100),
      recipient: recipientCode,
      reference,
    });

    await svc.from("batch_items").update({
      status:                  "pending",
      paystack_recipient_code: recipientCode,
      paystack_transfer_code:  transfer.transfer_code,
      paystack_reference:      transfer.reference,
      failure_reason:          null,
    }).eq("id", it.id);

    return { ok: true };
  } catch (err) {
    const reason = (err as Error)?.message || "Transfer failed";
    return fail(reason);
  }

  async function fail(reason: string) {
    await svc.from("batch_items").update({
      status: "failed", failure_reason: reason,
    }).eq("id", it.id);
    return { ok: false, reason };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Drain pull-queue with bounded concurrency.
// ──────────────────────────────────────────────────────────────────────────
async function drainConcurrent<T, R>(
  items: T[],
  conc: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Main worker — loop until time budget expires or no more pending items.
// ──────────────────────────────────────────────────────────────────────────
async function workBatch(
  svc: SupabaseClient,
  batchId: string,
  actorId?: string | null,
) {
  const startedAt = Date.now();

  const { data: batch, error: bErr } = await svc
    .from("payment_batches")
    .select("id, name, status")
    .eq("id", batchId)
    .single();
  if (bErr || !batch) return { ok: false, error: "batch not found" };
  if (batch.status !== "processing" && batch.status !== "partially_processed") {
    return { ok: true, skipped: `batch in ${batch.status}` };
  }

  // Cap enforcement: when a real user kicks the batch, sum undispatched
  // amounts and run a single check_transfer_caps call before touching Paystack.
  // Cron/orphan recovery bypasses this — the batch was already authorised.
  if (actorId) {
    const { data: pendingItems } = await svc
      .from("batch_items")
      .select("amount_ngn")
      .eq("batch_id", batchId)
      .is("paystack_reference", null)
      .not("status", "in", '("succeeded","failed","rejected")');

    const totalNgn = (pendingItems || []).reduce(
      (sum: number, it: any) => sum + Number(it.amount_ngn || 0),
      0,
    );

    if (totalNgn > 0) {
      const { data: capRows, error: capErr } = await svc.rpc(
        "check_transfer_caps",
        { p_user_id: actorId, p_amount_ngn: totalNgn },
      );
      if (capErr) {
        console.error("[batch-worker] cap check failed:", capErr.message);
        return { ok: false, error: "Could not verify transfer limits — try again." };
      }
      const cap = Array.isArray(capRows) ? capRows[0] : capRows;
      if (cap && cap.allowed === false) {
        return { ok: false, error: cap.reason, cap_blocked: true };
      }
    }
  }

  const secret = await getPaystackSecret(svc);
  let dispatched = 0;
  let failed     = 0;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { data: chunk, error: pullErr } = await svc
      .from("batch_items")
      .select("id, full_name, amount_ngn, bank_name, account_number, paystack_recipient_code")
      .eq("batch_id", batchId)
      .is("paystack_reference", null)
      .not("status", "in", '("succeeded","failed","rejected")')
      .order("created_at", { ascending: true })
      .limit(CHUNK_SIZE);

    if (pullErr) {
      console.error("[batch-worker] pull error:", pullErr.message);
      return { ok: false, error: pullErr.message };
    }
    if (!chunk || chunk.length === 0) break;

    // Touch the batch so the orphan-watchdog knows we're alive.
    await svc.from("payment_batches")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", batchId);

    const results = await drainConcurrent(chunk, CONCURRENCY, (it) =>
      dispatchItem(svc, secret, it, batch.name),
    );
    for (const r of results) (r.ok ? dispatched++ : failed++);
  }

  // Are there still undispatched items? (i.e. we hit the time budget)
  const { count: remaining } = await svc
    .from("batch_items")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .is("paystack_reference", null)
    .not("status", "in", '("succeeded","failed","rejected")');

  // When the run completes (no items left to dispatch), ask the database to
  // finalize the batch status from current item statuses. The RPC is
  // idempotent and handles all the edge cases (some pending Paystack
  // verifications, some failed, etc.) — keeping the rule in one place.
  if ((remaining ?? 0) === 0) {
    const { error: finalizeErr } = await svc.rpc("finalize_batch", {
      p_batch_id: batchId,
    });
    if (finalizeErr) {
      console.warn("[batch-worker] finalize_batch failed:", finalizeErr.message);
    }
  }

  return {
    ok: true,
    batch_id:   batchId,
    dispatched,
    failed,
    remaining:  remaining ?? 0,
    elapsed_ms: Date.now() - startedAt,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Cron mode — find any batch in 'processing' that has stale updated_at and
// resume it. Caps to one batch per tick so we don't blow the time budget.
// ──────────────────────────────────────────────────────────────────────────
async function workOrphans(svc: SupabaseClient) {
  const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_S * 1000).toISOString();
  const { data: orphans } = await svc
    .from("payment_batches")
    .select("id, updated_at")
    .in("status", ["processing", "partially_processed"])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(1);

  if (!orphans || orphans.length === 0) return { ok: true, orphans_processed: 0 };
  return await workBatch(svc, orphans[0].id);
}

// ──────────────────────────────────────────────────────────────────────────
// HTTP entry point
// ──────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  // Cron path: shared secret in header, no JWT required.
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCron = Deno.env.get("CRON_SHARED_SECRET");
  if (cronSecret && expectedCron && cronSecret === expectedCron) {
    const result = body?.batch_id
      ? await workBatch(svc, body.batch_id, null)
      : await workOrphans(svc);
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // User path: must have admin/finance JWT.
  const authHeader = req.headers.get("authorization") || "";
  const jwt        = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const { data: profile } = await svc
    .from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = (profile as any)?.role;
  if (!["super_admin", "admin", "finance"].includes(role)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!body?.batch_id) {
    return new Response(JSON.stringify({ error: "batch_id required" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const result = await workBatch(svc, body.batch_id, userRes.user.id);
  return new Response(JSON.stringify(result), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
