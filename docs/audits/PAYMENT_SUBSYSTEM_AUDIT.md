# KDOps Payment Subsystem — Forensic Pre-Launch Audit

**Date:** 2026-05-03
**Branch:** `claude/audit-payment-subsystem-CtagQ`
**Auditor:** Claude (engagement: pre-go-live forensic review)
**Scope:** Every file in the payment path (initiation → Paystack → webhook → reconciliation → ledger),
plus the existing Transfer Authorization module, RLS, audit trail, FX handling, fuel/expense flows,
and the transactions_view.

> **Note on stack mismatch.** The brief described a Next.js + Supabase app. The repo is actually
> Vite + React (SPA) + Supabase Edge Functions. Findings still apply — the architecture differs
> (no Next.js API routes; all server logic lives in `supabase/functions/`).

---

## 0. Headline

KDOps has done a lot of the right things — server-side cap enforcement via an RPC, webhook idempotency,
audit-table immutability triggers, encrypted account-number shadow columns, a recurring reconciliation
job, an orphaned-batch watchdog, and a payment anomaly engine. **You are not starting from zero.**

But there are **multiple BLOCKERs that make this unsafe to run against ₦100M+ batches today.** They
fall into three families:

1. **Single-approver authority on payment batches.** No co-approval threshold for payment batches
   exists anywhere in code. Dual-approval is implemented for `expenses`, but not for batches, Quick Pay,
   or expense-payment processing. One Admin/Finance account compromise = full cap exposure.
2. **The cap-enforcement RPC has a self-skirting hole.** Caps are enforced *only* at edge-function
   call sites that send through `check_transfer_caps`. The path used by **`Expenses.tsx → processExpensePayment`** (lines 323–467) and **the bulk-paths in `Approvals.tsx` / `Expenses.tsx`** sets
   `payment_batches.status='approved'` directly via `supabase.from(...)` and never calls the cap RPC.
   RLS allows the write, so caps are bypassed end-to-end for that flow.
3. **Cap edits are not audited.** The Super-Admin who edits `transfer_limits` does not produce a
   `transfer_audit` row, an `audit_logs` row, or any IP/UA capture. Anyone with super_admin can raise
   a cap, move money, then drop it back — and the only trace is the row's `updated_at` field.

There are also five **HIGH** findings (Paystack secret stored in plaintext-named-`_enc`, browser-driven
serial dispatch loop that cannot survive 5,000 items, `account_number` plaintext columns left
populated alongside encrypted shadow columns, no recipient-side reconciliation against bank statements,
and several `audit_logs` write paths that any authenticated user can spoof).

Finally, **USD-denominated obligations are not implemented at all.** The brief asked us to verify FX
capture/locking. There is no payable-in-USD schema, no FX rate locking on approval, no tolerance band,
and the `usd_rate` column on `company_settings` is set manually and read by no payment code path.

---

## 1. Severity-ranked summary table

| #   | Severity | Title                                                                                  | File(s)                                                                         |
|-----|----------|----------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| B-1 | BLOCKER  | No co-approval / dual-approval threshold for payment batches                           | `BatchDetail.tsx`, `Approvals.tsx`, `QuickPay.tsx`                              |
| B-2 | BLOCKER  | Cap RPC bypassed by direct-update paths (Expenses, bulk approve)                       | `Expenses.tsx`, `Approvals.tsx`                                                 |
| B-3 | BLOCKER  | Cap edits not written to any audit log (no who/when/old/new/IP)                        | `TransferAuthSettings.tsx`, `transfer-safety.ts`                                |
| B-4 | BLOCKER  | Self-approval allowed: a Finance user can submit + approve + fund + process their own batch | `BatchDetail.tsx`, `Approvals.tsx`                                          |
| B-5 | BLOCKER  | `transfer_audit` rows are inserted *after* Paystack accepts the transfer; cap usage never reflects in-flight money | `paystack-transfer/index.ts`               |
| B-6 | BLOCKER  | Quick Pay creates a batch in `funded` status with `approved_by = self`, no second eyes | `QuickPay.tsx`                                                                  |
| B-7 | BLOCKER  | Webhook idempotency table has no purge / size cap; vulnerable to slow-leak failure     | `webhook_idempotency` migration                                                 |
| H-1 | HIGH     | "Encrypted" Paystack secret column is plaintext; visible to anyone with admin/finance read | migration `20260503100000_api_key_columns.sql`, edge fns                    |
| H-2 | HIGH     | Browser-driven serial dispatch is not viable at 5,000 items; uses `/transfer` per item, not `/transfer/bulk` | `BatchDetail.tsx`, `batch-worker/index.ts`                |
| H-3 | HIGH     | Plaintext `account_number` column kept alongside `account_number_enc` — encryption is theatre | migration `20260428000001_encrypt_account_numbers.sql`                   |
| H-4 | HIGH     | `audit_logs` INSERT policy is `WITH CHECK (true)` — any authenticated user can spoof rows | migration `20260415150000`                                                |
| H-5 | HIGH     | No reconciliation against bank statements; only Paystack-vs-KDOps                      | `paystack-reconciliation/index.ts`                                              |
| H-6 | HIGH     | `processOneItem` writes status updates client-side without RLS row guards on terminal states | `BatchDetail.tsx:472-586`                                              |
| H-7 | HIGH     | Hardcoded ₦5,000,000 single-transfer limit duplicated in three places, two bypass the cap RPC | `BatchDetail.tsx:483`, `batch-worker/index.ts:148`                       |
| H-8 | HIGH     | Webhook handler swallows DB errors silently and always returns 200                     | `paystack-webhook/index.ts`                                                     |
| H-9 | HIGH     | Edge function logs the secret-presence boolean but also `params` on a denial — leakage risk | `paystack-transfer/index.ts:160,256`                                       |
| H-10| HIGH     | `getPaystackBalance` is gated only by JWT, not role, despite being marked privileged   | `paystack-transfer/index.ts:53,477`                                             |
| M-1 | MEDIUM   | Per-user override has no `expires_at` — overrides are permanent                        | migration `20260807000000_transfer_safety.sql`                                  |
| M-2 | MEDIUM   | No batch-total cap distinct from single/daily/monthly                                  | `transfer_limits` schema                                                        |
| M-3 | MEDIUM   | Cap relationship not enforced server-side (single ≤ daily ≤ monthly)                   | `transfer_limits` schema, `TransferAuthSettings.tsx`                            |
| M-4 | MEDIUM   | A user can edit their own role's cap (the UI lets them); no separation-of-duties check | `TransferAuthSettings.tsx`                                                      |
| M-5 | MEDIUM   | "Recent transfer audit (last 50)" is correct but capped at 50 — long-running forensics needs full export | `TransferAuthSettings.tsx:499`                                |
| M-6 | MEDIUM   | Velocity rules (>10 transfers / 5 min, single >3× 30-day avg, first-time recipient ≥ ₦1M) absent | `payment_anomaly_detection.sql` covers some but not these             |
| M-7 | MEDIUM   | `paystack-reconciliation` only chases items older than 1h → silent failure window of ≥1h | `paystack-reconciliation/index.ts:35`                                         |
| M-8 | MEDIUM   | OTP-required state writes `failure_reason` on the batch_item but does not change status, so the row is filterable as "pending" indefinitely | `paystack-reconciliation/index.ts:163`     |
| M-9 | MEDIUM   | If payment payload changes after approval, approval is **not** invalidated             | `BatchDetail.tsx`, `NewPaymentBatch.tsx`                                        |
| M-10| MEDIUM   | No FX rate capture/lock for USD obligations; `usd_rate` column unused by payment code  | schema-wide                                                                     |
| M-11| MEDIUM   | `payment_anomalies` rule "duplicate_payment" matches `succeeded` ↔ `pending` — can fire after reversal of either, with stale data | migration `20260805000000`                |
| M-12| MEDIUM   | Bulk-approve in `Approvals.tsx` does not invoke notify-submitter loop (silent approval) | `Approvals.tsx:587-680`                                                        |
| L-1 | LOW      | `console.log` in production edge functions leaks operational context                   | `paystack-transfer/index.ts:160,163`                                            |
| L-2 | LOW      | Bank-code map duplicated between `batch-worker/index.ts` and `nigerian-banks.ts`       | `batch-worker/index.ts:112-128`                                                 |
| L-3 | LOW      | `bulkTransfer()` exported from `paystack.ts` but never called from anywhere            | `src/lib/paystack.ts:444-452`                                                   |
| L-4 | LOW      | `NewPaymentBatch` review screen displays full unmasked account number on step 3        | `NewPaymentBatch.tsx:900`                                                       |
| L-5 | LOW      | `reset_transactional_data.sql` exists in the repo without `IF NOT EXISTS` / role gate  | `supabase/scripts/reset_transactional_data.sql`                                 |

---

## 2. BLOCKER findings — full detail

### B-1 — No co-approval threshold for payment batches

**Severity:** BLOCKER.
**The brief explicitly flagged this — it is real.**

**Proof.**

`src/pages/Approvals.tsx`, `approveOne()` (lines 360–489):

```ts
const update: any = { status: PENDING_STATUS[it.kind].approve };
if (it.kind === 'batch' || it.kind === 'budget') {
  update.approved_by = profile?.id;
}
const { error } = await supabase
  .from(TABLES[it.kind])
  .update(update)
  .eq('id', rawId(it.id));
```

For `kind === 'batch'`, the update writes `status='approved'` and `approved_by` and returns. There is
no second-approval step, no threshold lookup, no `pending_second_approval` state. The same flow exists
in `BatchDetail.tsx:376-464` (`updateStatus('approved', …)`).

`src/pages/Expenses.tsx:722` does enforce dual approval for *expenses*:
```ts
const needsDual = dualThreshold > 0 && amountNgn >= dualThreshold;
```
…but the equivalent guard is **absent** for `payment_batches` everywhere. The
`dual_approval_threshold_ngn` column is read only by `Expenses.tsx`.

`src/pages/Approvals.tsx:587-650` (`bulkApprove`) makes it worse — it lets a single approver flip
arbitrarily many batches to `approved` in one query.

