# 2026-05-04 — Approval framework (dual-approval for payments)

## What changed

KDOps now enforces **dual approval** for payment batches, Quick Pay, and
expense payments above a configurable per-role threshold. The approval
state machine is the single source of truth across BatchDetail, Approvals,
Expenses, QuickPay, and the new Settings → Transfer Authorization panel.
Direct database writes to approval state are blocked at the trigger level —
every transition goes through one of the new SECURITY DEFINER RPCs.

This release closes BLOCKER findings **B-1** (self-approval), **B-4** (no
co-approval gate on high-value transfers), **B-6** (Quick Pay self-funded)
and MEDIUM finding **M-9** (post-approval payload mutation) from the
forensic payment-subsystem audit at
[`docs/audits/PAYMENT_SUBSYSTEM_AUDIT.md`](../audits/PAYMENT_SUBSYSTEM_AUDIT.md).

## How it works

### Approver pools
Each action × tier (payment_batch / quick_pay / expense_payment, first /
second) maps to a list of eligible roles in the new `approver_pools` table.
Defaults are:

| Action | Tier | Eligible roles |
|---|---|---|
| payment_batch | first | admin, super_admin |
| payment_batch | second | admin, super_admin |
| quick_pay | first | admin, super_admin |
| quick_pay | second | admin, super_admin |
| expense_payment | first | admin, super_admin |
| expense_payment | second | admin, super_admin |

A super-admin can edit the eligible-role list for any pool in
**Settings → Transfer Authorization → Approver Pools**. INSERT/DELETE on
the table is blocked — pool rows are managed via migrations only — so the
fixed structure of "two tiers per action" can't be widened or narrowed
through the UI.

When a batch is created by an admin or super-admin, the **first-approver
pool is automatically narrowed to `super_admin` only**. This is enforced
server-side inside `get_eligible_approvers` and `approve_payment_batch`,
not as a client filter, so an admin cannot skirt it by calling the RPC
directly.

### Co-approval thresholds
Each `transfer_limits` row gains a `co_approval_threshold_ngn` column.
NULL (or 0) means *no co-approval ever*. A user-level row (`user_id` set)
overrides the role default. The seed values are:

| Role | Co-approval threshold |
|---|---:|
| super_admin | ₦25,000,000 |
| admin | ₦10,000,000 |
| finance | ₦5,000,000 |

**These are starter values — the CFO will finalize the production
thresholds before go-live**, in particular tightening the super_admin row
once the Mission Control roster is finalized. Edits in
**Settings → Transfer Authorization → Role default caps** take effect on
the next approval attempt; no redeploy is required, and every change is
written to `audit_logs`.

### Approval flow per action

**Payment batch** (BatchDetail / Approvals)
1. Operator submits → `pending_approval`.
2. Eligible first approver clicks Approve → `approve_payment_batch` RPC.
   - Self-approval blocked.
   - Caller's transfer cap checked (same RPC the edge function uses).
   - Payload hash snapshotted into `payload_hash_at_approval`.
   - If `total_amount > co_approval_threshold` for caller → `pending_second_approval`,
     eligible second approvers get a notification.
   - Otherwise → `approved` directly.
3. If `pending_second_approval`, an eligible second approver (different
   from creator and first approver) clicks **Approve as Second** →
   `confirm_second_approval` RPC.
   - Recomputes payload hash. If it differs from the snapshot, the batch
     is reset to `pending_approval` and the second approval fails with
     "payload changed since first approval" — the first approver must
     re-approve.
4. Re-edit & Resubmit on a rejected batch routes through the new
   `reset_batch_to_draft` RPC, which clears every approval-state column
   so the payload-lock trigger lets edits through again.

**Quick Pay** (QuickPay component)
- Reads `is_quick_pay_enabled()` on mount; if false, the dialog refuses
  to dispatch. The CFO turns this on in Settings → Transfer Authorization.
- Reads the operator's effective co-approval threshold and computes
  whether the entered amount would trip it.
  - Below threshold: legacy path — creates `funded` batch and dispatches.
  - Above threshold: creates `pending_approval` batch, navigates the
    operator to BatchDetail, and stops. An approver must explicitly
    move the batch through approve → fund → process.

