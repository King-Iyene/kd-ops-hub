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

(MEDIUM and LOW findings continue in batch 3.)