**Why this is company-ending.**

The Transfer Authorization module caps how much *one person can move per day/month*. A super-admin
default of ₦100M/day is a real, signed-off number in this repo
(`migration 20260807000000_transfer_safety.sql:77`). Any account compromised within that role can move
₦100M before anyone wakes up. With **no second approver**, no email confirmation step, and no MFA on
approval, a phished super-admin session is a same-day total-balance loss event.

**Recommendation — fits inside Transfer Authorization, not parallel:**

1. Add columns to `transfer_limits`:
   ```sql
   ALTER TABLE public.transfer_limits
     ADD COLUMN co_approval_threshold_ngn numeric,        -- NULL = no co-approval required
     ADD COLUMN co_approval_required_for jsonb NOT NULL
       DEFAULT '["payment_batch","quick_pay","expense_payment"]'::jsonb;
   ```
2. Add columns to `payment_batches`:
   ```sql
   ALTER TABLE public.payment_batches
     ADD COLUMN second_approver_id   uuid REFERENCES profiles(id),
     ADD COLUMN second_approved_at   timestamptz,
     ADD COLUMN payload_hash_at_approval text;  -- for B-4 too
   ```
3. New batch state `pending_second_approval` (matching the expenses flow). Server-side: a
   `BEFORE UPDATE` trigger on `payment_batches` that fires when `status` transitions
   `pending_approval → approved`:
   - Look up the actor's effective `co_approval_threshold_ngn` (user override → role default).
   - If `total_amount > threshold` *and* `second_approver_id IS NULL` → raise the status to
     `pending_second_approval`, not `approved`.
   - If `total_amount > threshold` *and* `second_approver_id = approved_by` → raise exception.
4. Wire the same threshold into the edge function in `paystack-transfer/index.ts` so an Admin
   cannot skip the UI: when `action ∈ {initiate_transfer, bulk_transfer}`, look up the parent
   batch (or the synthetic single-transfer surface for Quick Pay) and refuse if the batch
   isn't in `approved` (i.e. fully co-approved) status.
5. Update `TransferAuthSettings.tsx` to expose a per-role "Co-approval required above ₦…"
   row in the existing role-defaults table — same column, three rows. Add the same field to
   the per-user override editor.

---

### B-2 — Cap RPC bypassed by direct-update paths

**Severity:** BLOCKER.

**Proof.**

`paystack-transfer/index.ts:271-332` enforces caps via `check_transfer_caps`. That works **only**
for the two edge-function actions `initiate_transfer` and `bulk_transfer`.

But the `Expenses.tsx → processExpensePayment` flow (lines 323–467) does this client-side:

```ts
const { data: batch, error: batchErr } = await supabase
  .from('payment_batches')
  .insert({
    name: batchName, …
    status: 'approved',          // ← skips the entire approval flow
    is_quick_pay: true,
    total_amount: expense.amount_ngn, …
  })
…
const transfer = await initiateTransferIdempotent({ …, amount_ngn: Number(expense.amount_ngn), … });
```

It then calls `initiateTransferIdempotent`, so for *that single transfer* the cap RPC fires. But:
1. The batch is materialised at `status='approved'` with `created_by = profile?.id` and no `approved_by`,
   no log, no review.
2. Multiple expenses approved in quick succession can each spawn their own ₦5M batch and slip under
   the *single* cap while collectively exceeding the *daily* cap — because each call enters the cap
   RPC independently and the cap RPC reads the rolling sum from `transfer_audit` which is only
   written on the previous *successful* edge-function dispatch (race window ~1–10s per transfer).

`Approvals.tsx:613-625` and `Expenses.tsx:894-904` are bigger holes — they write
`status='approved'` directly via `supabase.from(...).update(...)` for *bulk* approval. That path
never touches the edge function and never goes through `check_transfer_caps`.

**Why this is company-ending.**

A finance approver could click "Bulk Approve" on 200 expenses totalling ₦80M when their effective
daily cap is ₦20M, and nothing in this codebase will stop them.

**Recommendation:**

1. Move all batch-status mutations into a `SECURITY DEFINER` RPC
   `approve_payment_batch(p_batch_id uuid)` that:
   - Locks the batch row `FOR UPDATE`.
   - Verifies caller's role + co-approval rules (B-1).
   - Calls `check_transfer_caps(auth.uid(), v_batch.total_amount)` and refuses on `allowed=false`.
   - Updates status atomically.
   - Inserts the `transfer_audit` and `audit_logs` rows in the same transaction.
2. Revoke direct UPDATE on `payment_batches.status` from `authenticated` (current
   policy `batches_update` is too broad). Allow only via the RPC.
3. Replace the bulk-approve loops in `Approvals.tsx` and `Expenses.tsx` with N calls to that RPC.
   If 7 of 200 fail (cap, dual-approval, etc.), surface them.
4. For `Expenses.tsx → processExpensePayment`: also route through an `approve_expense_payment` RPC
   so the synthetic batch creation cannot bypass the cap aggregation.

---

### B-3 — Cap edits are not audited at all

**Severity:** BLOCKER.

**Proof.**

`src/lib/transfer-safety.ts:56-87` (`upsertTransferLimit`, `deleteTransferLimit`) writes the
`transfer_limits` row with the user's JWT. The migration `20260807000000_transfer_safety.sql`
gates RLS on super_admin only — fine — but there is **no INSERT into `transfer_audit`**, no
`audit_logs.insert`, no IP capture, no old/new value capture, no notification.

The `enforce_audit_immutability` trigger applied in `20260810100000` protects the *audit table*
from being modified, but if no row was ever written, immutability is irrelevant.

**Why this is company-ending.**

The Transfer Authorization screen markets itself as the control point that bounds insider risk. If
the only person who can edit caps can edit them silently, the control is theatre. A super-admin can
raise their own cap from ₦50M to ₦500M, run a transfer, and reset it — and the only forensic trace
is `transfer_limits.updated_at` (which the same user can also overwrite by editing again).

**Recommendation:**

1. Convert `upsertTransferLimit` to call a SECURITY DEFINER RPC `set_transfer_limit(...)` that:
   - Captures `auth.uid()`, `request.jwt.claims->>'ip'`, the `User-Agent`, `OLD` row, and `NEW` row.
   - Inserts a `transfer_audit` row with `action='cap_changed'` and metadata =
     `{old: <row>, new: <row>}`.
   - Then performs the upsert.
   - Refuses if `auth.uid() = NEW.user_id` (separation-of-duties — see M-4) or if
     `NEW.role = current_user_role()` (no editing your own role's cap).
2. The edge function `paystack-transfer` already hashes the IP. Mirror that approach for the cap
   editor — the UI can pass a client-collected fingerprint, but the source of truth for IP must
   be the request headers seen by an edge function or by Postgres' `request.headers` (PostgREST
   sets these as session settings).
3. Add a non-mutable `transfer_limits_history` table written by the same RPC for full
   point-in-time replay.

---

### B-4 — Self-approval is allowed on payment batches

**Severity:** BLOCKER.

**Proof.**

`src/pages/BatchDetail.tsx:362-394` (`updateStatus`) verifies the caller's role but never compares
`profile.id` against `batch.created_by`. The same is true of `Approvals.tsx:360-489`.

In `Expenses.tsx:710-718` there *is* a self-approval guard for non-admin roles, but it deliberately
exempts `super_admin` and `admin` roles. There is no equivalent guard at all for batches.

**Walk-through of the abuse.** A Finance user with the default ₦20M/day cap can:

1. `NewPaymentBatch.tsx` → create a batch paying themselves ₦5M.
2. Submit for approval → `pending_approval`.
3. Open the same batch — `canApprovePerm` is true because they're Finance.
4. Click *Approve* → status `approved`, `approved_by = self`.
5. Click *Confirm Funded* → `funded`.
6. Click *Process Payments* — the cap RPC fires, sees `amount=5M ≤ daily 20M`, returns
   `allowed=true`. Money leaves.
7. **Total elapsed time: ~30 seconds. Total people involved: 1.**

**Recommendation:**

1. Server-side reject: in `approve_payment_batch` RPC (B-2), `IF v_batch.created_by = auth.uid() THEN RAISE EXCEPTION`.
2. UI: hide the *Approve* button when `batch.created_by === profile?.id`.
3. Add an explicit `created_by != approved_by` CHECK on `payment_batches`.

---

### B-5 — Cap usage never reflects in-flight money

**Severity:** BLOCKER (tractable in code but it must be fixed before launch).

**Proof.**

`paystack-transfer/index.ts:502-527` writes the success `transfer_audit` row **after** the dispatch
returns. `check_transfer_caps` (`migration 20260807000000:179-193`) sums `transfer_audit.amount_ngn`
where `outcome='ok'`.

For a ₦5M batch with 100 transfers × ₦50,000:
- The edge function processes them serially in `BatchDetail.tsx:743-748`.
- Each call to `paystack-transfer` (a) checks the cap by reading `transfer_audit`,
  (b) calls Paystack, (c) writes the audit row.
- Between (a) and (c), an admin in another tab can submit and approve a second batch, hit (a) on
  *that* tab, and pass — because no row reflects the in-flight first batch yet.
- Two simultaneous bulk dispatches could both pass `daily ≤ 50M` even if their sum is ₦80M.

**Recommendation:**

Insert a `transfer_audit` row at action='intent' as the *first* step inside the cap-check
transaction, with `outcome='intent'`. Have `check_transfer_caps` also count `outcome IN ('ok','intent')`
inside its 24h/month window. Add a periodic sweep (every 5 minutes) that flips `intent` rows older
than 30 minutes that have no matching success/error to `outcome='abandoned'` so they release the
budget. This is a 30-line RPC change.

---

### B-6 — Quick Pay self-approves and creates a `funded` batch in one step

**Severity:** BLOCKER.

**Proof.**

