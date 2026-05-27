# KD Ops Hub — Forensic System Audit (2026-05-27)

**Scope:** Full forensic, read-only audit across four tracks — Security, Money-Movement/Payments, Architecture/API/Data, and Features vs Industry Standard (incl. Nigerian statutory compliance). Built on prior audits (`PAYMENT_SUBSYSTEM_AUDIT.md`, `SECURITY_BACKLOG.md`, `SYSTEM_AUDIT_2026-05.md`) and verified against current code.

**Stack:** React 18 + Vite + Supabase (Postgres/RLS/Realtime/Deno Edge Functions) + Paystack + Vercel. 184 migrations, ~57 pages, 17 edge functions, ~700 partners paid month-end.

---

## Executive summary

The platform reached a **genuinely strong, finance-grade posture by mid-August 2026** (SECURITY DEFINER approval RPCs, fail-closed transfer caps, dual-control with payload-hash binding, hash-chained immutable audit log, step-up auth, idempotent transfers with webhook HMAC). The current 2026 Nigerian tax engine (`computePayslip`) is correct and well-tested.

**However, three later migrations rolled several controls back**, and that is the headline risk of this audit:

- `20260817000000_remove_restrictions.sql` + `20260818000000_drop_remaining_constraints.sql` — dropped the approval-state-write-lock trigger and the distinct/self-approver constraints.
- `20260916000000_operations_manage_payment_batches.sql` — granted the Operations role raw UPDATE on `payment_batches` and `batch_items` (this was added recently to let Operations prepare batches; it has an unintended fraud surface).

Net effect: **money is still bounded by the fail-closed cap RPC at dispatch** (a single actor cannot exceed their daily/monthly ceiling), **but the approval-authorization layer below the co-approval threshold is bypassable, and batch-item status can be falsified.** These are the top fixes.

Separately, the **largest statutory/compliance risk** is the pension/NHF calculation basis (computed on gross rather than basic), plus the absence of statutory filing/year-end (P9) outputs.

### Severity overview

| ID | Severity | Area | One-line |
|----|----------|------|----------|
| C1 | 🔴 Critical | Payments | Approval-state write-lock trigger dropped → clients can set `status='approved'` directly, skipping the approve RPC (self/co-approval + cap pre-check bypassed) |
| C2 | 🔴 Critical | Payments | Operations can write `batch_items.status` directly → fake "succeeded" / payment-fraud concealment (from the `20260916` migration) |
| S1 | 🔴 Critical | Statutory | Pension/NHF deducted on **gross** not **basic** → mis-remittance + mis-stated net across ~700 payees |
| S2 | 🟠 High | Statutory | No statutory filing / year-end outputs (PAYE schedules, PenCom files, employee P9 cards) |
| H1 | 🟠 High | Payments | Self-approval re-permitted for admin/super_admin; distinct-approver CHECK dropped (batches ≤ co-approval threshold) |
| H2 | 🟠 High | Security | Paystack secret key stored in a plaintext DB column, round-trips through the admin browser |
| H3 | 🟠 High | Security | MFA gate is client-side only; sensitive reads not server-enforced at `aal2` → salary/PII exposed with a stolen password |
| M1 | 🟡 Medium | Security | CSV formula injection in exports (`= + - @` prefixes unescaped) |
| M2 | 🟡 Medium | Security | `payroll-scheduler` edge function unauthenticated |
| M3 | 🟡 Medium | Security | Webhook `timingSafeEqual` throws on length-mismatch → 500/retry storm |
| M4 | 🟡 Medium | Security | Audit hash-chain omits `description` field |
| M5 | 🟡 Medium | Architecture | 149 TypeScript errors (46% audit-union gaps, rest stale generated types) — red typecheck hides real regressions |
| M6 | 🟡 Medium | Architecture | Unbounded/over-fetch reads on Transactions, Expenses, BatchDetail |
| M7 | 🟡 Medium | Features | No maternity/paternity leave; no minimum-wage validation |
| L1–L9 | 🟢 Low | Mixed | search_path on 2 definer fns; CORS `*` on send-email; unauth `list_banks`/`resolve_account`; MIME validation; partial indexes on `deleted_at`; soft-delete RLS consistency; `.single()` on by-id reads; shallow manager hierarchy; no SSO/DR runbook |

---

## 🔴 CRITICAL

