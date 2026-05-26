# System Audit — KD Ops Hub (May 2026)

Read-only deep audit across the payout path, payroll, HR, UI/UX + mobile/PWA,
and system-wide liabilities, benchmarked against Paystack's official limits,
Nigerian 2026 payroll law, PWA standards, and fintech mass-payout best practice.
No code was changed to produce this report.

_Compiled: 2026-05-26._

---

## Verdict
The core is well-engineered for a fintech (atomic webhook RPC, idempotent
transfers, server-side caps, immutable audit log, real installable PWA, Nigerian
payslips). But there are two live security holes, two money double-spend/data-leak
vectors, payroll PAYE errors, and — most urgently — the **700-partner month-end
payout will not run reliably as-is.**

---

## 🔴 CRITICAL

### 1. Month-end 700-partner payout will fail mid-run
- **Two dispatchers race.** The browser serial loop (`BatchDetail.executeProcess`)
  is the real sender and never invokes `batch-worker`; but a pg-cron watchdog
  fires every 60s and re-dispatches any batch in `processing` >60s. A 700-item
  run takes 15–40 min, so the watchdog dispatches the same batch concurrently.
  `batch-worker.dispatchItem` has no duplicate-recovery → can mark an item
  `failed` that the browser actually paid. Settings.tsx tells operators "safe to
  close the tab" — **false**; closing it leaves a 1-per-minute crawl.
- **Daily cap blocks it.** Finance daily cap = ₦20M (admin ₦50M). A 700-partner
  run exceeds ₦20M; the per-item cap check fails the tail of the batch with
  "daily cap exceeded", and the loop doesn't treat that as a stop signal.
- **`bulkTransfer` is dead code.** Implemented (`paystack.ts:473`,
  `paystack-transfer:499`) but called nowhere → 700 = ~1,400 serial API calls.
- **Paystack official limits:** ≤100 transfers per bulk call, ≥5s between
  batches, one webhook per transfer, unique reference each.
- **Fix:** one dispatcher (route Process → `batch-worker`), pre-flight the batch
  total vs the actor's daily/monthly cap, wire `bulkTransfer` (100/call, ≥5s
  apart). Touches the live money loop → test on staging before month-end.

### 2. Chatbot history IDOR — cross-user data read (`chatbot-chat/index.ts:291`)
Loaded with the service-role client filtered only by request `conversation_id`,
never checked against the authenticated user. Any user can read/append to any
other user's chat history. Fix: verify `conversation.user_id == auth.uid()`.

### 3. Partner-pay double-batching (`PartnerPayCalculator.tsx:128`)
"Already paid this period" is computed at page load and never re-checked on
insert; no unique constraint on contractor batch items per period. Two
operators/tabs → partners paid twice. Fix: partial unique index on
`(contractor_id, period)` for non-rejected contractor batches, or an RPC lock.

### 4. Payroll PAYE computed wrong (`Payroll.tsx:334`, `:657`)
Run summary bands the SUM of all salaries as one taxpayer; PAYE is also computed
on gross, ignoring pre-tax pension/NHF/reliefs (never calls `computePayslip()`).
Every employee's tax is overstated and the run total never reconciles with
payslips. Fix: route all PAYE through `computePayslip()` and sum per-employee.

---

## 🟠 HIGH
- **H1** Bank-change audit leaks across ALL employees on a schema-drift fallback
  that drops the per-employee filter — `EmployeeProfile.tsx:353`.
- **H2** QuickPay creates a `funded` batch before the transfer with no rollback —
  money "funded" but never sent if Paystack throws — `QuickPay.tsx:194`.
- **H3** Login-lockout DoS: unauthenticated endpoint locks any account by email —
  `record-failed-login/index.ts:57`.
- **H4** No employee self-service (own profile, payslips, leave) — admin-only
  routes — `App.tsx:341`.
- **H5** No real termination/offboarding (final pay + access revocation manual) —
  `Onboarding.tsx`.
- **H6** Leave: double-spend race + no accrual/overlap/holiday logic; `leaveTaken`
  sums a non-existent column (always 0) — `Leave.tsx`, `EmployeeProfile.tsx:800`.
- **H7** Payslip save writes a `file_url` column that doesn't exist — `Payroll.tsx:804`.
- **H8** Auto-drafted payroll runs are ₦0 shells → auto-approve could approve ₦0.
- **H9** Contractors & Leave tables overflow on mobile (no card view) —
  `Contractors.tsx:1916`, `Leave.tsx:724`.

## 🟡 MEDIUM
- Soft-delete sweep incomplete in HR pickers (deleted staff appear in
  Attendance/Leave/Performance/etc. dropdowns).
- EWA settlement scoped period-wide but deducted per-included-employee →
  unrecovered cash.
- `batch-worker` has no atomic claim (relies solely on Paystack ref dedup).
- `timingSafeEqual` can throw on malformed webhook signature → 500 + retries
  (`paystack-webhook:69`).
- Unbounded `batch_items`/contractors scans in Reports (`Reports.tsx:1216, 601`).
- Leave quota default mismatch (12 vs 21); Attendance summary ignores filters.

## 🟢 LOW
- ~50 `(data as any)` casts near money math (risky with non-blocking CI typecheck).
- Onboarding/Disciplinary/Attendance hard-delete (lose audit trail).
- `send-email` CORS `*`; no in-app PWA install button; aria-label sweep; BatchDetail unpaginated.

## 📋 Compliance / standards gaps
- Payroll proration (mid-month joiners/leavers), tax-remittance proof
  (PAYE/pension/NHF to PFA/FIRS), year-end P9 — missing.
- Confirm the 2026 rent-relief PAYE path is actually used by the payroll module.

## ✅ Genuinely world-class (don't touch)
Webhook HMAC + atomic idempotent RPC; idempotent transfers with self-heal;
server-side role gate + cap reservation; deterministic refs + unique index;
immutable audit log; soft-delete RPC; installable PWA; complete Nigerian payslip.

---

## Recommended sequence
- **Before month-end (money-critical, staged):** #1 dispatcher+cap+bulkTransfer,
  then #3 partner double-pay guard, #2 chatbot IDOR, #4 PAYE.
- **This week (safe, no staging):** H1, H3, H6, H7, H8, HR soft-delete pickers, H9.
- **Backlog:** self-service portal, offboarding, leave engine, proration/remittance,
  Medium/Low.

## Deferred to staging (Supabase Pro preview branch)
The single-dispatcher + atomic-claim rewrite and bulk-transfer batching rewrite
the live payment loop and must be exercised against the 6-scenario test matrix
with Paystack test keys before production.