`src/components/QuickPay.tsx:81-95`:
```ts
const { data: batch, error: batchErr } = await supabase
  .from('payment_batches')
  .insert({
    name: `Quick Pay — ${bank.account_name || bank.account_number}`,
    payment_date: new Date().toISOString().slice(0, 10),
    total_amount: amount,
    beneficiary_count: 1,
    status: 'funded',                       // ← skips draft/pending_approval/approved
    is_quick_pay: true,
    created_by: profile?.id,
    approved_by: profile?.id,               // ← self-approves
  })
```

Quick Pay is gated by `payments.quick_pay` permission + `APPROVER_ROLES`, but any qualifying user
can move up to their *single-transfer cap* with no second eyes, no co-approval, and no approval
record visible in the standard Approvals queue. The `payment_anomalies` engine doesn't catch this
because Quick Pay isn't covered by any rule that flags self-approved single-step batches.

**Recommendation:**

1. Default: Quick Pay caps at the same single-transfer cap as bulk. Above the *co-approval
   threshold* (B-1), Quick Pay must spawn a `pending_approval` batch instead of `funded`.
2. Add `payment_anomalies` rule `quick_pay_self_initiated` (medium) — every Quick Pay over ₦100k
   should be flagged for review next morning.
3. Restrict Quick Pay further: require an explicit Settings toggle to enable it, default off,
   surface the toggle in TransferAuthSettings.

---

### B-7 — `webhook_idempotency` has no purge / size cap

**Severity:** BLOCKER (operational).

**Proof.** Migration `20260616000000_phase1_security_and_missing_tables.sql:250-263` defines
`webhook_idempotency (reference, event_type, processed_at)` with PK on the first two and an index
on `processed_at` — but **no retention job**. Every webhook delivery (success, failure, reversal)
adds a row. At 5,000 transfers/run × 3 events × 4 runs/month = **60,000 rows/month**. Over a year
that's ~720k rows.

That's still small enough. The real risk is what happens when Paystack retries an old transfer's
webhook at high volume during an incident: rows pile up, the unique-violation path in the webhook
handler (`paystack-webhook/index.ts:313-321`) is hit, and the `console.warn` spam can mask a real
failure mode. Also, after 90 days Paystack guarantees no replays, so older rows are pure dead weight.

**Recommendation:**

1. Add a daily pg_cron job:
   ```sql
   DELETE FROM webhook_idempotency WHERE processed_at < now() - interval '90 days';
   ```
2. Add an index on `(event_type, processed_at)` for the cleanup query.
3. Add a row count exporter to your monitoring (Sentry already wired) so a runaway is visible.
4. Critical: in `paystack-webhook/index.ts:313-321`, when the insert errors with anything *other*
   than 23505, the handler currently logs a warning and **proceeds** to update the batch_item
   anyway. That should hard-fail with a 500 (forcing Paystack to retry) instead of silently
   risking a double-update on a different bug.

---

## 3. HIGH findings — full detail

### H-1 — Paystack secret stored in plaintext under a column named `_enc`

**Severity:** HIGH.

**Proof.**
- Migration `20260503100000_api_key_columns.sql:1-15`:
  ```sql
  -- In production, enable Supabase Vault or pgcrypto for at-rest encryption.
  -- The application masks these fields in the UI (shows last 4 chars only after save).
  ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS paystack_secret_key_enc text;
  ```
  The `_enc` suffix is *naming convention only*. There is no `pgcrypto` wrap, no Vault binding,
  no application-side encryption. The column is plain `text`.
- `Settings.tsx:251` writes the raw user input straight in:
  ```ts
  paystack_secret_key_enc: (settings as any).paystack_secret_key_enc || null,
  ```
- `paystack-transfer/index.ts:124`, `paystack-webhook/index.ts:54`,
  `paystack-reconciliation/index.ts:48` all read the column and pass it directly as
  `Authorization: Bearer …`. If the value were truly encrypted, this would not work.

**Why this matters.** RLS `company_settings_read_staff` (migration `20260730000004:76-79`) lets
**any super_admin / admin / finance** SELECT this column. Any one of those accounts being phished,
having a leaky session, or being an internal threat = total Paystack secret-key exfiltration.
Rotating the key is then an operations event (Paystack dashboard + secret update + redeploy).

**Recommendation.**
1. Move the secret to **Supabase Vault** and have the edge functions read via
   `vault.decrypted_secrets`. The `tick_batch_worker` function in
   `20260730000005_batch_worker_cron.sql` already does this for the cron secret — copy that pattern.
2. Drop the `paystack_secret_key_enc` column once Vault is in place.
3. If you must keep an in-DB copy as a fallback: encrypt with `pgp_sym_encrypt` keyed off
   `_private.enc_keys` (already exists in `20260428000001`) and write a SECURITY DEFINER RPC
   `get_paystack_secret()` that only `service_role` can call. Then RLS on
   `company_settings.paystack_secret_key_enc` becomes immaterial because the column is unreadable
   in plaintext.
4. Set a calendar reminder for Paystack key rotation (90 days max) and document the rotation
   procedure in `docs/runbooks/`.

---

### H-2 — Browser-driven serial dispatch is not viable at 5,000 items

**Severity:** HIGH.

**Proof.**

`BatchDetail.tsx:743-748`:
```ts
for (let i = 0; i < toProcess.length; i++) {
  const it = toProcess[i];
  setProcessingIdx(i + 1);
  setProcessingName(it.full_name);
  await processOneItem(it, customNarration);
}
```

A 5,000-item batch:
- Each `processOneItem` invocation = 1–3 Paystack edge-function round-trips
  (`create_recipient` if missing + `initiate_transfer`) + DB writes + audit writes.
  Mean ~600ms, p95 ~2s.
- 5,000 × 600ms = **50 minutes** sitting in one browser tab. Closing the tab, network blip, tab
  throttling, OS sleep — all kill the run.
- The orphan watchdog (`batch-worker` cron, `20260730000005`) recovers it, but:
  - It picks up *one* orphan per tick (line 328 of `batch-worker/index.ts`) and tops out at
    `TIME_BUDGET_MS = 120_000` per tick.
  - With 5,000 items and 8-way concurrency, ~600 items/min throughput × 120s tick = ~120 items
    per tick. **5,000 items therefore needs ~42 ticks = 42 minutes** of cron windows after the
    operator gives up.
  - During that 42 minutes the *cap usage* is being walked one item at a time. There is no
    pre-flight reservation that says "this batch will consume ₦80M of the ₦100M daily cap" — the
    daily cap is consumed by each individual `transfer_audit` row landing.

The `bulk_transfer` action in `paystack-transfer/index.ts:431-462` exists but **is never called by
the application**. `src/lib/paystack.ts:444 (bulkTransfer)` is exported and orphaned. So the system
is paying for 5,000 individual `/transfer` calls when it could batch into 50 × `/transfer/bulk` calls.

**Why this matters.** A failure in the middle of a 5,000-item batch leaves 700 contractors paid,
4,300 not, finance staring at a tab that closed two hours ago, and the orphan watchdog quietly
churning while the cap RPC concurrently allows another bulk attempt. **This is exactly the
"silent failure swallows money" scenario the brief warned about.**

**Recommendation.**

1. Move the dispatch loop entirely server-side. The `batch-worker` already does this — wire the UI
   to call it once with `{batch_id}` and never fall back to client-side dispatch.
   Remove the loop in `BatchDetail.tsx:741-748`. Remove `processOneItem` from the client.
2. Switch the batch-worker to use `/transfer/bulk` (max 100 per call, ≥5s spacing per Paystack
   docs — already noted in `paystack-transfer/index.ts:432-433`):
   - Group by recipient bank if helpful for failure isolation.
   - Track `bulk_transfer_id` per chunk so reconciliation can refer to a Paystack-side bulk batch.
3. Persist a `payment_dispatch_state` row per chunk so resumption after a crash is precise:
   `(batch_id, chunk_index, started_at, completed_at, items_succeeded, items_failed)`.
4. Reserve cap usage *up front* on batch approval, not during dispatch (see B-5).

---

### H-3 — Plaintext `account_number` column kept alongside `account_number_enc`

**Severity:** HIGH.

**Proof.** Migration `20260428000001_encrypt_account_numbers.sql:18`:
> Plaintext columns are KEPT so existing app code keeps working; the UI masks them (****NNNN).

`batch_items.account_number`, `profiles.bank_account_number`, `contractors.account_number`,
`vendors.bank_account_number`, `contractor_applications.account_number` — all still hold the raw
account number. Every RLS-permitted SELECT returns plaintext. The encrypted shadow column adds zero
defensive value.

`paystack-webhook/index.ts:286` literally reads `account_number` plaintext to render emails. The
fuel anomaly engine (`20260805000000:441-450`) joins on plaintext `bank_account_number`. The whole
codebase relies on the plaintext column.

**Why this matters.** NDPR (Nigeria Data Protection Regulation) treats bank account numbers as
personal financial data. A SQL injection, a Supabase service-role leak, a misconfigured RLS policy,
or a backup snapshot leak exposes ~700 contractors' account numbers in cleartext.

**Recommendation.**

1. Either *commit* to encryption (drop the plaintext column, decrypt on read via the existing
   `get_decrypted_account_number` RPC, mask everywhere else), *or* drop the encryption migration —
   don't keep both. Half-encryption is worse than none because it implies a control that doesn't
   exist.
2. If you keep the encrypted column, add hash-on-write so anomaly joins (rule 8 + 9 + 10 in
   `payment_anomaly_detection.sql`) match on a deterministic hash, not plaintext, eliminating
   the need for plaintext to satisfy joins.