### C1 — Approval-state write-lock dropped; status transitions bypass the approve RPC
**Evidence:** `20260817000000_remove_restrictions.sql:53-55` and `20260818000000_drop_remaining_constraints.sql:36-43` drop the `payment_batches_approval_state_lock` trigger + `enforce_batch_approval_state_writes()` (originally `20260813000000_payment_state_rpcs.sql:694-743`). RLS `batches_update` now allows super_admin/admin/finance/**operations** (`20260916000000:29-34`). The surviving `enforce_payment_batch_state_machine` (`20260815000000:204-222`) permits `pending_approval → approved` for all roles with **no actor / cap / self-approval check**.

**Risk:** a finance or operations user can run `supabase.from('payment_batches').update({status:'approved'}).eq('id',…)`, skipping `approve_payment_batch`'s self-approval block, co-approval threshold, and cap pre-check, then call `mark_batch_funded` → `start_batch_processing` (which only require `status='approved'` + role). The submitter can self-approve and dispatch their own batch with no second approver. Last backstop is the per-transfer/daily/monthly cap RPC at dispatch (`paystack-transfer/index.ts:327-399`).

**Fix:** recreate `enforce_batch_approval_state_writes` + trigger (batch and expense variants); force all lifecycle transitions through the RPCs; protect `approved_by`/`funded_by`/`second_approver_id` from direct writes. Do not ship the two "remove restrictions" migrations to production state.

### C2 — Operations can falsify `batch_items.status` (fake "succeeded")
**Evidence:** `20260916000000_operations_manage_payment_batches.sql:44-49` grants Operations UPDATE on `batch_items`; `enforce_batch_item_state_machine` (`20260815000000:265-279`) permits `pending → succeeded`. Client already does raw `batch_items.update({status:'succeeded'})` (`BatchDetail.tsx:1051-1060`).

**Risk:** any finance/operations user can mark an unpaid item `succeeded` with no Paystack reference, no webhook, no service-role — silencing a contractor complaint or concealing a diverted payment. *This surface was introduced by the Operations-access migration added this session.*

**Fix:** restrict the Operations `batch_items` UPDATE to non-status payload columns (or only while parent batch is `draft`), and route all `batch_items.status` writes through SECURITY DEFINER RPCs (the webhook RPC already uses the `kdops.allow_state_override` GUC). Revoke direct UPDATE on `batch_items.status` from `authenticated`.

### S1 — Pension/NHF computed on gross, not basic (statutory mis-remittance)
**Evidence:** `computePayslip` applies pension (8%), NHF (2.5%), NHIS as a flat % of **gross** (`src/lib/tax.ts:184-197`). Under the Pension Reform Act the 8%/10% base is BASIC + housing + transport; NHF is 2.5% of **basic**. Nigerian structures commonly set basic ≈ 40–60% of gross.

**Risk:** over-deducts pension/NHF, under-states chargeable income → mis-stated employee net **and** employer remittance, across ~700 payees. Legal/financial exposure + back-correction liability.

**Fix:** introduce a salary-component breakdown (basic/housing/transport) and compute pension/NHF on the statutory base. Confirm every payroll *run* uses `computePayslip` (not the simpler `calculatePAYE` at `tax.ts:107`, which taxes 100% of gross with no relief and should be retired or clearly quarantined to non-payroll display).

---

## 🟠 HIGH

### S2 — No statutory filing / year-end outputs
The Compliance module *tracks* obligations as reminders (`Compliance.tsx:70`) but generates no state-IRS PAYE schedules, PenCom remittance files, NHF schedules, or annual employee **P9 / tax cards** (grep found no P9/YTD year-end generation). Best-in-class Nigerian tools (PaidHR, Bento, Seamless) auto-produce these. Manual reconstruction = audit/compliance risk. **Fix:** add PAYE/pension schedule exports and per-employee P9 generation from existing payslip data.

### H1 — Self-approval reinstated for admin/super_admin
`20260818000000:28-33` drops `batches_no_self_approval` + `batches_distinct_approvers`. Even via the proper RPC, `approve_payment_batch` (`20260817…:107-111`) *allows* a submitting admin/super_admin to self-approve. Batches **above** the co-approval threshold still require a distinct second approver (`confirm_second_approval:229-236`) — safe — but any batch **at/below** the threshold can be single-handedly created and approved by an admin/super_admin (single-account-compromise exposure). This is a deliberate policy choice; confirm it's intended, otherwise re-enable distinct-approver enforcement.

### H2 — Paystack secret key in plaintext DB column
`paystack-transfer/index.ts:119-125` reads `company_settings.paystack_secret_key_enc` and uses it verbatim as a bearer token — the `_enc` suffix implies encryption it doesn't have. Editable via `Settings.tsx:692-697` (round-trips through the admin browser DOM). Any super_admin/admin/finance with read access can exfiltrate the **live** key. **Fix:** move to Supabase Vault / function secrets; expose only last-4; never return the secret to the client.

### H3 — MFA is client-side only; sensitive reads not server-enforced at aal2
`useAuth.ts:51-66`, `mfa.ts:46-55` enforce the TOTP challenge only in React; trusted devices deliberately don't upgrade AAL (`mfa.ts:13-16`). RLS gates on role, never on `aal`. **Exploit:** a stolen password (victim has TOTP) → call Supabase REST directly with the aal1 JWT and read salary/PII; the MFA prompt is cosmetic for reads. Money is still safe (approval RPCs require aal2 via step-up, `20260816000000:169`). **Fix:** add an `aal2` requirement to RLS on the most sensitive tables (salary columns, payslips, batch_items) for users who have a verified factor.

---

## 🟡 MEDIUM

- **M1 — CSV formula injection.** `src/lib/csv.ts:2-6` quotes only `" , \n \r`; cells beginning `= + - @` (or tab/CR) become live formulas in Excel/Sheets (e.g. a contractor name `=HYPERLINK(...)` or `=cmd|'/c calc'!A1`). Names flow into Reports/transfer-audit exports. **Fix:** prefix such cells with `'`.
- **M2 — `payroll-scheduler` unauthenticated.** `supabase/functions/payroll-scheduler/index.ts:17` is `--no-verify-jwt` with no secret/role check — anyone with the URL can spam draft payroll runs + Finance notifications (no fund movement). **Fix:** shared-secret header (the `batch-worker` pattern).
- **M3 — Webhook signature length-mismatch → 500.** `paystack-webhook/index.ts:71` — `timingSafeEqual` throws on a wrong-length signature → 500 → Paystack retry storm. **Fix:** length-check, return 401 on mismatch.
- **M4 — Audit hash-chain omits `description`.** `20260824000000` hashes everything but `description` (the money narrative). Client UPDATE/DELETE is still blocked by the immutability trigger, so this is defence-in-depth only. **Fix:** include `description` in the digest.
- **M5 — 149 TypeScript errors / red typecheck.** 69 (46%) are `AuditActionType` union gaps (`src/lib/audit.ts:3` missing ~45 literals; `log_audit` takes plain `text`, so no runtime risk). Rest = stale `src/integrations/supabase/types.ts` vs 184 migrations, papered over with `as any` casts on financial JSONB. **Fix:** extend the union (~1 hr, clears 46%) and regenerate types.ts in CI; add typed wrappers for `bonuses_json`/`ratings`/`development_plan`.
- **M6 — Unbounded/over-fetch reads.** `Transactions.tsx:155` (`select('*').limit(500)`, truncates older rows, no cursor); `Expenses.tsx:235` (no `.range`/`.limit` at all); `BatchDetail.tsx:324` (`batch_items.select('*')` uncapped). **Fix:** keyset pagination + explicit column projection (indexes already exist).
- **M7 — Leave & wage gaps.** Leave types are only annual/sick/unpaid (`Leave.tsx:120-124`) — **no maternity** (Labour Act mandates 12 weeks) or paternity. No minimum-wage validation (no ₦70k floor check). **Fix:** add maternity/paternity leave types + a min-wage warning in payroll.

---

## 🟢 LOW

- **L1** — `compute_payroll_variance()` / `schedule_auto_draft()` lack `SET search_path` (`20260812200000:136,445`); both SECURITY DEFINER, former granted to `authenticated`. Add `SET search_path = public`.
- **L2** — `send-email` CORS `*` (`send-email/index.ts:73`); paystack-transfer correctly uses an allowlist — align them.
- **L3** — `list_banks`/`resolve_account` unauthenticated + unthrottled → enumeration/quota abuse.
- **L4** — `file-validation.ts` checks size only, not MIME/extension (buckets private + signed URLs, so low).
- **L5** — Hot indexes don't include `deleted_at`; add partial `WHERE deleted_at IS NULL` indexes (68 query sites filter it).
- **L6** — Soft-delete filtering lives mostly in client queries; only 11 migrations enforce `deleted_at` in RLS — push into RLS/views for defence-in-depth.
- **L7** — `.single()` on by-id detail reads (`ContactProfile.tsx:78`, `ClientProfile.tsx:96`, `ContractorProfile.tsx:141`, `BatchDetail.tsx:323`) throws PGRST116 on a stale URL id → use `.maybeSingle()` + not-found UI.
- **L8** — Shallow org hierarchy: only `departments.head_id`, no `manager_id`/reports-to on profiles → no manager-routed approvals or org chart.
- **L9** — No SSO/SAML/SCIM; no documented backup/PITR restore runbook (relies on Supabase managed backups, untested restore); no NDPR automated right-to-erasure (`data-retention-runner` explicitly skips documents/employee files, `index.ts:24-26`); English-only (no i18n); no WCAG audit artifact.

---

## ✅ What is genuinely strong (preserve — do not regress)

- **Transfer cap engine** (`20260807000000`/`20260814000000`): per-role/per-user single/daily/monthly caps, **fails closed** (no config = block), in-flight intent rows counted, platform ceiling honored, enforced server-side in the edge function and inside the approval RPCs. On par with Ramp/Brex spend controls.
- **Dual-control with payload-hash binding:** re-approval is invalidated if the payload changed after first approval (`confirm_second_approval:252-269`) — a sophisticated control many competitors lack.
- **Surviving payload locks:** `batch_items_payload_lock` + `payment_batches_totals_lock` (`20260811000000:1170-1198`) still block amount/account edits after approval — neutralize the old amount-inflation path.
- **Hash-chained immutable audit log** (`20260822000000`) + `verify_audit_chain()` + `transfer_audit` storing IP-hash (never raw IP). Strong tamper-evidence.
- **Step-up auth** (`20260816000000`): server verifies password, requires aal2, re-checks role + self-approval, single-use 5-min purpose+resource-bound tokens, lockout after 3 failures.
- **Idempotent transfers:** deterministic `kdops_` refs + edge pre-flight dedup + Paystack duplicate-ref self-heal + DB partial unique index on `paystack_reference` (`20260912000000`).
- **Webhook HMAC** verified before processing; idempotency keyed `(reference, event_type)`.
- **NTA 2025 tax engine** (`tax.ts:39-46`, verified by `tax.test.ts`): abolishes CRA, six 2026 bands, ₦800k exemption, 20%/₦500k rent relief — ahead of many Nigerian tools still on the old PITA regime.
- **Concurrency:** `start_batch_processing`/`mark_batch_funded` use `SELECT … FOR UPDATE` + status whitelist — no double-dispatch.
- **Recurring/payroll safety:** schedules create `pending_approval` (never auto-pay); auto-draft always inserts `draft` with ₦0 — empty payroll can't be auto-approved.
- **Engineering:** realtime well-bounded (5 channel sites, all with cleanup); edge functions time-budgeted + chunked + retry-with-jitter; 151/236 FKs declare explicit ON DELETE; no swallowed errors; critical-path tests (money/tax/transfer-safety) present; thoughtful Vite chunking + lazy Sentry.

---

## Recommended remediation roadmap

**Wave 1 — restore money-movement authorization (do first, with sign-off; these touch live access control)**
1. C2 — lock `batch_items.status` behind RPCs; restrict Operations UPDATE to draft-stage payload columns. *(stems from this session's `20260916` migration)*
2. C1 — recreate `enforce_batch_approval_state_writes` + trigger (batch + expense); protect approver columns.
3. H1 — decide on self-approval policy for admin/super_admin; re-enable distinct-approver if not intended.

**Wave 2 — statutory correctness (legal exposure)**
4. S1 — pension/NHF on statutory base (basic+housing+transport); retire/quarantine `calculatePAYE`.
5. S2 — PAYE/pension schedule exports + per-employee P9.
6. M7 — maternity/paternity leave + minimum-wage validation.

**Wave 3 — security hardening**
7. H2 — Paystack secret → Vault. 8. H3 — aal2 on sensitive-table RLS. 9. M1 — CSV injection. 10. M2/M3/M4 — scheduler auth, webhook length-check, audit digest.

**Wave 4 — engineering hygiene**
11. M5 — extend `AuditActionType`, regenerate types.ts in CI (green typecheck). 12. M6 — pagination on Transactions/Expenses. 13. L1–L7 — search_path, partial indexes, `.maybeSingle()`, soft-delete RLS.

**Wave 5 — platform maturity (optional)**
14. NDPR automated erasure; SSO/SAML; DR restore runbook; org/manager hierarchy.

---

*Generated 2026-05-27. Read-only audit — no code changed. Four parallel forensic tracks (security, payments, architecture, features/compliance) cross-checked against prior audits and current source.*
