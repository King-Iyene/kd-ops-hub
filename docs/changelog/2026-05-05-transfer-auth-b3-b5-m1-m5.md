# Transfer Authorization hardening — closes B-3, B-5, M-1 – M-5

**Date:** 2026-05-05
**Branch:** `main`
**Scope:** BLOCKER B-3 (no audit trail on cap changes), BLOCKER B-5 (in-flight money not reflected in cap accounting), and MEDIUM findings M-1 through M-5 from `docs/audits/PAYMENT_SUBSYSTEM_AUDIT.md`.

## Summary

The transfer-limits table was writable by any super_admin without any history trail. Cap checks counted only completed ('ok') transfers, not in-flight ones, allowing two concurrent requests to both pass a cap check when their combined total exceeded the limit. Per-user overrides had no expiry, no reason requirement, and no ordering constraint between single/daily/monthly values. A super_admin could quietly raise their own caps or those of a peer at the same role level. The audit panel in Settings was a flat 50-row view with no filtering or export.

This change fixes all of that in one migration and updates the frontend and edge function to consume the new contracts.

## Changes

### Database — `supabase/migrations/20260814000000_transfer_auth_b3_b5_m1_m5.sql`

**Schema additions to `transfer_limits`:**
- `single_batch_limit_ngn numeric` — batch-total ceiling separate from single-transfer cap (M-2)
- `expires_at timestamptz` — user overrides expire; `check_transfer_caps` ignores expired rows and falls back to the role default (M-1)
- `granted_by uuid` — who created/last-modified the override
- `granted_reason text` — mandatory justification (≥5 chars) for user overrides

**Cap ordering CHECK constraint (M-3):**
```
single ≤ daily ≤ monthly
batch ≤ monthly
```
Added `NOT VALID` then immediately validated; all existing seed rows satisfy it.

**`transfer_limits_history` table (B-3):**
Immutable append-only log. Every `INSERT / UPDATE / DELETE` on `transfer_limits` is captured automatically by a `SECURITY DEFINER` trigger that records `before_row` / `after_row` as JSONB and `auth.uid()` as `changed_by`. RLS allows approver roles to read; authenticated writes are blocked by policy.

**`set_transfer_limit(...)` RPC (B-3, M-1, M-4):**
Replaces all direct `supabase.from('transfer_limits').upsert(...)` calls. Enforces:
- Super_admin only
- No self-edit (`p_user_id = auth.uid()` → rejected)
- No same-role edit (`p_role = caller's own role` → rejected)
- User overrides: reason ≥ 5 chars required; default expiry 30 days; hard max 90 days
- Cap ordering violation from the CHECK constraint is caught and re-raised with a user-friendly message
- Writes `transfer_audit` (action=`cap_changed`) and `audit_logs` on every call

**`delete_transfer_limit(p_id)` RPC (M-4):**
Same self/role-edit guards for deletions. History trigger captures the deleted row automatically.

**`check_transfer_caps(...)` updated (B-5, M-1, M-2):**
New signature (all new params have defaults — existing callers unchanged):
```sql
check_transfer_caps(
  p_user_id         uuid,
  p_amount_ngn      numeric,
  p_intent          boolean  DEFAULT false,
  p_action          text     DEFAULT 'initiate_transfer',
  p_check_batch_cap boolean  DEFAULT false,
  p_ip_hash         text     DEFAULT NULL,
  p_user_agent      text     DEFAULT NULL
)
```
Returns a 7th column: `intent_audit_id uuid`.

Key behaviour changes:
- **B-5 (intent):** When `p_intent = true` and the check passes, inserts an `outcome='intent'` row in `transfer_audit` and returns its id. Rolling usage now counts `outcome IN ('ok', 'intent')` so concurrent requests see each other's reserved headroom.
- **M-1 (expiry):** User override lookup adds `AND (expires_at IS NULL OR expires_at > now())`. Expired overrides fall back to the role default.
- **M-2 (batch cap):** When `p_check_batch_cap = true`, checks `single_batch_limit_ngn` against the amount before daily/monthly caps.

**`release_abandoned_intents()` (B-5):**
Flips `outcome='intent'` rows older than 30 minutes to `'abandoned'`. Called every 5 minutes via `pg_cron` (guarded — skips silently if extension is absent).

**`notify_expiring_overrides()` (M-1):**
Daily cron at 09:00 UTC. Finds user overrides expiring today, in 1 day, or in 7 days and inserts a `notifications` row for each active super_admin. Deduplicated — won't re-notify if the same alert was sent in the last 23 hours.