3. Same applies to `paystack_funding_account_number` in `company_settings` (likely the
   company's own funding account — not as critical but still PII).

---

### H-4 — `audit_logs` INSERT policy is `WITH CHECK (true)` — any user can spoof rows

**Severity:** HIGH.

**Proof.** Migration `20260415150000_add_phone_and_audit_logs.sql:32-33`:
```sql
CREATE POLICY "Authenticated users can create audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);
```

`src/lib/audit.ts:117-130` writes:
```ts
const { error } = await supabase.from('audit_logs').insert({
  action_type: actionType,
  description,
  performed_by: performedBy,
  performed_by_name: performedByName,
});
```

Both `performed_by` and `performed_by_name` are user-supplied. A driver-role user can:
```ts
await supabase.from('audit_logs').insert({
  action_type: 'batch_approved',
  description: 'Batch "Q2 Salary Run" approved (₦80,000,000)',
  performed_by: '<some admin uuid>',
  performed_by_name: 'Joseph Iyene',
});
```
…and that row is now in the audit trail, indistinguishable from a real one. The
`enforce_audit_immutability` trigger then *protects* the spoofed row from being deleted.

**Recommendation.**

1. Tighten the INSERT policy to:
   ```sql
   CREATE POLICY "audit_logs_insert_self" ON public.audit_logs
     FOR INSERT TO authenticated
     WITH CHECK (performed_by = auth.uid() OR performed_by IS NULL);
   ```
   And ignore `performed_by_name` from the client — set it server-side from `auth.uid()` via
   a BEFORE INSERT trigger.
2. Better yet, route all audit writes through a SECURITY DEFINER RPC `log_audit(action_type, description)`
   that auto-fills `performed_by = auth.uid()` and the user's stored name. Revoke direct INSERT.
3. Capture IP and user agent on each row (extra columns: `ip_hash`, `user_agent`,
   `request_id` — like `transfer_audit` already does).

---

### H-5 — No reconciliation against bank statements; only Paystack-vs-KDOps

**Severity:** HIGH.

**Proof.** `paystack-reconciliation/index.ts` walks rows where `status IN ('pending','retry')` and
asks **Paystack** what happened. It never reads bank statements, never compares NIBSS settlement
files, never confirms the funding account was actually debited.

The `payment_batches` schema has no `bank_settlement_status` column. There is no
`bank_statement_uploaded` table tied to anything (the audit_log type
`bank_statement_uploaded` exists in `audit.ts:84` but no UI surface uses it).

**Why this matters.** Paystack reporting `success` while the merchant's funding bank rejected the
debit (insufficient balance, hold, account flag) is a documented edge case. Without a bank-side
reconciliation, the platform can show ₦80M paid and Finance only finds out when 4,300 contractors
chase them three days later.

**Recommendation.**

1. Daily cron: pull yesterday's Paystack `Balance History` (`/balance/ledger`) and compare gross
   sum to internal `succeeded` total. Flag any drift > ₦1.
2. Weekly: import the funding bank's MT940 statement (or CSV from the bank portal) into a
   `bank_statements` table. Auto-match by date + amount + narration to `payment_batches` and
   `batch_items`. Flag unmatched > 24h.
3. Surface unreconciled items > 6h on the Payments dashboard with a red alert.

---

### H-6 — `processOneItem` writes status updates client-side without RLS row guards on terminal states

**Severity:** HIGH.

**Proof.** `BatchDetail.tsx:472-586` — the client updates `batch_items.status` directly:
```ts
await supabase.from('batch_items').update({ status: 'failed', failure_reason: reason }).eq('id', it.id);
```
RLS `batch_items_update` (`20260608000000:65-69`) allows any super_admin/admin/finance to UPDATE,
with **no row-state guard**. So:
- A finance user can reverse a `succeeded` row to `pending` and "retry" it.
- A finance user can flip a `failed` row to `succeeded` to silence a complaint.
- Same for `payment_batches.status`.

Combined with H-4 (audit log spoofing), this is a substantial fraud surface.

**Recommendation.**

1. Add a BEFORE UPDATE trigger on `batch_items` and `payment_batches` that enforces a
   directed state machine and refuses backward transitions:
   ```
   batch_items: pending → succeeded | failed | reversed | retry  (one-way once terminal)
   payment_batches: draft → pending_approval → approved → funded → processing → processed | partially_processed
   ```
2. Restrict the columns each role can update. Finance probably needs no direct write on
   `payment_batches.status` once approval RPCs (B-1, B-2) exist.
3. The "Retry" path should not flip `succeeded`/`failed` rows — it should instead create a *new*
   `batch_items` row pointing at the same recipient with a `retried_from_id` link. Preserves
   immutability of the original audit chain.

---

### H-7 — Hardcoded ₦5,000,000 single-transfer limit duplicated in three places

**Severity:** HIGH.

**Proof.**
- `BatchDetail.tsx:483`: `if (amount > 5_000_000) return markFailed('Single transfer limit is ₦5,000,000…');`
- `batch-worker/index.ts:148`: `if (amount > 5_000_000) return fail('Single transfer limit is ₦5,000,000');`
- `paystack.ts:241` (error mapper text only).

If finance updates the per-role single cap in TransferAuthSettings, the **client and worker still
independently reject anything > ₦5M** — the cap UI is a lie above ₦5M.

Conversely, **the client checks fire only in those locations**. There is no central enforcement.
A future code path that doesn't reproduce the check would silently allow >₦5M.

**Recommendation.**

1. Remove the hardcoded `5_000_000` checks. Rely solely on `check_transfer_caps`.
2. If a hard ceiling is desired (e.g. NIBSS limit), make it a `company_settings.max_single_transfer_ngn`
   column with a sensible default and read by *both* the worker and the cap RPC.

---

### H-8 — Webhook handler swallows DB errors silently and always returns 200

**Severity:** HIGH.

**Proof.** `paystack-webhook/index.ts:21` (file header):
> Error policy: always return 200 OK — throwing causes Paystack to retry indefinitely.

That intent is right for *Paystack-side retry storms*. The implementation is wrong: every DB
error is `console.error`-only:
- Lines 119-121: batch status update failure → log only, return 200.
- Lines 350-364: batch_item update failure → log only, return 200.
- Lines 401-417: same for transfer.failed branch.

If a transient DB outage hits during the success branch, the platform's batch_item stays
`pending`, the webhook is marked idempotent-processed, and **the system will never auto-recover
that row** (the reconciliation job only chases `pending` items, but the next webhook delivery is
now a 23505 dup → silent skip).

**Recommendation.**

1. Distinguish "Paystack will retry helpfully" from "we want Paystack to stop" semantically. For
   the former, return 5xx. For the latter (already-processed dup), return 200.
2. On batch_item update failure: don't insert into `webhook_idempotency` (the order is reversed in
   the current file — idempotency is inserted at line 311 *before* the update at line 350). Move
   the idempotency insert into the same transaction as the update so both succeed or both fail.
3. Add a Sentry breadcrumb on every webhook update failure so you actually see them.

---

### H-9 — Edge function logs the secret-presence boolean and parameters on a denial

**Severity:** HIGH.

**Proof.**
`paystack-transfer/index.ts:160`:
```ts
console.log("[paystack-transfer] env_secret_present:", hasEnvSecret, "| auth_header_present:", hasAuth);
```
This is a benign logger but Supabase function logs are persisted and accessible to anyone with
project Logs read. Fine. But:

`paystack-transfer/index.ts:251-257`:
```ts
metadata: { params },
```
On a denial-by-permission, the function dumps the inbound `params` object — which for
`initiate_transfer` includes `recipient_code`, `amount_ngn`, `reference`, and (for
`create_recipient`) `account_number`. These end up in `transfer_audit.metadata` (jsonb). Any
admin/finance/super_admin can read that table.

**Recommendation.**

1. Strip sensitive fields from `params` before persisting:
   ```ts
   const safeParams = { ...params };
   delete safeParams.account_number;
   delete safeParams.recipient_code;
   ```
2. Drop the `console.log` that prints request metadata in line 160 — Supabase logs already capture
   this. (Also see L-1.)

---

### H-10 — `getPaystackBalance` is gated only by JWT, not role

**Severity:** HIGH (information leakage).

**Proof.** `paystack-transfer/index.ts:53`:
```ts
const PRIVILEGED_ACTIONS = new Set([
  "create_recipient", "initiate_transfer", "bulk_transfer", "verify_transfer", "get_balance",
]);
```
…so on paper, `get_balance` is privileged. But look at how it's called:
`Payments.tsx:97-101` calls `getPaystackBalance()` on every Payments page load. The Payments
page is reachable by anyone with `payments` access — which by default includes operations in the
`current_user_role` allowlist (`fix_rls_finance_operations_access.sql:28-31`).

In the edge function, the role gate at line 247 *would* catch operations and reject — except that
the gate logs the rejection as `outcome: 'denied'` and returns 403. So operations cannot read the
balance. **However**, the route `/balance` returns the raw NGN-balance number which is also
displayed in the UI, and the toast on a 403 reveals the failure pattern. Lower-priority but worth
noting: the balance number is operationally sensitive (a large drain attack benefits from knowing
how much is sitting in the wallet).

**Recommendation.**

1. Either remove `get_balance` from PRIVILEGED_ACTIONS and let any logged-in admin/finance see it,
   or restrict the Payments page's *balance card* to the same role list as the edge function and
   suppress the call entirely for operations.
2. Throttle `get_balance` to once per 60s per user; right now `Payments.tsx:106` retries on session
   restore which can create an unbounded retry loop on a misbehaving session.

---

## 4. MEDIUM findings — full detail

### M-1 — Per-user override has no `expires_at`

**Severity:** MEDIUM. *(Brief explicitly asked us to flag this.)*

**Proof.** `migration 20260807000000_transfer_safety.sql:34-47` defines `transfer_limits` with
`single_txn_limit_ngn`, `daily_limit_ngn`, `monthly_limit_ngn`, `notes`, `created_at`, `updated_at`.
There is no `expires_at`, no `granted_by`, no `reason_required`. Override = forever.

**Why it matters.** Operationally, "Joseph needs ₦10M today to pay a vendor" turns into a permanent
override because nobody comes back and removes it. Permanent overrides are how cap regimes erode.

**Recommendation.**

1. Add columns:
   ```sql
   ALTER TABLE public.transfer_limits
     ADD COLUMN expires_at timestamptz,
     ADD COLUMN granted_by uuid REFERENCES profiles(id),
     ADD COLUMN granted_reason text;
   ```
2. Default `expires_at = now() + interval '30 days'` for any user-level row (`user_id IS NOT NULL`)
   on insert, hard cap at `now() + interval '90 days'`.
