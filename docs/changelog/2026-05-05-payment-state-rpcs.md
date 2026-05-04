# Payment-state RPCs — closes B-2 + H-7

**Date:** 2026-05-05
**Branch:** `claude/audit-payment-subsystem-CtagQ`
**Scope:** BLOCKER B-2 (cap RPC bypassed by direct status mutations) and HIGH H-7 (hardcoded ₦5M ceiling) from `docs/audits/PAYMENT_SUBSYSTEM_AUDIT.md`.

## Summary

The 2026-05-04 approval-framework migration moved the approval-state writes (`pending_approval → approved/pending_second_approval/rejected`) behind SECURITY DEFINER RPCs. The lifecycle past approval (`approved → funded → processing → processed/partially_processed`) was still happening via direct `supabase.from('payment_batches').update({status: ...})` calls in `BatchDetail.tsx`, `QuickPay.tsx`, `Fleet.tsx`, and the page-level stale-sync code in `Payments.tsx`. Those calls bypassed any cap accounting or audit and were the surface the audit named in B-2.

This migration closes the gap by:

1. **Adding RPCs for every remaining lifecycle transition.** `approved → funded` goes through `mark_batch_funded`, `funded → processing` through `start_batch_processing`, `processing → processed/partially_processed/funded` through `finalize_batch`. Stale-sync uses the safer `sync_batch_status_from_items`. Expense dispatch uses `create_expense_payment_batch` (atomic batch+item+link) and `mark_expense_paid`.

2. **Tightening the BEFORE UPDATE trigger** on `payment_batches` so the `authenticated` role can no longer flip status outside of `draft ↔ pending_approval` (creator-only) and `rejected → pending_approval` (creator-only resubmit). Every other transition raises `insufficient_privilege`. Service role and SECURITY DEFINER RPCs continue to pass through.

3. **Tightening the BEFORE UPDATE trigger** on `expenses` so `payment_status='processed'` can only land via `mark_expense_paid` or the webhook (service role).

4. **Removing the hardcoded ₦5,000,000 ceiling** at `BatchDetail.tsx:700` and `batch-worker/index.ts:148`. Caps live exclusively in `check_transfer_caps` now, and the new `company_settings.max_single_transfer_ngn` lets the company set a NIBSS-style hard ceiling in one place if needed.

## Changes

### New RPCs

