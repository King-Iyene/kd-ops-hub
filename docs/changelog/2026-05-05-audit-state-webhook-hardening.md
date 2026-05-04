# Audit / state machine / webhook hardening — closes B-7, H-4, H-6, H-8, L-5

**Date:** 2026-05-05
**Branch:** `main`
**Scope:** BLOCKER B-7, HIGH H-4, H-6, H-8, and LOW L-5 from `docs/audits/PAYMENT_SUBSYSTEM_AUDIT.md`.

## Summary

Five separate findings shared the property "tampering surface that should be enforced at the database, not in application code." This change moves all of them into the database:

- **B-7**: `webhook_idempotency` would have grown unboundedly with no retention.
- **H-4**: Any authenticated user could insert an `audit_logs` row with `performed_by = NULL` and `performed_by_name = '<some other admin>'`, spoofing actions for someone else in the audit trail.
- **H-6**: Once a batch reached a terminal state (processed/failed/rejected/reversed), the only thing stopping a buggy code path from regressing it was code review.
- **H-8**: The webhook handler's idempotency-claim and `batch_item` update were two separate Supabase-JS calls. A failure between them would silently double-process or silently drop an event.
- **L-5**: `reset_transactional_data.sql` was a single double-click away from wiping production.

## Changes

### Database — `supabase/migrations/20260815000000_audit_state_webhook_hardening.sql`

#### B-7 — webhook_idempotency retention

- New composite index `webhook_idempotency_event_processed_idx` on `(event_type, processed_at DESC)` so the daily purge and per-event metrics view scan only the relevant rows.
- New `webhook_idempotency_metrics` view (security_invoker) — one row per `event_type` with `total_rows`, `rows_24h`, `rows_7d`, `oldest`, `newest`. Lets ops dashboards spot a stuck event type.
- New `purge_old_webhook_idempotency()` SECURITY DEFINER function: `DELETE FROM webhook_idempotency WHERE processed_at < now() - interval '90 days'`. Returns the row count it removed.
- Scheduled via pg_cron daily at 03:00 UTC (guarded — migration succeeds even when pg_cron is absent).

#### H-4 — audit_logs INSERT spoofing eliminated

