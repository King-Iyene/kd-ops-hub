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
const CHUNK_SIZE         = 50;          // items per pull (per-item dispatch path)
const CONCURRENCY        = 8;           // parallel dispatches per chunk (per-item path)
const ORPHAN_THRESHOLD_S = 60;          // cron picks up batches stale > this

// Bulk-transfer path constants. Used when KDOPS_DISPATCH_MODE === "bulk" —
// the permanent dispatch path for scaling to 1k+ recipients. Paystack
// /transfer/bulk accepts 100 transfers per call, spaced ≥5 s apart to stay
// under the rate limit. With a 120 s edge budget that's enough for one
// invocation to dispatch ~24 chunks (~2,400 recipients); cron resumes any
// remainder on the next tick. Per-item path stays available as a fallback.
const BULK_CHUNK_SIZE       = 100;
const BULK_INTER_CHUNK_MS   = 5_000;
const RECIPIENT_CONCURRENCY = 4;        // pre-warm missing recipients before bulk

/**
 * Dispatch mode for this worker invocation:
 *   "per_item" — legacy serial path (one /transfer call per item, concurrency 8).
 *   "bulk"     — permanent path (groups of 100 via /transfer/bulk, 5 s apart).
 * Set via the KDOPS_DISPATCH_MODE env var on the deployed edge function so the
 * switch is a single config change and easy to revert. Default = per_item
 * (no-op for existing deployments; flip to "bulk" after Paystack-test-key
 * validation).
 */
function dispatchMode(): "per_item" | "bulk" {
  const v = (Deno.env.get("KDOPS_DISPATCH_MODE") || "per_item").toLowerCase();
  return v === "bulk" ? "bulk" : "per_item";
}

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
// Bank-code resolution — Paystack /bank is the source of truth.
//
// The previous implementation was a small inline map with no fuzzy matching.
// It failed for verbose names like "OPay Digital Services Limited (OPay)"
// (the form Paystack's /bank/resolve returns) and every time Paystack added
// a new fintech bank it silently drifted further from the client-side list.
// THIS implementation:
//
//   1. Fetches the live Nigerian bank list from /bank at first need and
//      caches it in module memory for the function instance's lifetime.
//      A 1-hour TTL means any new bank Paystack adds shows up within the
//      hour without a redeploy.
//   2. Falls back to an embedded BANK_BASELINE (the client's known-good
//      list) when /bank is unreachable on cold start. Dispatch never stops
//      because of a Paystack API hiccup. The cache also memoises the
//      baseline so a brief outage doesn't hammer /bank on every call.
//   3. Runs a 4-step fuzzy match (alias → exact → contains → prefix) that
//      mirrors src/lib/nigerian-banks.ts. Verbose names, prefix names and
//      common short aliases all resolve through one matcher.
//
// dispatchItem / dispatchChunkBulk still call getBankCode() synchronously
// (no change to those signatures) — workBatch warms the cache once via
// loadPaystackBanks() right after fetching the secret, so every subsequent
// per-item lookup is an in-memory hit.
// ──────────────────────────────────────────────────────────────────────────

interface BankRow { code: string; name: string }