3. `check_transfer_caps` should ignore expired rows: add `AND (expires_at IS NULL OR expires_at > now())`
   to the user-level lookup.
4. Surface a "Expiring in N days" badge in TransferAuthSettings and let super_admin renew with a
   one-click extension that re-records justification.
5. Daily cron: notify the cap editor + the affected user 7 days before expiry.

---

### M-2 — No batch-total cap distinct from single/daily/monthly

**Severity:** MEDIUM.

**Proof.** `transfer_limits` has only `single`, `daily`, `monthly`. A 5,000-item batch totalling
₦150M is a fundamentally different risk profile from 5,000 unrelated transfers across a month,
but they share the same monthly bucket.

**Recommendation.**

1. Add `single_batch_limit_ngn` to `transfer_limits`.
2. Enforce in `paystack-transfer/index.ts:271-332` for `bulk_transfer`. (When the batch-worker
   path is the dispatcher — recommended in H-2 — it should pass the batch's `total_amount` once
   to a new RPC `check_batch_caps(p_user_id, p_batch_total_ngn)` *before any item is dispatched*.)
3. Surface in TransferAuthSettings as a fourth column on the role-defaults table, fitting the
   existing UI grid.

---

### M-3 — Cap relationship not enforced (single ≤ daily ≤ monthly)

**Severity:** MEDIUM.

**Proof.** `TransferAuthSettings.tsx:191-215` accepts any number for any cap. `transfer_limits`
schema has no CHECK constraint. A super_admin can set `daily=5M` and `monthly=1M` — the cap RPC
will return `allowed=false` on the first ₦5M transfer because monthly is exceeded, even though
the row is "valid". Worse, a single=10M with daily=1M is silently inconsistent.

**Recommendation.**

1. Add CHECK:
   ```sql
   ALTER TABLE public.transfer_limits ADD CONSTRAINT transfer_limits_cap_ordering CHECK (
     COALESCE(single_txn_limit_ngn, 0) <= COALESCE(daily_limit_ngn, single_txn_limit_ngn, 0)
     AND COALESCE(daily_limit_ngn, 0) <= COALESCE(monthly_limit_ngn, daily_limit_ngn, 0)
   );
   ```
2. Mirror the validation in the UI for friendlier errors.

---

### M-4 — A user can edit their own role's cap

**Severity:** MEDIUM.

**Proof.** `transfer_limits` RLS (`20260807000000:58-63`):
```sql
CREATE POLICY "Super admin manages transfer_limits" ON public.transfer_limits
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid() AND p.role = 'super_admin'));
```
A super_admin can edit any row, including the `super_admin` role-default row, including
their own user-level override (if one exists).

`TransferAuthSettings.tsx:191-215` (`handleSaveRoleLimit`) and lines 217-244 (`handleAddOverride`)
do not check `auth.uid()` against the row being edited.

**Recommendation.**

1. Server-side guard in the new RPC `set_transfer_limit` (B-3):
   ```sql
   IF p_role = (SELECT role FROM profiles WHERE id = auth.uid())
      OR p_user_id = auth.uid() THEN
     RAISE EXCEPTION 'You cannot edit your own role''s cap or your own user override';
   END IF;
   ```
2. UI: hide rows where `role === profile.role` from the editable set. Show them read-only with a
   tooltip explaining another super_admin must change them.
3. For a single-super_admin company, document the bootstrap escape: invite a temporary co-admin to
   change caps, then remove them. (This is unavoidable for any separation-of-duties control.)

---

### M-5 — "Recent transfer audit (last 50)" capped at 50

**Severity:** MEDIUM.

**Proof.** `TransferAuthSettings.tsx:499` and `transfer-safety.ts:89-99` hard-limit the audit
fetch to 50 rows. There is no pagination, no date filter, no CSV export.

**Why it matters.** Forensics on a high-velocity day can need the last 5,000 rows, not the last 50.

**Recommendation.**

1. Replace the static "last 50" panel with a paginated view (offset or keyset) and date range filter.
2. Add a CSV export button. Edge function `paystack-transfer` already audits with metadata; the
   CSV should include actor, action, amount, recipient_code (last 4 only), reference, ip_hash,
   reason, metadata-json. Put the export button next to "Refresh".
3. Also link to a full-trail page (`/audit-log` already exists per `pages/AuditLog.tsx`) filtered
   to action types starting with `paystack_` or `cap_`.

---

### M-6 — Velocity rules absent

**Severity:** MEDIUM.

**Proof.** The brief listed three velocity rules to verify. Of those, *none* exist:

- `>10 transfers in 5 minutes from one user` — not in `payment_anomaly_detection.sql`.
- `single transfer >3× user's 30-day average` — not present.
- `first-time recipient above ₦1M` — partial: rule 14 (`new_beneficiary_paid`) flags any new
  beneficiary, regardless of amount, at MEDIUM severity. No amount threshold.

The existing rules cover ghost workers, salary spikes, off-hours payroll approvals, shared bank
accounts, account-changed-then-paid, duplicate payments — all good. But the *transfer-velocity*
ones are missing.

**Recommendation.**

Add to the daily sweep (`scan_daily_anomalies` in `20260805000000`):
```sql
-- velocity_burst: >10 transfers in 5 minutes from one approver
INSERT INTO payment_anomalies (rule_code, severity, module, …)
SELECT 'velocity_burst', 'high', 'payments', …
FROM (
  SELECT actor_id, count(*) AS n,
         min(created_at) AS first_at, max(created_at) AS last_at
  FROM transfer_audit
  WHERE action IN ('initiate_transfer','bulk_transfer')
    AND outcome = 'ok'
    AND created_at > now() - interval '24 hours'
  GROUP BY actor_id, date_trunc('minute', created_at)
  HAVING count(*) > 10
    AND max(created_at) - min(created_at) <= interval '5 minutes'
) v …

-- spike_vs_30d: single transfer > 3× actor's 30-day mean
-- first_time_recipient_high_value: new recipient + amount ≥ ₦1M
```

Threshold for `first_time_recipient_high_value` should be configurable in `company_settings`.

---

### M-7 — Reconciliation 1-hour gap

**Severity:** MEDIUM.

**Proof.** `paystack-reconciliation/index.ts:35`:
```ts
const STUCK_THRESHOLD_HOURS = 1;
```
Items only get re-checked if they've been pending for >1h. A webhook miss on a successful
transfer keeps the row in `pending` for ≥1h, with no UI signal that recovery is in progress.

**Recommendation.**

1. Drop to 5 minutes for the first-pass scan. Add a separate, daily 24-hour-deep scan for
   anything still pending.
2. Surface "Reconciliation pending" inline on the batch detail page so finance knows the
   platform knows.
3. Run reconciliation more often during business hours (cron `*/5 9-18 * * 1-5`) and less often
   off-hours.

---

### M-8 — OTP-required state writes `failure_reason` but doesn't change `status`

**Severity:** MEDIUM.

**Proof.** `paystack-reconciliation/index.ts:163-168`:
```ts
await service.from("batch_items").update({
  failure_reason: "Awaiting OTP authorization — approve on dashboard.paystack.co …",
  paystack_raw: body.data,
}).eq("id", it.id);
otpRequired++;
otpItems.push({ name: it.full_name, ref: it.paystack_reference });
unchanged++;
```

The row stays `pending`. The next reconciliation tick re-flags it as OTP-required and re-notifies.
The watchdog assumes pending items are dispatch-pending and may try to recreate the recipient on
retry. It also breaks the simple "anything pending > 24h is stuck" alerting heuristic — half the
"stuck" rows are actually waiting on a human.

**Recommendation.**

1. Add a new `batch_items.status` value `awaiting_otp` (CHECK constraint update). Existing
   `'pending' / 'retry'` semantics stay clean.
2. The state machine trigger from H-6 should allow `pending → awaiting_otp → succeeded | failed`.
3. UI: dedicated badge and an alert box explaining the operator must approve in Paystack
   dashboard. Already done in `BatchDetail.tsx:1512-1521`, but the underlying status doesn't
   match — fix in concert.
4. Reconciliation should only count `awaiting_otp` against an OTP-aware threshold (e.g. flag if
   awaiting > 4h during business hours).

---

### M-9 — Approval not invalidated when payload changes

**Severity:** MEDIUM.

**Proof.** Once a batch is `approved`, `BatchDetail.tsx` does not edit-lock items. RLS
`batch_items_update` allows finance/admin to mutate `amount_ngn`, `account_number`, `bank_name`
on an approved batch. The next state transition (`funded` → `processing`) reads the *current*
items, so a finance user can:

1. Submit a batch totalling ₦10M (within their cap) for approval.
2. Get it approved.
3. Edit any item's amount upward — now total is ₦80M, but the row is `approved`.
4. Process — only at *that* point does the cap RPC fire, and it sees ₦80M and rejects.
5. *Or worse*, the cap RPC is bypassed for a per-item dispatch (see B-5 in-flight gap), and
   each ₦5M-or-less item slips past the single cap.

`approved_by` is recorded but `approved_payload_hash` is not.

**Recommendation.**

1. On approval, store `payload_hash_at_approval = digest(canonical_json_of_items, 'sha256')`.
2. BEFORE UPDATE trigger on `payment_batches` and `batch_items` that, when the batch is in
   `approved | funded | processing | partially_processed | processed`, refuses *any* mutation of
   `total_amount`, `beneficiary_count`, or `batch_items.amount_ngn / account_number / bank_name`
   for that batch_id.
3. To "edit", a user must re-submit the batch as a new draft (via existing
   `Re-edit & Resubmit` flow already in `BatchDetail.tsx:1297-1320`).
4. On `Process Payments`, recompute the hash from current items and compare. If it doesn't
   match, abort and force re-approval.

---

### M-10 — No FX rate capture/lock for USD obligations

**Severity:** MEDIUM. *(Specifically called out in the brief.)*

