# KDOps Payroll Module — Findings-Only Audit (Live-Verified)

**Date:** 2026-09-11
**Auditor:** Claude (engagement: payroll calculation audit, findings only — no fixes applied)
**Method:** Live reproduction against the production Supabase project (`mseeurrvdcfxdmvqjjki`) via the app's
own "Testing" pay group sandbox (Iyene Iyene, King Test [Pls Don't Delete]), logged in as Super Admin,
plus static tracing of every calculation path in `src/pages/Payroll.tsx`, `src/lib/tax.ts`,
`src/lib/statutory/*`, `src/components/payroll/*`, and the relevant Supabase SQL functions/migrations.

**Skills/plugins checked before starting:** none of the installed skills are payroll/tax/accounting-specific
for codebase auditing (`finance:*` skills are bookkeeping/journal-entry workflows aimed at accounting
platforms, not source-code calculation audits; `engineering:debug`/`code-review`/`testing-strategy` are
general-purpose). None were invoked — this audit was done by direct source reading plus live
reproduction in the running app, which is the only way to satisfy "show me the real output number."

---

## 0. Headline

The P0 you asked me to check — **"Total burn" swallowing contractor payouts and approved expenses into a
single payroll run's total** — is confirmed live, right now, in production. It's not a stale screenshot: the
same draft (September 2026, Testing pay group) still sits there showing **₦653,000.00** for a run whose
actual payroll is ₦2,000 gross.

Three more P0s came out of tracing *why*: the RPC that saves a draft's totals trusts whatever the browser
sends with no server-side recomputation or authorization check; the numbers an approver reviews are
computed once at draft time and never refreshed, while the payslips actually generated at approval use
live employee data — so what's approved and what's paid can silently differ; and deductions/loan
repayments that exceed gross pay are still recorded as fully collected even though net pay silently floors
to ₦0.

Two of your four required reproductions came back "not possible" as designed (excluding one person from a
single run; discovering pay-group creation from the obvious screen) rather than "bug found" — those are
documented as P1s below since they're real gaps, just not calculation errors.

---

## 1. Severity-ranked summary

| # | Severity | Title | File(s) | Reproduced? |
|---|----------|-------|---------|-------------|
| P0-1 | **P0** | "Total burn this run" = gross + **all** company-wide contractor payouts + **all** approved expenses for the calendar month, unrelated to the run's own employees | `src/pages/Payroll.tsx:514-661` | **Yes — live, ₦653,000.00** |
| P0-2 | **P0** | Approved/reviewed payroll totals are frozen at draft time; actual payslip generation re-fetches live employee data with no recompute-and-compare — approver can sign off on numbers that aren't what gets paid | `src/pages/Payroll.tsx` (`draftRun` 503-746, `approve` 964-1021, `generatePayslips` 1077+), `PayrollRosterPreview.tsx` | **Yes — live, ₦2,000 → ₦2,400 drift shown in one drawer** |
| P0-3 | **P0** | `upsert_payroll_draft` RPC has no caller-role check and was never `REVOKE`d from `PUBLIC`/`authenticated` — any logged-in user can write arbitrary payroll totals for any period via direct RPC call, bypassing all UI role gating | `supabase/migrations/20261217200000_race_condition_fixes.sql:95-168` | Code-confirmed; not exploited live (would require a second, lower-privilege test account) |
| P0-4 | **P0** | When deductions/loan/advance repayments exceed gross pay, net pay silently floors to ₦0, but the **full, un-floored** deduction amounts are still written to the payslip and used to reduce loan/advance balances and mark deductions "collected" | `src/pages/Payroll.tsx:1418` (clamp) vs. `1571-1596` (unclamped ledger lines) vs. `settle_payroll_run_deductions` in `20261125000007_unify_payroll_settlement.sql:32-133` | Code-traced only — explicitly **not** attempted live (see §4) |
| P1-1 | P1 | No way to exclude one employee from a single run without removing them from the pay group / zeroing their salary / making them inactive (which affects them everywhere, not just this run) | `payslip_adjustments` schema + `openAdjustments`/`addAdjustment` in `Payroll.tsx` — kinds are `bonus`/`overtime`/`allowance`/`deduction` only | **Yes — live**, confirmed via UI |
| P1-2 | P1 | Creating a new Pay Group is impossible from the "Pay groups" tab most users would use (Edit/Manage members only); it only exists under **Setup → Pay Groups → New group** | `PayrollGroupsTab` (main tab) vs. Setup sub-tab | **Yes — live**, created + deleted a test group to confirm |
| P1-3 | P1 | A payroll run's roster preview ("who gets paid") always re-queries live employee data regardless of run status (Draft/Calculated/Review/Approved), but the run's stored dollar totals never auto-recompute — the two can disagree in the same drawer with no warning indicator | `PayrollRosterPreview.tsx:50-97` (live query) vs. `payroll_runs.total_employee_ngn` (frozen at draft) | **Yes — live** (same reproduction as P0-2) |
| P2-1 | P2 | Payroll deliberately uses float-NGN, whole-naira precision (rounded once in `tax.ts`), not the integer-kobo convention documented and used elsewhere in this codebase (`src/lib/money.ts`) | `src/lib/money.ts:1-16` (self-documented boundary) | Confirmed by design, not a defect — flagged because it contradicts "one fixed-point rule" |
| P2-2 | P2 | The inflated `total_burn_ngn` from P0-1 propagates everywhere that column is read: Runs-tab stat tiles, burn-trend chart, `CashBurnCard.tsx`, `BoardReportTab.tsx`, `AnnualSummaryTab.tsx` | multiple | Same root cause as P0-1, listed separately to show blast radius |
| P2-3 | P2 | Run card title renders "September 2026 Payroll Payroll" (duplicated word) | `PayrollRunsTab.tsx` | Observed live |

**Checked and found consistent (no bug):**
- Statutory toggle scope — company (`company_settings.*_enabled`) AND employee (`profiles.*_enabled`) AND
  per-run (`run_options`) are ANDed together identically in both the draft-preview calculation
  (`Payroll.tsx:585-653`) and the real `generatePayslips()` calculation (`Payroll.tsx:1371-1374`).
- Double-processing protection — partial unique indexes `payroll_runs_period_no_segment_uniq` /
  `..._segment_uniq` (`20261101000000_fix_critical_rls_and_payroll_guards.sql:101-106`) block a second
  draft for the same period+segment; "already marked paid" / "already settled" idempotency guards exist
  both client-side (`Payroll.tsx:1862-1866`) and inside `settle_payroll_run_deductions` (checks
  `deductions_settled_at`).
- Pay-group member count vs. run employee count — these matched throughout testing (3 members ↔ 3
  employees in run) *when nothing changes between drafting and viewing*. The mismatch only appears once
  live data changes after the draft exists — that's P0-2/P1-3, not a separate counting bug.

---

## 2. Calculation-path map

### 2.1 Where a payroll run's totals are computed
| What | Where | Data pulled from |
|---|---|---|
| Draft-time preview totals (`totalEmployee`, `totalContractor`, `totalExpenses`, `paye`, `pension`, `nhf`, `nsitfCharge`, `nhis*`, `burn`) | `draftRun()`, `Payroll.tsx:503-746` | `profiles` (active, non-driver), `payment_batches` (batch_type=contractor, status in processed/funded, by `payment_date`), `expenses` (status=approved, by `date`), `employee_deductions`, `employee_advances` — **all company-wide, not scoped to the run's pay group except `profiles`** |
| Persisted run row | `upsert_payroll_draft` RPC, `20261217200000_race_condition_fixes.sql:95-168` | Whatever the client sent — **no server-side recomputation** |
| Actual payslip generation (real money) | `generatePayslips()`, `Payroll.tsx:1077-1600+` | Fresh `profiles` query (live salary/components), `employee_deductions`, `employee_advances`, `ewa_requests`, `payslip_adjustments`, `employee_earnings`, unpaid `leave_requests` — **independent of the stored run totals** |
| Approval | `approve_payroll_run` RPC, `20261125000009_...sql:55-117` | Only flips status + schedules disbursement; does not touch/recompute totals. Has a proper role check (`super_admin`/`admin`/`finance` + self-approval block) — unlike P0-3. |
| Settlement of deductions/loans/advances | `settle_payroll_run_deductions` RPC, `20261125000007_unify_payroll_settlement.sql:32-133` | Reads `payslips.deductions_json` (the un-floored amounts, see P0-4) |

### 2.2 Where gross/PAYE/pension/NHF/NHIS/NSITF are calculated
- **Single source of truth for per-employee statutory math:** `computePayslip()` in `src/lib/tax.ts:230-370`.
  Used by both the draft-preview PAYE estimate (`Payroll.tsx:593-604`) and the real per-employee payslip
  calc (`Payroll.tsx:1376-1390`) — this part is **not** duplicated logic, which is good.
- Pension: 8% employee / 10% employer (`PENSION_EMPLOYEE_RATE`/`PENSION_EMPLOYER_RATE`), base = gross, or
  `basic+housing+transport` when `use_salary_components` is on (PRA 2014 basis).
- NHF: 2.5%, base = gross or `basic` only (components mode).
- NHIS: 5% employee / 10% employer, same base rule as NHF.
- NSITF: 1% of payable gross, employer-borne, always computed for display but only added to "burn" when
  `company_settings.nsitf_enabled !== false`.
- PAYE: NTA 2025 bands applied to `payableGross + additionalTaxable - pension - AVC - NHF - NHIS - rentRelief - lifeAssurance`, annualized then divided by 12.
- `src/lib/statutory/{firs,itf,lirs,nhf,nsitf,pencom,p9}.ts` are exporters/report generators (statutory
  filings, P9, compliance autopilot) — they read already-computed payslip/compliance rows, they do not
  independently recompute gross/PAYE/pension.

### 2.3 Where "total burn" / "net pay" / run-level aggregates are computed
- **Total burn (draft preview):** `Payroll.tsx:658-661` —
  `totalContractor + totalEmployee + totalExpenses + employerPension + nsitfCharge + nhisEmployer + bonusTotal + totalAllowances - totalDeductions - totalAdvanceRepayments`.
  This is **P0-1**: `totalContractor`/`totalExpenses` are company-wide, calendar-month sums, not scoped to
  the run's employees at all.
- **Net pay (per-employee, real payslip):** `Payroll.tsx:1418` —
  `Math.max(0, empGrossTotal - unpaidLeave - PAYE - pension - AVC - NHF - NHIS - devLevy - deductions - advances - EWA - adjDeductions)`.
  This is **P0-4**: the floor at 0 doesn't propagate back into the ledger lines that get "collected."
- **Net pay (run-level display, `RunDetailDrawer`):** `PayrollRunsTab.tsx:639` —
  `r.total_employee_ngn - r.paye_ngn - r.pension_ngn - r.nhf_ngn` — a simplified, separate formula from the
  per-employee one above (doesn't subtract NHIS/advances/deductions), used only for the summary card. Not
  wrong, just a different (coarser) computation living in a second place — worth knowing if the two are
  ever compared.
- **`computePayslip()` net (statutory-only):** `tax.ts:339-342` — also floors at 0, independently of the
  Payroll.tsx-level floor. Two separate `Math.max(0, …)` floors in two files for two overlapping concepts.

### 2.4 Data sources, summarized
`profiles` (employees), `payment_batches` (contractor payouts), `expenses`, `employee_deductions`,
`employee_advances`, `ewa_requests`, `payslip_adjustments`, `employee_earnings`, `leave_requests`,
`payroll_segments` (saved pay-group/segment filter rules), `payroll_runs` (frozen totals), `payslips`
(generated output + `deductions_json`/`earnings_json`), `staff_loans`/`staff_loan_repayments`,
`company_settings` (tenant-level toggles).

---

## 3. Reproductions — what I actually did and saw

### P0-1: Total burn includes contractor payouts + expenses
Opened the **existing** September 2026 draft (Testing pay group, 3 employees — this is the same run from
your screenshot, still sitting in Draft) and stepped through to Review:

```
2026-09 · 3 employees
Gross salaries          ₦2,000.00
Contractor payouts    ₦407,000.00
Approved expenses     ₦244,000.00
Total burn this run   ₦653,000.00
```

Confirmed the bug is live, unchanged since your screenshot. Traced to `Payroll.tsx:514-567`: the
`payment_batches` and `expenses` queries filter only by `batch_type='contractor'`/`status='approved'` and a
calendar-month date range — **no join or filter against the run's pay group or segment at all.** Any
contractor payment or approved expense company-wide, for any employee or none, lands in this run's "total
burn" no matter which 2-3 people are actually being paid.

### P0-2 / P1-3: Reviewed totals go stale; live roster vs. frozen ledger
1. Opened the same Testing run's detail drawer: `2 will be paid · ₦2,000.00` (Iyene Iyene ₦1,000 + King
   Test ₦1,000), Money Ledger `Gross pay ₦2,000.00` — consistent, matches your screenshot exactly.
2. Went to Iyene Iyene's profile, changed Basic from ₦600 → ₦1,000 (gross ₦1,000 → ₦1,400), saved.
3. Reopened the **same** run drawer, no other action taken:
   - Roster preview: **`2 will be paid · ₦2,400.00`** (live recompute — reflects the raise immediately)
   - Money Ledger below it, same drawer: **`Gross pay ₦2,000.00`** (unchanged, frozen from original draft)
4. Reverted Iyene Iyene's Basic back to ₦600 to restore state.

Traced why: `PayrollRosterPreview.tsx` fetches all `profiles` fresh on every render and re-applies the
segment filter (`useRoster()`, lines 50-97) — this is unconditional on run status. The Money Ledger reads
`r.total_employee_ngn` etc., columns written once by `upsert_payroll_draft` and never recomputed. Then,
critically, `generatePayslips()` (called both by the manual button and automatically inside `approve()`)
does its **own fresh** `profiles` query (`Payroll.tsx:1091-1106`) — so the actual payslip amounts generated
at approval time are the *current* live salary, not the number the approver reviewed. There is no
recompute-and-diff step between "approve" and "generate payslips," and no warning anywhere that the
reviewed total may be stale.

### P0-3: `upsert_payroll_draft` has no caller-role check
Read the full function body (`20261217200000_race_condition_fixes.sql:95-168`) — it does a find-or-create
`UPDATE`/`INSERT` on `payroll_runs` using exactly the parameters passed in, with **no `auth.uid()` /
`profiles.role` check anywhere**, and no `REVOKE ... FROM PUBLIC` statement in this or any later migration
(confirmed via repo-wide search). This is `SECURITY DEFINER`, so it runs with elevated privileges and
bypasses RLS on `payroll_runs`.

This is the **exact same vulnerability class** the team already found and fixed three times, documented in
`20261123000001_lock_down_unrestricted_definer_functions.sql`:
> "Postgres grants EXECUTE to PUBLIC by default on function creation... Supabase grants EXECUTE on every
> new public-schema function directly to anon/authenticated/service_role via ALTER DEFAULT PRIVILEGES at
> creation time — REVOKE ... FROM PUBLIC alone does NOT touch those direct per-role grants."

`upsert_payroll_draft` was created **after** that hardening migration (Dec 17 vs. Nov 23), in a migration
focused on an unrelated `ON CONFLICT` bug, and was never given the same treatment. By contrast,
`approve_payroll_run` (a later migration, `20261125000009`) *does* have a proper internal role check
(lines 73-81: must be `super_admin`/`admin`/`finance`, plus self-approval block) — so the pattern this
codebase uses to secure these RPCs exists and works, it just wasn't applied here.

**Not exploited live** — doing so would require a second, lower-privileged real user account to prove
externally, which I didn't create. Flagging as code-confirmed, high-confidence, given the identical prior
pattern.

### P0-4: Negative net pay is absorbed silently, but debt is still "collected"
Traced, not live-reproduced (see §4 for why). In `generatePayslips()`:
- `empNet` (`Payroll.tsx:1418`) is wrapped in `Math.max(0, …)` — net pay cannot go negative in the record.
- The `deductions_json` written to the payslip (`Payroll.tsx:1571-1596`) uses the **raw, un-floored**
  amounts for every deduction/advance/EWA/loan line — there is no proration or capping to "whatever gross
  actually covers."
- `settle_payroll_run_deductions` (`20261125000007_unify_payroll_settlement.sql:86-129`) sums exactly those
  `deductions_json` amounts and applies them in full: `employee_deductions.amount_deducted_to_date`
  increases by the full amount, `staff_loans.outstanding_ngn` decreases by the full amount, a
  `staff_loan_repayments` row is inserted for the full amount.

Net effect: an employee whose scheduled deductions exceed their gross pay this period is recorded as having
their loan/advance reduced by the *scheduled* amount, while their actual `net_ngn` on the payslip is ₦0 —
the shortfall (the part that couldn't actually be withheld from any payment) simply vanishes from every
ledger. No error, no carry-forward, no flag.

### P1-1: Cannot exclude one employee from a single run
Opened "Add bonus or per-employee adjustment" on the live run — the **Type** dropdown only offers:
`Bonus`, `Overtime`, `Allowance`, `Deduction`. Confirmed against `payslip_adjustments` schema/usage in
`Payroll.tsx` (`addAdjustment`, `kind` values used throughout: `bonus`/`overtime`/`allowance`/`deduction`
only — grepped the whole file, no `exclude`/`skip`/`opt_out` kind exists anywhere). The only way to keep
one person out of one run is to change something about them globally (inactive status, ₦0 salary, or
change their pay group) — all of which affect every future run too, not just this one.

### P1-2: Pay group creation not discoverable from the obvious screen
The main **Pay groups** tab (`/payroll` → Pay groups) lists all 6 existing groups with only "Edit members" /
"Manage members" buttons — no create action anywhere on that screen, confirmed by reading the full
interactive-element list twice (scrolled to the bottom, footer "Generated ... KDOps" with nothing after).
Found "New group" only under **Setup → Pay Groups** sub-tab. To confirm it actually works (not just that
the button exists), created a real pay group named "ZZ Audit Test - Delete Me" — got a "Group created"
toast, it appeared in the list with 0 members — then deleted it immediately ("Group deleted" toast). No
residue left in the tenant.

---

## 4. Explicitly NOT reproduced, and why

- **P0-4 end-to-end** (a real employee with deductions exceeding gross, run through Draft → Approve → Paid
  to see the loan balance actually drop while net pay shows ₦0): I traced this fully through the source and
  I'm highly confident in the read, but actually running it live would mean (a) attaching a real loan/
  advance to one of the sandbox employees, and (b) advancing a real run to **Paid** status, which multiple
  migrations (`lock_paid_payroll_runs_and_payslips`, `payroll_disbursement_lock`) treat as a hard,
  effectively irreversible lock. I chose not to take an irreversible production action to prove a finding I
  could already confirm with high confidence from the code. If you want this live-verified, say so
  explicitly and I'll set up an isolated test loan on a Testing-group employee first.
- **P0-3 exploited externally:** would need a second, non-admin authenticated test account to call the RPC
  directly and prove it writes despite lacking permission. I only had the one Super Admin login, so this is
  a code-level finding, not a live exploit demonstration.

Everything else in your original list (total burn reproduction, pay-group count consistency, exclude-one-
employee attempt, create-pay-group attempt, stale-total-after-employee-edit) was reproduced live with real
numbers, documented above.