const BANK_BASELINE: BankRow[] = [
  // Commercial / merchant banks
  { code: '044', name: 'Access Bank' },
  { code: '063', name: 'Access Bank (Diamond)' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '559', name: 'Coronation Bank' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank (FCMB)' },
  { code: '103', name: 'Globus Bank' },
  { code: '058', name: 'GTBank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '058', name: 'Guaranty Trust Bank Plc' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '303', name: 'Lotus Bank' },
  { code: '060', name: 'Nova Merchant Bank' },
  { code: '104', name: 'Parallex Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '105', name: 'Premium Trust Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '125', name: 'Rubies Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank Nigeria' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'SunTrust Bank Nigeria' },
  { code: '302', name: 'TAJ Bank' },
  { code: '102', name: 'Titan Trust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa (UBA)' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
  // Digital banks / fintechs
  { code: '035A', name: 'ALAT by WEMA' },
  { code: '565', name: 'Carbon' },
  { code: '50126', name: 'Eyowo' },
  { code: '090311', name: 'FairMoney Microfinance Bank' },
  { code: '50211', name: 'Kuda Microfinance Bank' },
  { code: '50515', name: 'Moniepoint Microfinance Bank' },
  { code: '999992', name: 'OPay Digital Services Limited (OPay)' },
  { code: '999991', name: 'PalmPay' },
  { code: '51310', name: 'Sparkle Microfinance Bank' },
  { code: '566', name: 'VFD Microfinance Bank' },
  { code: '50117', name: 'Branch International Finance Company Ltd' },
  // PSBs
  { code: '120001', name: '9mobile 9Payment Service Bank' },
  { code: '120003', name: 'Airtel Smartcash PSB' },
  { code: '120002', name: 'Hope PSBank' },
  { code: '120004', name: 'MTN MoMo PSB' },
  // Microfinance / others (used by some partners)
  { code: '602', name: 'ACCION Microfinance Bank' },
  { code: '50162', name: 'DOT Microfinance Bank' },
  { code: '50383', name: 'Hasal Microfinance Bank' },
  { code: '51244', name: 'IBILE Microfinance Bank' },
  { code: '090177', name: 'LAPO Microfinance Bank' },
  { code: '100002', name: 'Paga' },
  { code: '50200', name: 'RenMoney Microfinance Bank' },
  { code: '51113', name: 'Safe Haven Microfinance Bank' },
  { code: '090264', name: 'Tangerine Bank' },
];

const BANK_ALIASES: Record<string, string> = {
  // Short forms operators type in place of the official Paystack name.
  // These bypass the live list and resolve immediately — covers the most
  // common typo / abbreviation surface for Nigerian banks.
  'gtb': '058',
  'gtbank': '058',
  'guaranty trust bank': '058',
  'guaranty trust bank plc': '058',
  'uba': '033',
  'united bank for africa': '033',
  'fcmb': '214',
  'first city monument bank': '214',
  'opay': '999992',
  'palmpay': '999991',
  'kuda': '50211',
  'kuda bank': '50211',
  'moniepoint': '50515',
  'moniepoint mfb': '50515',
  'fairmoney mfb': '090311',
  'fairmoney': '090311',
};

let _bankCache: BankRow[] | null = null;
let _bankCacheAt: number = 0;
const BANK_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Loads the Paystack Nigerian bank list and caches it. Safe to call repeatedly:
 * the first call awaits the network round-trip, subsequent calls return the
 * cached list until the TTL expires. On any failure (network error, HTTP
 * non-2xx, suspiciously short response), falls back to BANK_BASELINE and
 * memoises THAT so the next call doesn't immediately re-hit a failing API.
 * Always returns a non-empty list — the worker can rely on the cache being
 * usable afterwards.
 */
async function loadPaystackBanks(secret: string): Promise<BankRow[]> {
  const now = Date.now();
  if (_bankCache && (now - _bankCacheAt) < BANK_CACHE_TTL_MS) return _bankCache;

  try {
    const res = await fetch('https://api.paystack.co/bank?country=nigeria&perPage=300', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (res.ok) {
      const json = await res.json();
      const rows: BankRow[] = (json?.data || [])
        .filter((b: any) => b?.name && b?.code)
        .map((b: any) => ({ code: String(b.code), name: String(b.name) }));
      // Sanity: a real Paystack /bank returns hundreds of entries. Anything
      // smaller is almost certainly an error / throttled response we should
      // not trust as the source of truth.
      if (rows.length >= 10) {
        _bankCache = rows;
        _bankCacheAt = now;
        return _bankCache;
      }
      console.warn(`[batch-worker] /bank returned only ${rows.length} rows; using baseline`);
    } else {
      console.warn(`[batch-worker] /bank HTTP ${res.status}; using baseline`);
    }
  } catch (e) {
    console.warn('[batch-worker] /bank fetch failed; using baseline:', (e as Error)?.message);
  }

  _bankCache = BANK_BASELINE;
  _bankCacheAt = now;
  return _bankCache;
}

/**
 * 4-step bank-name → code resolver. Mirrors src/lib/nigerian-banks.ts so the
 * client and the worker agree. Reads the in-memory cache (warmed by
 * loadPaystackBanks at the top of workBatch) — if for any reason the cache
 * isn't populated yet, falls through to BANK_BASELINE so resolution never
 * crashes the dispatch path.
 */
function getBankCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  if (!n) return null;

  // 1. Short-form aliases first — operators frequently type "UBA" / "GTB".
  if (BANK_ALIASES[n]) return BANK_ALIASES[n];

  const banks = _bankCache || BANK_BASELINE;

  // 2. Exact match against the live list.
  const exact = banks.find((b) => b.name.toLowerCase() === n);
  if (exact) return exact.code;

  // 3. Stored name CONTAINS a registered bank name — handles the verbose
  //    /bank/resolve form like "OPay Digital Services Limited (OPay)" which
  //    contains "OPay Digital Services Limited". Pick the LONGEST match.
  const contained = banks
    .filter((b) => {
      const bn = b.name.toLowerCase();
      return bn.length >= 4 && n.includes(bn);
    })
    .sort((a, b) => b.name.length - a.name.length);
  if (contained.length > 0) return contained[0].code;

  // 4. Registered name STARTS WITH query — handles "opay" → full official
  //    name. Only accept when exactly one bank matches (else ambiguous).
  const prefix = banks.filter((b) => b.name.toLowerCase().startsWith(n));
  if (prefix.length === 1) return prefix[0].code;

  return null;
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
    let verifiedAccountName: string | null = null;
    if (!recipientCode) {
      const bankCode = getBankCode(it.bank_name);
      if (!bankCode) return fail(`Unknown bank "${it.bank_name}" — no Paystack code`);

      const recipient = await paystackPost(secret, "/transferrecipient", {
        type: "nuban",
        name: it.full_name || "Unknown Recipient",
        // Strip non-digits — copy-pasted account numbers sometimes carry
        // NBSP or full-width digits that Paystack rejects opaquely.
        account_number: String(it.account_number || "").replace(/\D/g, ""),
        bank_code: bankCode,
        currency: "NGN",
      });
      recipientCode = recipient.recipient_code;
      // Paystack's /transferrecipient response echoes the bank-verified name
      // from NIBSS. Capture it so downstream receipts / emails / CSV can
      // display the name the recipient's bank actually uses, not the operator
      // typo they may have entered in full_name.
      verifiedAccountName = recipient.details?.account_name || null;
    }

    const reference = generateRef(it.id);
    // `batchName` is now the pre-computed narration snapshot from workBatch
    // (see narration snapshot block). It already includes the KDOps · prefix
    // only when we fell back to the batch name; explicit operator narration
    // and payment_description flow through verbatim.
    const reason = batchName.slice(0, 100);
    const transfer = await paystackPost(secret, "/transfer", {
      source: "balance",
      reason,
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
      // Only write account_name if we just learned it. Never overwrite an
      // existing value — a retry after a partial success mustn't clobber
      // what the original dispatch captured.
      ...(verifiedAccountName ? { account_name: verifiedAccountName } : {}),
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
// BULK dispatch — the permanent scaling path. Send up to 100 transfers in a
// single /transfer/bulk call. The cost vs the per-item path: 1,000 partners
// goes from ~1,000 API calls (per-item) to ~10 calls (bulk), an order of
// magnitude less pressure on Paystack's rate limits and ~100× faster end-to-end.
//
// Idempotency rule (CRITICAL — money path):
//   1. Pre-warm any missing recipients (one /transferrecipient each, conc=4).
//   2. PRE-WRITE the deterministic kdops_<id> reference + recipient_code to
//      each batch_item BEFORE issuing the bulk call. If the bulk response is
//      lost (connection drop) but Paystack actually accepted, the next worker
//      tick skips these items (refs are set) and the reconciliation cron
//      verifies their real status via /transfer/verify — no double-dispatch.
//   3. POST /transfer/bulk once. paystackPost handles 429 with Retry-After
//      backoff and only retries safe (rejected) responses.
//   4. Map each returned transfer to its batch_item by reference and persist
//      transfer_code + status. Items missing from the response are left with
//      their pre-written ref; reconciliation will resolve them.
// ──────────────────────────────────────────────────────────────────────────
async function dispatchChunkBulk(
  svc: SupabaseClient,
  secret: string,
  items: any[],
  batchName: string,
): Promise<{ dispatched: number; failed: number; error?: string }> {
  // ── 1. Pre-warm recipients for items that don't have a code yet ─────────
  const needRecipient = items.filter((it) => !it.paystack_recipient_code);
  if (needRecipient.length > 0) {
    await drainConcurrent(needRecipient, RECIPIENT_CONCURRENCY, async (it) => {
      try {
        const bankCode = getBankCode(it.bank_name);
        if (!bankCode) throw new Error(`Unknown bank "${it.bank_name}" — no Paystack code`);
        const r = await paystackPost(secret, "/transferrecipient", {
          type: "nuban",
          name: it.full_name || "Unknown Recipient",
          // Same non-digit strip as the per-item path.
          account_number: String(it.account_number || "").replace(/\D/g, ""),
          bank_code: bankCode,
          currency: "NGN",
        });
        it.paystack_recipient_code = r.recipient_code;
        // Bank-verified name from Paystack /transferrecipient echo.
        const verifiedName = r.details?.account_name || null;
        await svc.from("batch_items")
          .update({
            paystack_recipient_code: r.recipient_code,
            ...(verifiedName ? { account_name: verifiedName } : {}),
          })
          .eq("id", it.id);
      } catch (err) {
        // Mark this item failed and drop it from the bulk payload. The rest of
        // the chunk still goes through — one bad row never blocks the run.
        it._failed_reason = (err as Error)?.message || "Recipient creation failed";
        await svc.from("batch_items")
          .update({ status: "failed", failure_reason: it._failed_reason })
          .eq("id", it.id);
      }
    });
  }

  const sendable = items.filter(
    (it) => !it._failed_reason && it.paystack_recipient_code && Number(it.amount_ngn) >= 1,
  );
  const failedFromPrewarm = items.length - sendable.length;
  if (sendable.length === 0) return { dispatched: 0, failed: failedFromPrewarm };

  // ── 2. Assign + pre-write deterministic references (idempotency) ────────
  for (const it of sendable) it._ref = generateRef(it.id);
  await Promise.all(sendable.map((it) =>
    svc.from("batch_items").update({
      paystack_reference: it._ref,
      status:             "pending",
      failure_reason:     null,
    }).eq("id", it.id),
  ));

  // ── 3. Issue the bulk call ──────────────────────────────────────────────
  // `batchName` here is the pre-computed narration snapshot from workBatch —
  // already contains the KDOps · prefix only when we fell back to the batch
  // name, and is already capped at 100 chars. Slice again defensively.
  const reason = batchName.slice(0, 100);
  const transfers = sendable.map((it) => ({
    reference: it._ref,
    recipient: it.paystack_recipient_code,
    amount:    Math.round(Number(it.amount_ngn) * 100),
    reason,
  }));

  let bulkData: any;
  try {
    bulkData = await paystackPost(secret, "/transfer/bulk", {
      source:    "balance",
      transfers,
    });
  } catch (err) {
    // The references are already written; reconciliation will verify each one
    // and resolve actual status from Paystack. Items remain status='pending'.
    const reason = (err as Error)?.message || "Bulk transfer call failed";
    console.error(`[batch-worker] /transfer/bulk failed (${sendable.length} items): ${reason}`);
    return { dispatched: 0, failed: failedFromPrewarm, error: reason };
  }

  // ── 4. Map response → items ─────────────────────────────────────────────
  // Paystack /transfer/bulk returns data as an array (or { data: [...] }
  // depending on path). Index by reference for safety.
  const arr: any[] = Array.isArray(bulkData) ? bulkData : (bulkData?.data || []);
  const byRef = new Map<string, any>();
  for (const t of arr) if (t?.reference) byRef.set(String(t.reference), t);

  let dispatched = 0;
  let failed = failedFromPrewarm;
  for (const it of sendable) {
    const t = byRef.get(it._ref);
    if (!t) {
      // Paystack didn't echo this item back. Leave the ref in place; the
      // reconciliation cron will verify via /transfer/verify.
      console.warn(`[batch-worker] item ${it.id} not echoed in bulk response`);
      continue;
    }
    const sub = String(t.status || "").toLowerCase();
    const mapped =
      sub === "success"               ? "succeeded"
      : sub === "failed" || sub === "reversed" ? sub
      : "pending"; // pending / otp / queued — let webhook/reconcile finalise
    await svc.from("batch_items").update({
      paystack_transfer_code: t.transfer_code ?? null,
      status:                 mapped,
      failure_reason:         mapped === "failed" ? (t.reason || "Bulk transfer rejected") : null,
      processed_at:           mapped === "succeeded" ? new Date().toISOString() : null,
    }).eq("id", it.id);
    if (mapped === "failed") failed++; else dispatched++;
  }

  return { dispatched, failed };
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
  narrationOverride?: string | null,
) {
  const startedAt = Date.now();

  const { data: batch, error: bErr } = await svc
    .from("payment_batches")
    .select("id, name, status, payment_description, payment_narration_at_dispatch")
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
  // Warm the bank-code cache once per invocation. After this awaits, every
  // per-item getBankCode() in dispatchItem / dispatchChunkBulk is an in-memory
  // lookup against the live Paystack /bank list (or the embedded baseline if
  // /bank was unreachable). Pre-warming here means dispatch stays synchronous
  // and the worker never silently falls back per-item.
  await loadPaystackBanks(secret);

  // ── Narration snapshot ─────────────────────────────────────────────────
  // Compute + persist the narration the first time this batch is dispatched.
  // Priority: caller override (typed in the pre-flight modal), then batch's
  // payment_description, then the raw batch name. Always capped at 100 (the
  // Paystack /transfer `reason` limit). Once set, we never overwrite it — a
  // resumption tick reuses the same value so recipients on chunk 5 see the
  // same text as chunk 1 even if someone renamed the batch mid-run.
  let narrationForDispatch: string = (batch as any).payment_narration_at_dispatch || "";
  if (!narrationForDispatch) {
    const raw = (narrationOverride ?? (batch as any).payment_description ?? batch.name ?? "")
      .toString()
      .trim();
    // If the caller provided their own text, respect it verbatim (up to 100).
    // If we fell back to the batch name, keep the "KDOps · " brand prefix
    // that recipients have historically seen.
    if (narrationOverride && narrationOverride.trim().length > 0) {
      narrationForDispatch = raw.slice(0, 100);
    } else if ((batch as any).payment_description) {
      narrationForDispatch = raw.slice(0, 100);
    } else {
      narrationForDispatch = `KDOps · ${raw}`.slice(0, 100);
    }
    await svc.from("payment_batches")
      .update({ payment_narration_at_dispatch: narrationForDispatch })
      .eq("id", batchId);
  }
  const mode = dispatchMode();
  const pullSize = mode === "bulk" ? BULK_CHUNK_SIZE : CHUNK_SIZE;
  let dispatched = 0;
  let failed     = 0;
  let chunkIndex = 0;

  console.log(`[batch-worker] batch=${batchId} mode=${mode} pull_size=${pullSize}`);

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    // Bulk path: enforce ≥5 s spacing between consecutive /transfer/bulk calls
    // (Paystack rate-limit guidance). First chunk fires immediately.
    if (mode === "bulk" && chunkIndex > 0) {
      await sleep(BULK_INTER_CHUNK_MS);
      if (Date.now() - startedAt >= TIME_BUDGET_MS) break;
    }

    const { data: chunk, error: pullErr } = await svc
      .from("batch_items")
      .select("id, full_name, amount_ngn, bank_name, account_number, paystack_recipient_code")
      .eq("batch_id", batchId)
      .is("paystack_reference", null)
      .not("status", "in", '("succeeded","failed","rejected")')
      .order("created_at", { ascending: true })
      .limit(pullSize);

    if (pullErr) {
      console.error("[batch-worker] pull error:", pullErr.message);
      return { ok: false, error: pullErr.message };
    }
    if (!chunk || chunk.length === 0) break;

    // Touch the batch so the orphan-watchdog knows we're alive.
    await svc.from("payment_batches")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", batchId);

    if (mode === "bulk") {
      const r = await dispatchChunkBulk(svc, secret, chunk, narrationForDispatch);
      dispatched += r.dispatched;
      failed     += r.failed;
      // A whole-bulk-call failure (network / account-level error) leaves refs
      // pre-written for reconciliation to resolve. Stop the loop so cron picks
      // it up cleanly on the next tick rather than hammering a failing bulk.
      if (r.error) {
        console.warn(`[batch-worker] bulk chunk failed, deferring to next tick: ${r.error}`);
        break;
      }
    } else {
      const results = await drainConcurrent(chunk, CONCURRENCY, (it) =>
        dispatchItem(svc, secret, it, narrationForDispatch),
      );
      for (const r of results) (r.ok ? dispatched++ : failed++);
    }
    chunkIndex++;
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
  return await workBatch(svc, orphans[0].id, null, null);
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
    // Cron doesn't set narration — always uses whatever snapshot the batch
    // already has (or falls back to payment_description / name if the
    // batch has never dispatched before).
    const result = body?.batch_id
      ? await workBatch(svc, body.batch_id, null, null)
      : await workOrphans(svc);
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // User path: must have admin/finance JWT.
  const authHeader = req.headers.get("authorization") || "";
  const jwt        = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    console.warn("[batch-worker] 401: no Authorization header");
    return new Response(JSON.stringify({ error: "unauthorized: no auth header" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  // Pass the JWT explicitly to getUser. Without the argument, newer
  // supabase-js versions read the client's INTERNAL session (which doesn't
  // exist on the server) and fail with "Auth session missing!", returning
  // 401 even though the Authorization header was perfectly valid. With the
  // arg, supabase validates the given token against auth.users directly.
  const { data: userRes, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userRes?.user) {
    console.warn("[batch-worker] 401: getUser failed —", userErr?.message || "no user", "; jwt_prefix=", jwt.slice(0, 16));
    return new Response(JSON.stringify({ error: `unauthorized: ${userErr?.message || "session invalid"}` }), {
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

  // Surface any unhandled error as a structured 200 JSON payload so the UI
  // gets a useful message instead of an opaque "Edge Function returned a
  // non-2xx status code". Real auth/role failures already returned earlier.
  try {
    // Client sends the narration typed in the pre-flight modal ("What
    // recipients will see on their bank statement"). It's a one-shot
    // override: workBatch snapshots it into payment_narration_at_dispatch
    // the first time, and reuses that snapshot for every subsequent tick.
    const narrationOverride = typeof body?.narration === "string" && body.narration.trim().length > 0
      ? body.narration.trim()
      : null;
    const result = await workBatch(svc, body.batch_id, userRes.user.id, narrationOverride);
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = (err as Error)?.message || "Worker failed";
    console.error("[batch-worker] unhandled error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