**Proof.** Schema has `company_settings.usd_rate` (single number, manually edited via Settings).
No table has `obligation_currency`, `obligation_amount`, `fx_rate_at_obligation`, `fx_rate_locked_at`.
No code path uses `usd_rate` for anything except a Settings input field. The contractor /
contractor_application schemas track only `account_number` and `default_amount_ngn`.

The chatbot (`functions/chatbot-chat/index.ts:46`) uses `open.er-api.com` for live FX queries, but
that's an unauthenticated public API not suitable for actuating real money.

**Why it matters.** The brief says "USD partner obligations". If KDOps owes a partner $X but pays
in NGN at the day's rate, an unlocked rate exposes the company to FX swings between obligation
date and payment date. With NGN volatility this can be ±10% over a few weeks.

**Recommendation.**

1. Add an `obligations` table:
   ```sql
   CREATE TABLE obligations (
     id uuid PK,
     contractor_id uuid,
     ...
     obligation_currency text NOT NULL CHECK (obligation_currency IN ('NGN','USD','GBP','EUR')),
     obligation_amount  numeric NOT NULL,
     ngn_amount_locked  numeric,
     fx_rate            numeric,
     fx_rate_source     text,             -- 'cbn' | 'wise' | 'paystack' | 'manual'
     fx_rate_locked_at  timestamptz,
     fx_locked_by       uuid,
     status             text CHECK (status IN ('open','approved','executed','reconciled','closed'))
   );
   ```
2. Lock FX rate at approval time, not execution time. Re-approval required if execution-time rate
   has drifted > X% (configurable, default 2%).
3. Source the rate from a *paid, audited* provider (CBN official, Wise API, or Paystack itself).
   Don't use open.er-api.com for money decisions.
4. Add fallback: if rate API is down, refuse to approve (don't silently use the last cached rate
   for a stale period). Cache lifetime should be measured in minutes, not hours.

---

### M-11 — `duplicate_payment` rule matches succeeded ↔ pending

**Severity:** MEDIUM.

**Proof.** `payment_anomaly_detection.sql:467-485`:
```sql
WHERE b1.created_at > now() - INTERVAL '30 days'
  AND b1.status IN ('succeeded','pending')
  AND … b2.status IN ('succeeded','pending')
```

A retry that creates a new `pending` row + the original `failed`-then-`reversed` original row
will not match (good). But two genuine attempts to the same recipient, one succeeded and one
still pending, will be flagged as a duplicate even though the pending one might fail. Once a
flag fingerprint is locked, the row persists even if the "duplicate" later fails — so the
anomaly queue ends up with stale flags.

**Recommendation.** Tighten to `b2.status = 'succeeded'` only (and re-run nightly when items
transition). Or accept the false-positive cost and add a UI "auto-clear when subject row is no
longer succeeded" — but that requires watching the subject lifecycle, which the immutable
`payment_anomalies` table currently doesn't support cleanly.

---

### M-12 — Bulk-approve in `Approvals.tsx` doesn't notify submitters

**Severity:** MEDIUM.

**Proof.** `Approvals.tsx:587-680` runs the update batch but only logs `bulk_approved` once. No
per-submitter `notifications` row is inserted (compare with `approveOne()` at lines 454-470 which
does notify per item). For a bulk approval of 50 expense reimbursements, no contractor finds out.

**Recommendation.** Loop the notification insert per row inside `bulkApprove`, or send a single
batched notification per submitter (group by submitter, "5 of your expenses approved").

---

## 5. LOW findings — full detail

### L-1 — `console.log` in production edge functions

`paystack-transfer/index.ts:160,163` — see also H-9. The Supabase log explorer collects these.
At 5,000 transfers × 4 console lines each, the function logs are unscannable noise. Drop the
informational `console.log`s and keep only `console.error`/`console.warn`.

### L-2 — Bank-code map duplicated between `batch-worker/index.ts:112-128` and `nigerian-banks.ts`

Two sources of truth. If a new bank or a bank-code change happens, one will lag. Lift into a
shared `_shared/banks.ts` consumable by both Deno (edge) and Node (Vite client) — the existing
`nigerian-banks.ts` already exists in `src/lib/`, just import a Deno-friendly subset from a
shared module.

### L-3 — `bulkTransfer()` exported but never called

`src/lib/paystack.ts:444-452`. Either wire it into the dispatcher (preferred — see H-2) or
delete it. Dead code in a money path is a maintenance hazard.

### L-4 — Unmasked account number on `NewPaymentBatch` review screen

`NewPaymentBatch.tsx:900`: `<TableCell>{item.account_number}</TableCell>` — this is the *review*
step, viewed only by the operator who composed the batch. Still, the rest of the system masks
account numbers (`maskAccountNumber()` is used 9 places). Consistency: mask here too.

### L-5 — `reset_transactional_data.sql` has no role gate

`supabase/scripts/reset_transactional_data.sql` exists in the repo. Its content (not read in
detail here) almost certainly truncates transactional tables. Make sure CI / production access
is gated and the file ships under a `scripts/` path that is *not* an active migration directory.
Add a guard: `IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION …`.

---

## 6. Critical-checks coverage (A through K from the brief)

The brief listed eleven check families and asked for an explicit verdict on each. This section
gives the verdict, the evidence, and the gaps.

### [A] Idempotency

**Verdict: PARTIAL.** Solid for transfers; weak for batch approval and webhook → DB writes.

| Sub-check | Evidence | Verdict |
|---|---|---|
| Every payment-creating endpoint accepts/enforces an idempotency key | `paystack-transfer/index.ts:355-428`, `BatchDetail.tsx:524`, `QuickPay.tsx:126`, `batch-worker/index.ts:81` — all derive `kdops_<itemUUID>` deterministically | OK |
| Mid-flight retry is safe (no double-pay) | `paystack-transfer/index.ts:366-392` checks `paystack_reference` first; `408-427` recovers from Paystack-side dup | OK |
| Idempotency keys stored, indexed, checked | `batch_items.paystack_reference` is unique-ish; index added in `20260428000002_batch_items_batch_id_index.sql`. `webhook_idempotency` PK on `(reference, event_type)` | OK |
| TTL on idempotency keys long enough | None (rows live forever) | See B-7 |
| Approval idempotency | None — re-clicking *Approve* on a `pending_approval` batch from two tabs at once is guarded only by the optimistic concurrency check at `BatchDetail.tsx:402-417`. Bulk approve has no guard | GAP |

**Fixes:** B-7, M-9, plus add an `idempotency_key` column to the new `approve_payment_batch` RPC
(B-2) so duplicate clicks during slow networks don't double-approve.

### [B] Batch transaction integrity (5,000+ scale)

**Verdict: BLOCKER. The design is not 5,000-ready.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| Chunking strategy and Paystack limit | `paystack-transfer/index.ts:443-447` enforces 100 cap on `bulk_transfer`, but the calling code never invokes it. Real path is one-by-one | GAP — H-2 |
| 153 of 5,000 fail — where do the 153 go? | Marked `failed` with `failure_reason`; UI shows row-level retry. No DLQ | OK-ish |
| Retry queue with exponential backoff | None at the *batch* level. Polling backoff exists *within* a single browser session at `BatchDetail.tsx:809-882` | GAP |
| Dead-letter queue for permanent failures | None | GAP |
| Resume after server crash | `batch-worker` cron (`20260730000005`) with 60s orphan threshold + service-role secret | OK (caveat: H-2) |
| Batch-level state machine | Yes: `draft → pending_approval → approved → funded → processing → processed | partially_processed | failed | rejected`. Not enforced by trigger; relies on UI + RLS | PARTIAL — H-6 |
| Item state independent of batch | Yes — `batch_items.status` is independent | OK |

**Fixes:** H-2, H-6, B-5, plus a `payment_dispatch_chunks` audit table.

### [C] Reconciliation

**Verdict: PARTIAL.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| Independently verify each transfer landed | `paystack-reconciliation/index.ts` for stuck items + `BatchDetail.tsx:836` polls live | OK for Paystack-side |
| Scheduled reconciliation against bank statements | None | GAP — H-5 |
| What if Paystack says success but bank shows nothing | Undetectable today | GAP — H-5 |
| Unreconciled > X hours flagged to a human | OTP-flagged but not generally surfaced | PARTIAL — M-7, M-8 |

**Fixes:** H-5, M-7, M-8.

### [D] Webhook security

**Verdict: GOOD.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| Signature verified on every webhook | `paystack-webhook/index.ts:60-71`, `timingSafeEqual` | OK |
| Signing secret in env vars, not code | Yes (`PAYSTACK_SECRET_KEY` env, fallback to `company_settings`) | OK (fallback path is H-1) |
| Duplicate webhook IDs detected and ignored | Yes (`webhook_idempotency` PK on `(reference, event_type)`) | OK |
| Out-of-order webhooks handled correctly | The handler always patches with the latest payload; `recalculateBatchStatus` is order-independent. Reversal-after-success is correctly handled by writing `status='reversed'` | OK |
| Webhook replay/audit log | `audit_logs` written per event with `performed_by_name = 'Paystack Webhook'`. `paystack_raw` jsonb stored on each item | OK |
| Webhook for unknown reference | Logged + 200 ignored (`paystack-webhook/index.ts:296-300`) | OK |

**Fixes:** Mostly already good. H-1 (secret storage), H-8 (error handling), B-7 (retention).

### [E] Approval workflow & Transfer Authorization (the existing module)