| RPC | Purpose | Replaces |
|---|---|---|
| `mark_batch_funded(p_batch_id, p_funding_evidence)` | `approved → funded`, stamps `funded_at/by/funding_evidence` | `BatchDetail.tsx` direct UPDATE in `updateStatus('funded',...)` |
| `start_batch_processing(p_batch_id)` | `funded/partially → processing`, FOR UPDATE locked | `BatchDetail.tsx` `executeProcess` claim, `QuickPay.tsx` final flip |
| `finalize_batch(p_batch_id)` | Derives terminal status from item statuses (idempotent) | `BatchDetail.tsx` post-process status set |
| `sync_batch_status_from_items(p_batch_id)` | Bounded stale-sync (won't regress terminal) | `Payments.tsx` and `BatchDetail.tsx` `loadBatch` recalc |
| `mark_expense_paid(p_expense_id, p_batch_id)` | `expenses.payment_status='processed'` after batch terminal | new |
| `create_expense_payment_batch(p_expense_id)` | Atomic batch+item+link with cap check up front | `Expenses.tsx` `processExpensePayment` 4-step client flow |

### Trigger updates

- `enforce_batch_approval_state_writes` now also blocks direct writes to `funded_at`, `funded_by`, `funding_evidence`, `processing_started_at`, `processing_finalized_at`, plus all status transitions other than the three creator-bound flips.
- `enforce_expense_approval_state_writes` now blocks `payment_status='processed'` from authenticated.
- `check_transfer_caps` now reads `company_settings.max_single_transfer_ngn` and enforces it before per-user caps.

### Frontend changes

- `BatchDetail.tsx` — `updateStatus` split into `submitForApproval` (allowed direct UPDATE) and `markFunded` (RPC). `executeProcess` uses `start_batch_processing` for the concurrency claim and `finalize_batch` for the post-run status. Retry path uses `finalize_batch`. `processOneItem` no longer rejects > ₦5M client-side. Stale-sync in `loadBatch` uses `sync_batch_status_from_items`.
- `QuickPay.tsx` — below-threshold flow uses `start_batch_processing` for the funded → processing flip.
- `Approvals.tsx` — fuel-paired expense approval routes through `approve_expense` RPC instead of direct UPDATE, so cap accounting and audit cover it.
- `Fleet.tsx` — fuel-request approval and budget-exception approval route the paired expense through `approve_expense`. Fuel auto-pay no longer creates batches in `'approved'` — they land in `pending_approval` and surface on the approver queue.
- `Expenses.tsx` — `processExpensePayment` is now a single `create_expense_payment_batch` RPC call followed by `approve_payment_batch`. The previous 4-step client flow is gone; partial-failure orphans are no longer possible.
- `Payments.tsx` — stale-sync replaced with `sync_batch_status_from_items`.
- `src/lib/transfer-safety.ts` — adds wrappers for all six new RPCs.
- `src/lib/paystack.ts` — friendly-error hint for "single transfer cap exceeded" no longer mentions ₦5M.

### Edge function

- `supabase/functions/batch-worker/index.ts` — drops the hardcoded `> 5_000_000` reject. Now calls `finalize_batch` when a run drains to zero remaining items.

## Tests

`supabase/tests/payment_state_rpcs.sql` — 13 contract tests:

1. `mark_batch_funded` transitions approved → funded and stamps `funded_*`.
2. `mark_batch_funded` rejects non-approver roles.
3. `start_batch_processing` requires status `funded` / `partially_processed`.
4. `start_batch_processing` flips funded → processing.
5. `finalize_batch` derives processed from item statuses.
6. `sync_batch_status_from_items` refuses to regress a terminal batch.
7. (skipped in psql) Direct UPDATE setting `funded_at` blocked from authenticated.
8/9. `payment_batches_approval_state_lock` trigger present on `payment_batches`.
10. ₦7M transfer passes when the user's single cap is ₦10M (no hardcoded ₦5M).
11. `company_settings.max_single_transfer_ngn` blocks a ₦7M call when set to ₦5M.
12. `create_expense_payment_batch` creates batch + item + link atomically.
13. `mark_expense_paid` rejects expenses on non-terminal batches.

Run:

```bash
psql "$DATABASE_URL" -f supabase/tests/payment_state_rpcs.sql
```

## Verification checklist

- [x] `npx tsc --noEmit` passes.
- [ ] Direct `supabase.from('payment_batches').update({status:...})` from a test user fails with insufficient_privilege.
- [ ] All approval, funding, processing, and finalize transitions go through their RPCs end-to-end (UI smoke test).
- [ ] Cap is enforced on the expense → batch path: an expense exceeding daily cap fails to dispatch with a useful error.
- [ ] A user with a ₦10M single-transfer cap can dispatch a ₦7M single transfer (hardcoded 5M removal regression).
- [ ] `company_settings.max_single_transfer_ngn` round-trips in Settings UI (deferred to a later UI change).

## Why this matters

Before this change, B-2's "Bulk-approve 200 expenses, batch worker dispatches them all without cap RPC" path was still live for the *post-approval* lifecycle: the cap RPC fired on first-approval, but `approved → funded → processing` writes from the client never re-checked. Two simultaneous batches in different tabs could both pass first-approval (each within cap) and then race the dispatch loop, with only the per-item edge-function check stopping the actual money movement. Routing every status flip through SECURITY DEFINER RPCs makes the lifecycle forensically reconstructable: every transition has an audit row, an actor, and (where money moves) a fresh cap check.

H-7 was a smaller cousin of the same problem: a Super Admin raising the per-role single-transfer cap to ₦10M would still hit a ₦5M hard reject in the client and the worker. Caps now have one source of truth and one optional company-wide hard ceiling.