- Two new columns: `audit_logs.ip_hash text`, `audit_logs.user_agent text` for richer forensics.
- New BEFORE INSERT trigger `enforce_audit_logs_actor()`:
  - When `auth.uid()` is set, **always** rewrites `performed_by` to `auth.uid()` and `performed_by_name` to that user's `profiles.full_name`. Client-supplied values are ignored.
  - When `auth.uid()` is NULL (service role / cron / superuser psql), leaves both fields untouched so service writes (e.g. webhook's `'Paystack Webhook'`) keep their attribution.
- New `log_audit(p_action_type, p_description, p_metadata, p_ip_hash, p_user_agent)` SECURITY DEFINER RPC — the canonical write path. Returns the new audit row id.
- `src/lib/audit.ts` now calls `log_audit` instead of inserting directly. The legacy `actor` parameter is kept for source-compat but is no longer trusted by the database.

#### H-6 — state machine triggers prevent backward transitions

- New `enforce_payment_batch_state_machine()` BEFORE UPDATE trigger on `payment_batches`. Whitelists only the legitimate forward transitions:
  ```
  draft               -> pending_approval | rejected | draft
  pending_approval    -> approved | pending_second_approval | rejected | draft
  pending_second_approval -> approved | rejected | pending_approval
  approved            -> funded | rejected
  funded              -> processing | failed | funded
  processing          -> processed | partially_processed | failed | processing
  partially_processed -> processing | processed | partially_processed
  rejected            -> pending_approval (resubmission)
  processed | failed | reversed (terminal — no transitions)
  ```
- New `enforce_batch_item_state_machine()` BEFORE UPDATE trigger on `batch_items` with the same shape.
- Both triggers respect a transaction-local GUC `kdops.allow_state_override = 'true'` for legitimate-but-unusual paths (the new webhook RPC sets this; backfills/migrations can use it explicitly).

#### H-8 — atomic webhook processing

- New `process_paystack_webhook(p_event, p_reference, p_failure_reason, p_paystack_raw, p_paystack_fee_ngn, p_processed_at)` SECURITY DEFINER RPC.
- All of: idempotency claim → `batch_items` update → batch status recalc happen inside one transaction. On `unique_violation` the RPC returns `{outcome: 'duplicate'}` immediately. On unknown reference returns `{outcome: 'no_match'}`. On any other error it raises so the caller returns 500 and Paystack retries.
- Sets `kdops.allow_state_override = 'true'` LOCAL so the recalc doesn't trip the new state-machine trigger on legitimate transitions.

### Edge function — `supabase/functions/paystack-webhook/index.ts`

- Replaced the four-step Supabase-JS sequence (idempotency-insert → batch_item-update → batch-recalc → expense-sync) with a single call to `process_paystack_webhook` RPC.
- Outcome handling:
  - `outcome=duplicate` → return 200 (don't retry).
  - `outcome=no_match` → return 200 (unrelated reference).
  - `outcome=processed` → return 200; run notifications/audit/email AFTER the txn (best effort).
  - any DB error from the RPC → return 500 with a JSON body so Paystack retries.
- Fee fetch for `transfer.success` happens BEFORE the RPC so the fee lands inside the same transaction as the status update.
- Notifications, audit, and recipient email run AFTER the RPC — failure of any of these does NOT roll back state and does NOT cause a 500.

### Frontend — `src/lib/audit.ts`

- `logAudit` now calls the `log_audit` RPC. The optional `actor` parameter is kept for source compat with existing callers but the DB ignores it. Added an optional `metadata` param for richer audit payloads.

### L-5 — danger script gating

- Moved `supabase/scripts/reset_transactional_data.sql` → `supabase/danger-scripts/reset_transactional_data.sql`.
- Added a guard at the very top of the script:
  ```sql
  IF current_setting('kdops.allow_transactional_reset', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'reset_transactional_data: refused. Set kdops.allow_transactional_reset = ''true'' in this session to confirm intent.';
  END IF;
  ```
- New `supabase/danger-scripts/README.md` documents the policy, the inventory, and how to run each script.

## Tests

`supabase/tests/audit_state_webhook_hardening.sql` — 11 contract tests:

1. `log_audit` RPC sets `performed_by` to `auth.uid()`.
2. Trigger overwrites client-supplied `performed_by` (spoof attempt).
3. Trigger leaves service-role `performed_by_name` intact when `auth.uid()` is NULL.
4. State machine blocks `processed → pending_approval` regression.
5. State machine bypassed when `kdops.allow_state_override = 'true'`.
6. `batch_items` state machine blocks `reversed → succeeded`.
7. `process_paystack_webhook` returns `processed` then `duplicate` on retry.
8. `process_paystack_webhook` returns `no_match` for unknown reference.
9. `purge_old_webhook_idempotency` removes rows > 90 days old.
10. `webhook_idempotency_metrics` view is queryable.
11. All three new triggers are wired up in `pg_trigger`.

Run:
```bash
psql "$DATABASE_URL" -f supabase/tests/audit_state_webhook_hardening.sql
```

## Verification checklist

- [ ] `npx tsc --noEmit` passes.
- [ ] Webhook duplicate delivery returns `200 ok (duplicate)`, no double batch_item update.
- [ ] Webhook against an unknown reference returns `200 ok (no_match)`.
- [ ] Webhook with a forced DB error returns 500 (Paystack will retry).
- [ ] Driver-role user attempting to insert `audit_logs` with `performed_by = '<admin uuid>'` is rejected by the existing `audit_logs_insert_self_only` policy.
- [ ] An audit row written via `log_audit` has `performed_by = caller's auth.uid()` regardless of any value the client tried to pass.
- [ ] Direct `UPDATE payment_batches SET status='pending_approval' WHERE status='processed'` from any role is blocked by the state-machine trigger unless `kdops.allow_state_override = 'true'` is set.
- [ ] Running `reset_transactional_data.sql` without the GUC raises immediately. With `SET kdops.allow_transactional_reset='true'`, it proceeds.