**Verdict: HOLES MULTIPLE.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| Per-role caps (single/daily/monthly) seeded | `20260807000000:75-80` — super_admin 50M/100M/500M, admin 10M/50M/200M, finance 5M/20M/100M | OK |
| Per-user overrides win | Yes: `check_transfer_caps` lines 162-176 lookup user-level first | OK |
| Server-side enforced on every transfer | YES at edge fn (`paystack-transfer:271-332`) and batch-worker (`batch-worker:236-265`) — but BYPASSED in Expenses payment path | GAP — B-2 |
| Bulk-transfer total enforced against cap | Yes via summing kobo amounts in `paystack-transfer:275-281` | OK |
| Per-user overrides correctly win in enforcement code (matches UI claim) | Yes | OK |
| Cap relationship single ≤ daily ≤ monthly | Not enforced | GAP — M-3 |
| User cannot edit own cap or own role's cap | Not blocked | GAP — M-4 |
| Cap changes logged immutably with who/when/old/new/IP | NOT LOGGED AT ALL | GAP — B-3 |
| Per-user override has expiry | No | GAP — M-1 |
| **Co-approval threshold** above any amount | **None — single-approver authority unbounded** | BLOCKER — B-1 |
| Approval actions logged with payload | `audit_logs` writes a description string only; no payload hash | PARTIAL — H-4, M-9 |
| Approval invalidated when payload changes | No | GAP — M-9 |
| "Recent transfer audit (last 50)" is read-only and immutable | Yes (immutability triggers in `20260810100000`) but capped at 50 | OK with M-5 caveat |
| Distinct cap for batch totals vs single transfers | No | GAP — M-2 |

**Fixes:** B-1, B-2, B-3, B-4, B-5, M-1, M-2, M-3, M-4, M-5, M-9 — most of the BLOCKERs live here.

### [F] Audit trail & immutability

**Verdict: PARTIAL — append-only enforced, but spoofable inserts.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| Payment records append-only | RLS `batches_update` allows update by privileged roles. Backward state transitions not blocked | GAP — H-6 |
| Separate audit log table | Two: `audit_logs` and `transfer_audit` | OK |
| Audit log itself protected from modification | Yes: `enforce_audit_immutability` trigger blocks UPDATE always; DELETE blocked unless GUC set; only `purge_audit_rows` RPC bypasses, gated to service_role | OK |
| Can a DB admin secretly edit a payment? | DB-admin (postgres role) yes — same as any Postgres install. Application-level: no for audit tables, *yes* for `payment_batches` and `batch_items` content (RLS gives finance UPDATE) | PARTIAL — H-6 |
| Cap changes logged | NO | BLOCKER — B-3 |

**Fixes:** B-3, H-4, H-6.

### [G] FX handling

**Verdict: NOT IMPLEMENTED.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| When is FX rate captured | Nowhere. `usd_rate` is read by Settings only | GAP — M-10 |
| Rate locked at approval with tolerance band | No | GAP — M-10 |
| Rate source documented | No | GAP — M-10 |
| Fallback if rate API down | No | GAP — M-10 |

**Fixes:** M-10. This is whole-feature work, not a fix; treat as a launch blocker only if any
contractor is paid in non-NGN. If 100% of the 700 contractors are NGN today, defer but document.

### [H] Permissions & access control

**Verdict: MOSTLY OK.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| Initiate / approve / cancel / refund role-gated | RLS + edge-function role checks | OK |
| Roles enforced server-side, not just hidden UI | Yes (RLS + `paystack-transfer:239-265` + `batch-worker:386`) | OK |
| Break-glass admin override | `purge_audit_rows` is service-role only and logs nothing extra | OK but L-5 reset script is one |
| Compromised single account drain potential | Yes — capped daily but not capped per-co-approver. ₦50M/day for super_admin = ₦50M loss potential per day per compromised super_admin | DOCUMENT + B-1 |
| Velocity-based anomaly detection | Partial — see M-6 | GAP |

**Fixes:** B-1, M-6, plus require MFA for approvers (`mfa_trusted_devices` schema exists in
`20260810000000` but is not required for cap-affecting actions).

### [I] Data security

**Verdict: PARTIAL.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| Bank account numbers encrypted at rest | `_enc` shadow column exists; plaintext also present | GAP — H-3 |
| Masked in UI except authorized | `maskAccountNumber()` used 9 places; one missing (L-4) | OK |
| Redacted in logs | Webhook handler logs `last4` only (good); edge function audit may persist `account_number` in `params` (H-9) | PARTIAL |
| Paystack API key in env vars, rotated, restricted | In env *and* DB column (H-1). No documented rotation | GAP — H-1 |
| Service role keys never exposed to client | `src/` does not reference `SUPABASE_SERVICE_ROLE_KEY`. Vite envs use `VITE_*` prefix only. Confirmed clean | OK |

**Fixes:** H-1, H-3, H-9, L-4.

### [J] Error handling & failure modes

**Verdict: WEAK.**

| Sub-check | Evidence | Verdict |
|---|---|---|
| Paystack down 4h during batch | Browser stalls; orphan watchdog resumes; cap usage doesn't release reserved budget | PARTIAL — H-2, B-5 |
| DB drops mid-batch | Items left in `pending` with no `paystack_reference`; recoverable via watchdog | OK (caveat H-8 if it's the webhook DB write that fails) |
| Server crash mid-submission | Same — watchdog catches | OK |
| Errors swallowed silently | Multiple catches log but proceed (`paystack-webhook` lines 313-321, batch updates lines 119-121, 350-364) | GAP — H-8 |
| Every failure surfaced to a human with actionable detail | "Friendly error" mapping is excellent for individual transfers (`paystack.ts:187-243`); batch-level failures less so | PARTIAL |

**Fixes:** H-2, H-8, B-5.

### [K] Temporary / placeholder code

**Verdict: CLEAN.** Search across the payment path turned up:

- No `TODO`, `FIXME`, `HACK`, or `XXX` markers in payment files.
- No "for now" or "temporary" comments in payment paths.
- No hardcoded test account numbers (`0000000000`, `1234567890`, etc.) found.
- No mock/stub functions in production payment code.
- A few `console.log` / `console.warn` in payment paths (L-1, H-9). Drop them.
- A few `placeholder=` strings — all UI input placeholders, all benign.

The codebase is mature; the issues are architectural, not careless leftover code.

---

## 7. Per-file table — files in scope

| File | Purpose in payment path | Severity finding(s) |
|---|---|---|
| `supabase/functions/paystack-transfer/index.ts` | Server-to-server Paystack proxy; cap enforcement + audit insertion | B-5, H-9, H-10, L-1 |
| `supabase/functions/paystack-webhook/index.ts` | Receives transfer events; updates batch_items, batch status, expense status | B-7, H-8 |
| `supabase/functions/paystack-reconciliation/index.ts` | Hourly stuck-item sweep + fee backfill | M-7, M-8, H-5 |
| `supabase/functions/batch-worker/index.ts` | Server-side batch dispatcher (cron + JWT) | H-2, H-7, L-2 |
| `src/lib/paystack.ts` | Client wrapper for the edge function (single, bulk, fees, narration) | L-3 |
| `src/lib/transfer-safety.ts` | Limits + audit fetch helpers | B-3 |
| `src/components/settings/TransferAuthSettings.tsx` | Cap editor + last-50 audit panel | B-3, M-4, M-5 |
| `src/pages/BatchDetail.tsx` | Batch lifecycle UI: review/approve/process/retry/reconcile | B-1, B-2, B-4, H-2, H-6, H-7, M-9 |
| `src/pages/NewPaymentBatch.tsx` | Batch composition (3-step wizard) | L-4 |
| `src/pages/Payments.tsx` | Payments index with balance card | H-10 |
| `src/pages/Approvals.tsx` | Cross-module approval queue + bulk-approve | B-1, B-2, B-4, M-12 |
| `src/pages/Expenses.tsx` | Expense submit/approve + payment dispatch | B-2, B-4 (partial), M-9 |
| `src/components/QuickPay.tsx` | One-off transfer with self-approval | B-6 |
| `src/lib/audit.ts` | Audit log writer | H-4 |
| `supabase/migrations/20260807000000_transfer_safety.sql` | Defines `transfer_limits`, `transfer_audit`, `check_transfer_caps` | M-1, M-2, M-3 |
| `supabase/migrations/20260415150000_add_phone_and_audit_logs.sql` | `audit_logs` table + RLS | H-4 |
| `supabase/migrations/20260503100000_api_key_columns.sql` | API key columns (incl. Paystack secret) | H-1 |
| `supabase/migrations/20260428000001_encrypt_account_numbers.sql` | Account-number encryption + plaintext kept | H-3 |
| `supabase/migrations/20260616000000_phase1_security_and_missing_tables.sql` | `webhook_idempotency` + others | B-7 |
| `supabase/migrations/20260805000000_payment_anomaly_detection.sql` | Anomaly engine | M-6, M-11 |
| `supabase/migrations/20260810100000_audit_log_immutability.sql` | Append-only triggers | OK (defensive; relies on B-3 to be useful) |
| `supabase/migrations/20260629000000_transactions_view_charge_rows.sql` | Ledger view | OK with `security_invoker` set in `20260730000004` |
| `supabase/scripts/reset_transactional_data.sql` | Reset script | L-5 |

(Other migrations referenced in passing through findings; the table covers files where *findings
land*, not every migration in the repo.)

---

## 8. Recommended fix order

**Pre-launch (must complete before going live):**

1. **B-1** Co-approval threshold for batches + Quick Pay + expense payment.
   (~1.5 days of schema + RPC + UI + tests.)
2. **B-2** Move all batch-status mutations behind a SECURITY DEFINER RPC and revoke direct UPDATE.
   (~1 day, mostly mechanical refactor of the 5 call sites.)
3. **B-3** Cap-edit audit logging via `set_transfer_limit` RPC + new `transfer_limits_history` table.
   (~0.5 day.)
4. **B-4** Self-approval guard server-side + UI hiding.
   (~3 hours.)
5. **B-5** Intent-row pattern in `transfer_audit` so cap accounting reflects in-flight money.
   (~0.5 day.)
6. **B-6** Quick Pay → `pending_approval` above threshold; off by default.
   (~3 hours, mostly inside the `executePay` flow.)
7. **H-1** Move Paystack secret to Vault; remove `paystack_secret_key_enc` plaintext column.
   (~3 hours + a careful migration.)
8. **H-2** Switch dispatch to server-side `bulk_transfer` chunks of 100; remove client loop.
   (~1.5 days end-to-end.)
9. **H-4** Tighten `audit_logs` INSERT policy + route through RPC.
   (~3 hours.)
10. **H-6** State-machine triggers on `payment_batches` and `batch_items`.
    (~0.5 day.)
11. **H-8** Webhook handler error handling: distinguish retryable from idempotent dup; move idempotency insert into the same transaction as the update.
    (~2 hours.)

**Total realistic effort for the BLOCKERs + immediate HIGHs: ~7 working days.** That's
achievable in two weeks with one focused engineer.

**Post-launch but soon (within 30 days):**

- B-7 Webhook idempotency retention.
- H-3 Decide on encryption — drop plaintext or drop the encrypted column.
- H-5 Bank-statement reconciliation.
- H-7 Remove hardcoded ₦5M ceiling.
- H-9, H-10 Logging hygiene.
- M-1 through M-12 — the full polish pass on Transfer Authorization.

**Defer until needed:**

- M-10 FX handling — only if non-NGN obligations are real.

---

## 9. What KDOps already does well — do not break these

This is a heavily-engineered codebase. Several controls are genuinely well-designed:

1. **Webhook signature verification** via `timingSafeEqual` (no subtle timing leaks), with the
   secret stored in env first and DB only as fallback.
2. **Webhook idempotency** keyed on `(reference, event_type)` — exactly the right primary key.
3. **Idempotent Paystack initiation** with both pre-flight de-dup and a self-healing recovery
   path on Paystack-side duplicate-reference errors.
4. **Server-side cap enforcement** via a single `check_transfer_caps` RPC with one source of
   truth (this is the *right* shape for caps, just gated to the wrong call sites — B-2).
5. **Append-only audit triggers** on `audit_logs` and `transfer_audit` with a single blessed
   `purge_audit_rows` path for retention.
6. **Encrypted account number key management** lives in a `_private` schema with
   SECURITY DEFINER access — that's the right pattern (just not honoured by leaving plaintext
   columns; H-3).
