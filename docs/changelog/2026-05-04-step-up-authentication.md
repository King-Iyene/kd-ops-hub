# Step-Up Authentication for All Approval Actions

**Migration:** `20260816000000_step_up_sessions.sql`  
**Files changed:** `src/lib/step-up.ts`, `src/lib/transfer-safety.ts`, `src/components/ApprovalConfirmModal.tsx`, `src/pages/BatchDetail.tsx`, `src/pages/Approvals.tsx`, `src/pages/Expenses.tsx`, `src/components/QuickPay.tsx`  
**Tests:** `supabase/tests/step_up_sessions.sql`  
**Runbook:** `docs/runbooks/approver-onboarding.md`

---

## What Changed

Every approval action now requires the approver to re-authenticate with their account password **and** a 6-digit TOTP code from an authenticator app immediately before the action executes.

### New DB Objects

- **`public.step_up_sessions`** — single-use tokens (5 min TTL) bound to `(user_id, purpose, resource_id)`. Each token is consumed atomically by the target RPC.
- **`public.step_up_failures`** — failure log used to enforce lockout (3 failures in 60 min blocks further attempts).
- **`create_step_up_session(p_password, p_totp_code, p_purpose, p_resource_id, ...)`** — validates password via pgcrypto `crypt()`, confirms AAL2 (TOTP verified by Supabase Auth before the call), checks lockout, creates a session row, returns the UUID token.
- **`consume_step_up_token(p_token, p_purpose, p_resource_id)`** — atomically marks a token as consumed; returns `false` if expired, already consumed, or wrong purpose/resource.

### Modified Approval RPCs

All six approval RPCs now accept `p_step_up_token uuid` as their second parameter and call `consume_step_up_token` at the top of their body before any business logic:

- `approve_payment_batch(p_batch_id, p_step_up_token, p_idempotency_key?)`
- `confirm_second_approval(p_batch_id, p_step_up_token, p_idempotency_key?)`
- `reject_payment_batch(p_batch_id, p_step_up_token, p_reason)`
- `approve_expense(p_expense_id, p_step_up_token, p_idempotency_key?)`
- `confirm_second_expense_approval(p_expense_id, p_step_up_token, p_idempotency_key?)`
- `reject_expense(p_expense_id, p_step_up_token, p_reason)`

An invalid, expired, or already-consumed token raises `P0003: step_up_required`.

### Frontend

**`ApprovalConfirmModal`** — new component that collects password + TOTP (+ rejection reason for reject actions), calls `verifyMfa()` to elevate the JWT to AAL2, then `createStepUpSession()` to obtain a token, then invokes the caller's `onConfirm(token, reason?)` callback.

The modal is wired into:
- **BatchDetail.tsx** — approve, second-approve, and reject actions.
- **Approvals.tsx** — approve and reject for batches/expenses in the mission-control queue.
- **Expenses.tsx** — approve and reject on individual expense rows.
- **QuickPay.tsx** — step-up opens before the payment summary modal; token is consumed at payment execution.

### Behaviour Changes

- **Bulk approval** (Approvals.tsx) now skips batches and expenses — they require per-item tokens. Fuel/budget/leave items still bulk-approve via the direct-update path.
- **Expense bulk approve** buttons removed from Expenses.tsx for the same reason.
- **Fuel → expense side-effect approval**: the `approveExpense` RPC can no longer be called as a silent side effect of a fuel approval (no step-up token). The paired expense is now approved via a direct status update.
- **No TOTP configured**: approvers without a verified TOTP factor see a "Set up TOTP in Security Settings" message instead of the auth form. The attempt is not counted against the lockout.

---

## Testing

Run `supabase/tests/step_up_sessions.sql` against a migrated database. Eight tests cover: table existence, token consumption, double-consume rejection, wrong purpose/resource rejection, expired token rejection, and lockout enforcement.

See `docs/runbooks/approver-onboarding.md` for the approver-facing guide (TOTP setup, lost device, lockout policy).