### Edge function — `supabase/functions/paystack-transfer/index.ts` (B-5)

- Passes `p_intent: true, p_action: action, p_check_batch_cap: action === 'bulk_transfer'` to `check_transfer_caps`.
- Stores the returned `intent_audit_id`.
- On successful transfer: **updates** the intent row to `outcome='ok'` with final metadata instead of inserting a new row. This keeps cap accounting accurate (no double-counting).
- On error in the catch block: updates the intent row to `outcome='error'` so it stops counting against rolling caps immediately (without waiting for the 30-minute abandoned sweep).

### Edge function — `supabase/functions/export-transfer-audit/index.ts` (M-5, new)

New function for CSV export. Requires an authenticated super_admin/admin/finance JWT. Accepts `start_date`, `end_date`, `action_type` (all/transfers/cap_changes/denials), `limit` (≤10000) query params. Returns `text/csv` with `Content-Disposition: attachment`.

### Frontend — `src/lib/transfer-safety.ts`

- `TransferLimit` interface: added `single_batch_limit_ngn`, `expires_at`, `granted_by`, `granted_reason`.
- `CapCheckResult`: added `intent_audit_id: string | null`; `applied_limit_kind` now accepts `'batch'` and `'platform_single'`.
- Added `SetTransferLimitParams` interface and `setTransferLimit(params)` wrapper.
- `deleteTransferLimit` now calls the `delete_transfer_limit` RPC (audited) instead of a direct DELETE.
- `previewCapCheck` explicitly passes `p_intent: false` — browser previews never create intent rows.
- Added `fetchTransferAuditPaginated(filters)` — cursor-based pagination with date range + action type filters.
- `fetchRecentTransferAudit` updated to exclude `intent` and `abandoned` rows.

### Frontend — `src/components/settings/TransferAuthSettings.tsx` (M-2, M-4, M-5)

- **Role defaults table:** Added "Max batch total" column for `single_batch_limit_ngn`. Fixed a pre-existing bug where `co_approval_threshold_ngn` was rendered twice. Save button disabled and labelled when `role === currentUserRole` (M-4).
- **Per-user override form:** Added Expires date picker (default +30d, max +90d), Reason textarea (required ≥5 chars), Max batch input. Duplicate `co_approval` input removed.
- **Per-user override table:** Added Expires badge (green/amber/red by days remaining), Max batch column, Reason column. Delete button disabled for self's own override with tooltip.
- **Audit panel:** Replaced flat 50-row view with paginated panel (50/page, "Load more"). Filters: date range, action type (All / Transfers / Cap changes / Denials). "Export CSV" button triggers a download from the new edge function.
- All limit edits now route through `setTransferLimit` RPC (B-3); no more direct table upserts.

## Tests

`supabase/tests/transfer_auth_b3_b5.sql` — 13 contract tests:

1. `set_transfer_limit` creates a `transfer_limits_history` row.
2. Cap edit writes `transfer_audit` with `action=cap_changed`.
3. Self-edit blocked at RPC layer.
4. Same-role edit blocked at RPC layer.
5. >90-day expiry rejected.
6. User override without reason rejected.
7. `transfer_limits_history` immutability trigger blocks UPDATE.
8. `cap_ordering` CHECK blocks `daily > monthly`.
9. `check_transfer_caps` returns `intent_audit_id` when `p_intent=true`.
10. In-flight intent row counts against concurrent request's rolling cap.
11. `release_abandoned_intents` ages a >30min intent row to `abandoned`.
12. Expired user override falls back to role default.
13. `p_check_batch_cap=true` path runs without error.

Run:
```bash
psql "$DATABASE_URL" -f supabase/tests/transfer_auth_b3_b5.sql
```

## Verification checklist

- [ ] `npx tsc --noEmit` passes.
- [ ] Role defaults Save button is greyed out for the caller's own role.
- [ ] Adding a user override without a reason fails with a clear error.
- [ ] Adding a user override with `expires_at` > 90 days fails.
- [ ] Cap change appears in `transfer_audit` with `action=cap_changed`.
- [ ] `transfer_limits_history` row present after any cap edit.
- [ ] Direct `UPDATE transfer_limits SET ...` from a test authenticated user is captured in history.
- [ ] Export CSV downloads with correct headers and rows matching active filters.
- [ ] A user with an expired override is subject to the role default in a cap check.
- [ ] Two concurrent cap checks for amounts that together exceed the daily cap: the second fails.
- [ ] Abandoned intent rows are swept after 30 minutes (or manually via `SELECT release_abandoned_intents()`).