**Expense payment** (Expenses page)
- `processExpensePayment` now creates the underlying `payment_batches`
  row in `pending_approval` (was `approved`). Even an already-approved
  expense reimbursement requires a fresh approval on the payment.
- `handleAction`, `doReject`, `doBulkApprove`, `bulkApproveSelected` all
  route through the new `approve_expense` / `confirm_second_expense_approval`
  / `reject_expense` RPCs. Direct status writes are gone.

### Payload lock (M-9)
Two BEFORE UPDATE triggers refuse to mutate the security-relevant fields
of `batch_items` and `payment_batches` once the parent batch is in any of
these statuses: `approved`, `pending_second_approval`, `funded`,
`processing`, `partially_processed`, `processed`. This stops the "first
approver locks in a number, then the same row gets bumped post-approval"
attack. The legitimate way to edit a post-approval batch is to reset it
to draft (creator only) which clears approval state. A matching trigger
on the approval-state columns themselves blocks direct writes from the
`authenticated` Supabase role; only the SECURITY DEFINER RPCs (running as
the function owner) and the service role (used by the webhook,
batch-worker, reconciliation edge fns) can change `approved_by`,
`approved_at`, `second_approver_id`, `payload_hash_at_approval`, etc.

### Grandfathering
The migration scans existing `payment_batches` rows for legacy
self-approvals (where `approved_by = created_by`) and clears
`approved_by` on each, writing an `audit_logs` row tagged
`legacy_self_approval_grandfathered` per row. Without this step the new
`batches_no_self_approval` CHECK constraint would reject the existing
data.

## Files added / changed

- `supabase/migrations/20260811000000_approval_framework.sql` — full schema +
  RPCs + triggers
- `src/lib/transfer-safety.ts` — typed wrappers for every new RPC
- `src/pages/BatchDetail.tsx` — RPC-based approve / reject / second approval,
  awaiting-2nd banner, approver attribution card, reset-to-draft for re-edit
- `src/pages/Approvals.tsx` — RPC-based per-row approve / bulk approve with
  per-row failure surfacing, "Awaiting 2nd" badge in table + cards
- `src/pages/Expenses.tsx` — uses `approve_expense` / `reject_expense`,
  `processExpensePayment` no longer auto-funds
- `src/components/QuickPay.tsx` — disabled-state banner, threshold-routed
  flow, cap preview before dispatch
- `src/components/settings/TransferAuthSettings.tsx` — co-approval column
  on role and per-user tables, Approver Pools editor, Quick Pay master switch
- `src/lib/transfer-safety.test.ts` — unit tests for `isCoApprovalRequired`
- `supabase/tests/approval_framework.sql` — RPC contract tests (run with
  `psql -f` after migrations apply)
- `tests/approval-framework.spec.ts` — Playwright smoke tests for the UI
  surface

## Migration timestamp note

The migration is at `20260811000000_approval_framework.sql`, not the
originally-planned `20260504000000`, because it depends on the
`transfer_limits` table (created at `20260807000000_transfer_safety.sql`)
and the audit-immutability triggers (`20260810100000_audit_log_immutability.sql`).
Running it before those would error on missing relations.

## Rollout checklist

Before flipping the master switch in production:
1. Apply the migration (`supabase db push`).
2. Verify legacy self-approvals were grandfathered: `SELECT count(*)
   FROM audit_logs WHERE action_type = 'legacy_self_approval_grandfathered';`
3. CFO reviews and finalizes co-approval thresholds in
   **Settings → Transfer Authorization → Role default caps**.
4. CFO reviews approver-pool eligible roles in
   **Settings → Transfer Authorization → Approver Pools**.
5. Run `psql -f supabase/tests/approval_framework.sql` against staging.
6. CFO toggles the **Quick Pay** switch on (still gated by per-operator
   co-approval thresholds even after global enable).
7. Smoke-test by creating a small below-threshold batch and a small
   above-threshold batch from staging.