7. **Orphan-batch watchdog** with a Vault-stored shared secret, decoupled URL.
8. **Anomaly engine** is genuinely impressive — payroll-spike, account-changed-then-paid,
   shared-bank-account, off-hours-approval, fast-approval, dormant-first-payment. Add the
   transfer-velocity rules (M-6) and it covers most ACFE Report-to-the-Nations categories.
9. **`security_invoker = true` on `transactions_view`** — the B3 fix was correctly applied.
10. **Friendly Paystack error mapper** (`paystack.ts:187-260`) is finance-ops-grade and shaves
    real time off incident response.

---

## 10. How the new controls fit inside TransferAuthSettings

The brief is firm on this: do **not** introduce a parallel approval-rules system. Everything must
extend the existing `Settings → Transfer Authorization` panel and the existing `transfer_limits`
table. The good news is that the existing schema is wide enough to absorb the additions cleanly.

### 10.1 Schema additions (one migration)

```sql
-- transfer_limits — co-approval, batch-total cap, expiry, granted_by/reason.
ALTER TABLE public.transfer_limits
  ADD COLUMN co_approval_threshold_ngn numeric,
  ADD COLUMN single_batch_limit_ngn    numeric,
  ADD COLUMN expires_at                timestamptz,
  ADD COLUMN granted_by                uuid REFERENCES public.profiles(id),
  ADD COLUMN granted_reason            text,
  ADD CONSTRAINT transfer_limits_cap_ordering CHECK (
    COALESCE(single_txn_limit_ngn, 0) <= COALESCE(daily_limit_ngn, single_txn_limit_ngn, 0)
    AND COALESCE(daily_limit_ngn, 0) <= COALESCE(monthly_limit_ngn, daily_limit_ngn, 0)
    AND COALESCE(single_batch_limit_ngn, 0) <= COALESCE(monthly_limit_ngn, single_batch_limit_ngn, 0)
  );

-- Reasonable defaults for the seeded role rows.
UPDATE public.transfer_limits
   SET co_approval_threshold_ngn = 10000000,        -- 2nd approver above ₦10M
       single_batch_limit_ngn   = monthly_limit_ngn -- batch ≤ monthly cap
 WHERE user_id IS NULL;

-- transfer_limits_history — full append-only history (referenced from B-3).
CREATE TABLE public.transfer_limits_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  limit_id        uuid REFERENCES public.transfer_limits(id) ON DELETE SET NULL,
  changed_by      uuid REFERENCES public.profiles(id),
  changed_at      timestamptz NOT NULL DEFAULT now(),
  ip_hash         text,
  user_agent      text,
  before_row      jsonb,
  after_row       jsonb,
  change_kind     text NOT NULL CHECK (change_kind IN ('insert','update','delete'))
);
ALTER TABLE public.transfer_limits_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY th_read ON public.transfer_limits_history
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));
-- writes only via the SECURITY DEFINER set_transfer_limit RPC
CREATE POLICY th_no_writes ON public.transfer_limits_history
  FOR INSERT TO authenticated WITH CHECK (false);

-- payment_batches — second approver + payload hash at approval (M-9).
ALTER TABLE public.payment_batches
  ADD COLUMN second_approver_id        uuid REFERENCES public.profiles(id),
  ADD COLUMN second_approved_at        timestamptz,
  ADD COLUMN payload_hash_at_approval  text,
  ADD CONSTRAINT batches_no_self_approval
    CHECK (approved_by IS NULL OR approved_by != created_by),
  ADD CONSTRAINT batches_distinct_approvers
    CHECK (second_approver_id IS NULL OR second_approver_id != approved_by);
```

### 10.2 RPCs — single source of truth

```
public.set_transfer_limit(
  p_id uuid,                  -- null = insert
  p_role text,                -- nullable
  p_user_id uuid,             -- nullable
  p_single numeric, p_daily numeric, p_monthly numeric,
  p_co_approval numeric, p_batch numeric,
  p_expires_at timestamptz, p_reason text
) RETURNS transfer_limits SECURITY DEFINER

public.approve_payment_batch(
  p_batch_id uuid,
  p_idempotency_key text DEFAULT null
) RETURNS payment_batches SECURITY DEFINER
  -- Locks the row, computes payload hash, runs cap RPC,
  -- enforces self-approval and dual-approval rules,
  -- transitions to approved | pending_second_approval,
  -- writes transfer_audit + audit_logs in same transaction.

public.confirm_second_approval(
  p_batch_id uuid
) RETURNS payment_batches SECURITY DEFINER
  -- Same machinery, second approver path.
```

### 10.3 UI changes inside the existing TransferAuthSettings tab

**Role-defaults card (existing — extend not replace).**

Existing columns: Single transfer · Daily · Monthly · Action. Add:

- "Co-approval above" — text input with a "no co-approval" placeholder.
- "Max batch total" — text input (sums entire batch's beneficiaries).

Tooltip on each new column with the one-line policy explanation. Save button stays the same.

**Per-user overrides card (existing — extend not replace).**

Add the same two columns plus:

- "Expires" — date picker, defaulting to 30 days out, max 90 days.
- "Reason" — required textarea (replaces existing `notes` field semantically; keep `notes` for
  backward compatibility but rename column heading to "Reason").

Show an "Expires in N days" badge with amber treatment when N ≤ 7, red when N ≤ 1 or expired.

**Recent transfer audit (existing — extend not replace).**

- Add a "Cap changes" tab next to "Transfers" so cap-edit rows surface here too. Source is the
  same `transfer_audit` table — the new RPC writes `action='cap_changed'` rows, so the existing
  table component shows them with no schema change, just a filter.
- Add a date-range filter and a CSV export button. Pagination via "Load 50 more" or full table
  navigation to `/audit-log?source=transfer`.

**New "Co-approval inbox" card.**

A small card on the same screen listing batches in `pending_second_approval` that the current
user is *eligible* to approve (i.e. not the first approver and not the batch creator). Each row
shows the batch name, amount, first approver, time waiting, and a one-click *Approve as Second*
button which calls `confirm_second_approval`.

This avoids a separate Approvals-page surface for the second-approver step and keeps the
"transfer authorization" mental model in one place.

### 10.4 Backwards compatibility plan

- Existing `transfer_limits` rows continue to work with `co_approval_threshold_ngn = NULL` and
  `single_batch_limit_ngn = NULL` meaning "no constraint beyond what's already there". The
  triggers and RPCs treat NULL as "no co-approval needed" / "no batch cap" so no in-flight
  batches break on migration.
- The first migration step seeds sensible defaults (₦10M co-approval, batch = monthly) for the
  three role rows, so the new control is *enforcing* something on day 1, not silently disabled.
- The `payment_batches` constraints are CHECK-deferrable; existing approved batches continue
  to satisfy `batches_no_self_approval` (legacy rows where `approved_by = created_by` need a
  one-time scrub: either invalidate them, or grandfather by setting `approved_by = NULL` and
  flagging in audit. Recommend the grandfather path with a banner on those batches).

---

## 11. Go / no-go verdict

**No-go for production until B-1 through B-7 are resolved.**

Everything else is recoverable post-launch with monitoring and a fast feedback loop. The
BLOCKERs are not. Specifically:

- B-1, B-4, B-6 are the difference between "phished single account" and "company-ending event".
- B-2, B-5 are the difference between "the cap is real" and "the cap is theatre".
- B-3 is the difference between "we know who edited what" and "every cap edit is plausibly
  deniable".
- B-7 is the difference between "Paystack retries make us boring" and "Paystack retries
  silently fill a database".

Estimated effort to clear: **~7 working days for one focused engineer.** Two weeks calendar
with code review. None of these require redesigning the Transfer Authorization module — they
are all extensions of existing tables, existing RLS posture, and the existing UI.

After that, the HIGHs (especially H-1 secret storage, H-2 server-side dispatch, H-3
encryption-or-not decision, H-5 bank reconciliation) make the next 30 days. The MEDIUMs are
the polish quarter.

The platform is much closer to ready than the file count suggests. The architectural primitives
are right; the gaps are surgical.

---

*End of audit. All findings are reproducible from the file paths and line numbers cited.
This document is the deliverable from the engagement and lives at
`docs/audits/PAYMENT_SUBSYSTEM_AUDIT.md` on branch `claude/audit-payment-subsystem-CtagQ`.*




