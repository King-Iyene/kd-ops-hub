# Payroll Standards Reference

Read-only research document. No code or SQL was run to produce this file.

**Sourcing note on Part C:** a prior forensic audit of the KDOps payroll module was
produced earlier in this working session but its commit was deleted at the user's
request, so it no longer exists in this repository's history. Part C below draws on
that same research (file/line-level evidence gathered directly from
`src/pages/Payroll.tsx`, `src/components/payroll/*`, `supabase/functions/{payroll-scheduler,payroll-disburse,batch-worker,paystack-webhook,flutterwave-webhook}`,
and 27 payroll-related migrations under `supabase/migrations/`) rather than from a
document currently in the repo. A separate, unrelated `docs/audits/FORENSIC_AUDIT_2026-05-27.md`
does exist in the repo and mentions payroll in passing, but it is a general system
audit, not the payroll-specific one this section is built from.

---

## Part A — International Practice

Comparison across Gusto, Deel, Remote.com, and Workday, drawn from each platform's
public documentation. Where a platform doesn't document specifics publicly, that's
noted rather than guessed.

### A.1 Pay run lifecycle

| Platform | Documented states |
|---|---|
| **Gusto** | `Unprocessed → Submitted → Pending → Paid`. With Payroll Approvals enabled, a submitted payroll must be approved by a full-access admin before it advances — a distinct gate before submission. |
| **Workday** | Input/cleanup → **Calculate** (produces a "Calculated," non-final result set) → audit/reconciliation via variance reports → **Complete Payroll** (generates payment/accounting data). Calculation is explicitly separated from completion. |
| **Deel** | Report-based: submit → Deel processes (~1 business day) → client **approves** → funding → payout (1–3 days). Deel Payments separately defines `Approved → Processing → Complete`, plus `Cancelled`/`Failed`. |
| **Remote.com** | Notify → review → **Approve**, tied to a payroll-calendar cutoff (≥2 business days before payout). No named intermediate states beyond pending/approved are public. |

### A.2 Pay groups

- **Workday** has the most formal model: **Pay Group** is a first-class organization type; every worker belongs to exactly one, driving calendar/frequency, accounting, and tax setup. Period Schedules + Run Categories + Pay Groups jointly determine *when*, *what*, and *who*.
- **Gusto** groups via configurable **pay schedules** (frequency-based); non-US EOR employees get a separate, more limited schedule model (one-time or monthly only).
- **Deel** and **Remote.com** organize around **entity + country + payroll cycle** since both are global EOR/contractor platforms — a "payroll" is effectively scoped per legal entity/country per cutoff date. Neither publishes an explicit pay-group taxonomy like Workday's.

### A.3 Approval workflows

- **Gusto**: opt-in **Payroll Approvals** — a requester (any admin with edit/full access) and a single company-selected **primary approver**. Explicitly does *not* extend to off-cycle/extra-pay runs — only the regular cycle.
- **Deel**: off-cycle runs require explicit client **approval within 1 business day** after Deel processes the report — a maker/checker split, not documented as multi-tier.
- **Remote.com**: a single **Approve** action gates final numbers/payslip/bank-file generation. No documented multi-tier approval.
- **Workday**: not fully public for payroll specifically, but Workday's general business-process framework natively supports configurable multi-step approval chains and segregation of duties; retro/off-cycle payments record which business process (and approver) initiated them.

### A.4 Off-cycle and correction runs

- **Deel** is the most explicit: a dedicated **off-cycle payroll** type (bonuses, corrections, termination pay) distinct from the regular cycle, blocked from overlapping another payroll's processing window or landing within 4 business days of a regular cycle. Also offers **On-Demand** off-cycle bonuses after cutoff.
- **Gusto**: separate **off-cycle/extra-pay** runs and a dedicated **dismissal payroll** flow. For already-paid periods, documents **reversal** (cancel + redo) as one path, with an explicit caution that it's rarely right for tax-withholding issues since remitted agency funds can't be clawed back — corrections to filed quarters instead trigger **amended filings**, not silent edits.
- **Workday**: documents **retro pay** as a distinct mechanism — a recalculation produces a separate **Retro Payroll Result** processed in the next regular run and flagged as retro lines in the register, rather than mutating the original result. Append, don't overwrite.
- **Remote.com**: mainly documents pre-cutoff edits (expenses/time-off) within the standard calendar; a separately named off-cycle run type isn't clearly public.

### A.5 Termination and proration

- **Gusto**: dismissal paychecks must go out on/before the next regular payday (companies >10 employees, faster in some states). PTO payout follows state law + written policy. Notably, Gusto states it does **not prorate PTO hours** for mid-period dismissals — the full period's unused balance pays out whole; benefit deductions are handled as one full period, not prorated.
- **Deel** (EOR): statutory **severance accrues monthly** over the employment lifetime; on termination, any shortfall is invoiced to the client, any surplus refunded. Final-pay timing follows local law — methodology is explicitly **country-by-country statutory**, not one global rule.
- **Remote.com** (EOR): PTO payout and severance governed by local law per country; no single cross-country proration methodology is published.
- **Workday**: no platform-mandated policy — configurable per customer — but general guidance favors prorating salaried pay by **working days**, not calendar days.

### A.6 Audit trail design

- **Workday**: strongest public claims — "always-on auditing, immutable trails," processed payroll "cannot be altered without a clear audit trail." Every calculation produces a **Payroll Result**; retro recalculations produce separate **Retro Payroll Results** rather than overwriting originals.
- **Deel**: **SOC 2 Type II** and **ISO 27001** certified, with role-based access control and audit logs generating "complete audit trails for regulatory filings or internal reviews."
- **Gusto**: no SOC 2/immutability claims found publicly; instead documents an **amendment-based correction model** at the tax-filing layer (corrections become amended returns with the agency, not silent edits) — a de facto audit trail, but not a platform-wide immutability guarantee.
- **Remote.com**: no payroll-specific audit-log or immutability documentation found publicly.

---

## Part B — Nigerian Statutory Compliance

For **KD Squares Ltd** — private limited company, ~23 staff, Rivers State. Every
figure below is dated so staleness is visible; items flagged "verify" should be
confirmed directly with the relevant body before being relied on operationally.

### B.1 PAYE (Pay As You Earn)

**Effective 1 Jan 2026**, under the **Nigeria Tax Act 2025** (signed 26 June 2025):
- The old Consolidated Relief Allowance formula (₦200,000 + 20% of gross, min 1%) is **abolished**.
- New **0% band on the first ₦800,000** of annual taxable income functions as the new relief.
- New **rent relief**: 20% of annual rent paid, capped at ₦500,000.
- Remaining allowable deductions: pension contributions + rent relief only — most other reliefs removed.
- New **six-band progressive structure (annual)**: 0% (≤₦800k) / 15% (₦800k–₦3m) / 18% (₦3m–₦12m) / 21% (₦12m–₦25m) / 23% (₦25m–₦50m) / 25% (>₦50m) — replacing the old 7%–24% seven-band PITA structure.

*Verify:* whether the Nigeria Tax Administration Act 2025 (NTAA) changes PAYE remittance mechanics/deadlines beyond current deduct-at-source, remit-by-the-10th practice — sources describe NTAA's effect only generally.

### B.2 Pension (PenCom / Pension Reform Act 2014)

- Rate: **10% employer / 8% employee (18% total)** of pension-eligible emoluments (basic + housing + transport, or employer-defined equivalent) — unchanged.
- **Mandatory threshold: employers with 15 or more employees.** Employers with 3–14 employees may participate voluntarily.
- **At ~23 staff, KD Squares Ltd is above the mandatory threshold — participation is required, not optional.**

*Verify:* whether PenCom's September 2025 "Pension Revolution 2.0" announcement altered the 15-employee threshold — no confirmed change found, but flagged for direct PenCom confirmation since NTA 2025 did not appear to touch the Pension Reform Act itself.

### B.3 NHF (National Housing Fund)

- Since the **Business Facilitation Act 2022** (signed Feb 2023) amended the NHF Act, contribution is **voluntary for private-sector employees** (previously a mandatory 2.5% of basic salary for all).
- Remains **mandatory only for public-sector/federal employees and the self-employed.**
- Employees may opt in; those with prior compulsory deductions can request a refund from FMBN.
- **For KD Squares Ltd: NHF deduction is not required unless an individual employee opts in.**

### B.4 NSITF (Employees' Compensation Scheme)

- **Employer-only** contribution: **1% of total gross monthly payroll**, under the Employees' Compensation Act 2010.
- Registration mandatory for employers with **≥5 employees**.
- Remittance due by the 16th of the month following payday; 10% penalty on late/unremitted amounts.
- NTA 2025 explicitly preserved NSITF as a standalone levy, unaffected by the tax reform.
- **At ~23 staff, KD Squares Ltd is required to register and contribute.**

### B.5 ITF (Industrial Training Fund) — the open question, answered

- Mandatory threshold under the **ITF Act as amended by the ITF (Amendment) Act 2011** (s.6): **≥5 employees OR ≥₦50,000,000 annual turnover** — either condition alone triggers the obligation. (The original 1971 Act set the threshold at 25 employees; the 2011 amendment lowered it to 5 — a well-established, consistently reported change.)
- Rate: **1% of annual payroll**, paid annually, due 1 April of the following year; 5% monthly interest penalty for late/non-remittance.
- NTA 2025 left ITF untouched as a standalone levy.
- **Direct answer for KD Squares Ltd: at ~23 staff, the company is well above the 5-employee threshold and is required to register with and contribute to the ITF**, regardless of turnover.

### B.6 NRS rebrand and Tax ID (2025/2026 changes)

- **FIRS officially rebranded to Nigeria Revenue Service (NRS)**, effective 1 Jan 2026, under the **Nigeria Revenue Service (Establishment) Act 2025** (signed June 2025; repeals the FIRS Establishment Act 2007).
- A new **13-digit Tax Identification Number ("Tax ID")** replaces the previous TIN framework as the single identifier across federal and state tax authorities.
- Most existing taxpayers (including already-registered employers) are **not required to re-register from scratch** — the Tax ID is retrievable via the NRS portal, mapped from existing TIN records.
- For payroll: PAYE remittances from Jan 2026 onward should reference employer/employee Tax IDs; **state IRS remains the collecting authority for PAYE** under the harmonization framework.

*Verify:* exact remittance portal/banking details for Rivers State specifically — described as still stabilizing as of early 2026 in the sources found.

---

## Part C — Gap Check Against KDOps

Every Part A/B practice, mapped to what the codebase actually does. Status labels
match the prior audit's convention: **Built**, **Partially Built**, **Not Built**.

### Against Part A (international practice)

| # | Practice | KDOps status | Evidence |
|---|---|---|---|
| A.1 | Named lifecycle states, calculate-then-review gate | **Partially Built** | Actual states are `draft → pending_approval → approved → processing → paid` (`20260420100000...sql`, extended `20261003000400...sql`). No Workday-style distinct "Calculated" snapshot state — a draft's totals aren't a committed snapshot an approver reviews against. |
| A.2 | Pay groups (entity/frequency/location) | **Partially Built** | `pay_schedules` covers frequency-based grouping (9 cadences: weekly through annual) and `payroll_segments` covers department/category/employment-type filters. No legal-entity concept exists — consistent with the single-tenant finding below (multi-entity grouping has nothing to attach to). |
| A.3 | Server-enforced approval, maker/checker | **Partially Built** | `approve_payroll_run()` blocks self-approval server-side and a trigger blocks direct writes to `approved_by` (`20261002002300_payroll_budget_maker_checker.sql:71-110`) — stronger than Gusto's single-approver-only, opt-in model. Gap: the check exempts `admin`/`super_admin` from the self-approval rule entirely, which none of the four reference platforms' documented models do. |
| A.4 | Off-cycle run type, correction-as-new-record | **Partially Built** | `run_type IN ('regular','off_cycle','bonus','correction','termination')` exists (`20260812200000...sql:100-103`) — schema anticipates Deel/Workday's "correction is a new record" pattern. But a separate `payslip_adjustments` table also edits payslips directly, and no code path was found tying a `correction`-type run back to the period it corrects — unlike Workday's Retro Payroll Result, which is explicitly linked to what it corrects. |
| A.5 | Termination/proration handling | **Not Built** | No code anywhere in the payroll edge functions or UI computes final pay to a last-worked day, applies PTO payout policy, or prorates a mid-period joiner/leaver. All four reference platforms handle this as a distinct calculation path; KDOps has none. |
| A.6 | Immutable audit trail on processed records | **Not Built** | No trigger blocks `UPDATE`/`DELETE` on a `paid` `payroll_run` or on `payslips` generally — the two narrow triggers that do exist cover bank-account edits and `approved_by` writes only (`20260823000000...sql:69-78`, `20261002002300...sql:88-110`). This is the widest gap against Workday's and Deel's documented posture (immutable trails / SOC 2 processing-integrity claims). |

### Against Part B (Nigerian statutory compliance)

| # | Practice | KDOps status | Evidence |
|---|---|---|---|
| B.1 | PAYE calculation (new 2026 six-band structure) | **Needs verification against current code** | `src/lib/tax.ts` and `src/lib/tax.test.ts` implement PAYE calculation, and payslips render a PAYE line (`src/lib/payslip.ts`). Whether the *rates and bands themselves* have been updated for the Nigeria Tax Act 2025's new structure (0%/15%/18%/21%/23%/25% bands, ₦800k threshold, new rent relief) was **not directly checked in this pass** — this is a concrete, testable follow-up: read `src/lib/tax.ts` against the Part B.1 figures above. |
| B.2 | Pension (10%/8%, 15-employee threshold) | **Built** (calculation), **not enforced** (threshold) | `src/lib/statutory/pencom.ts` generates PenCom pension schedules from payroll data. No code was found that checks or enforces the 15-employee mandatory-participation threshold — it's presumably just always applied, which is correct for KD Squares' ~23 staff but wouldn't be for a smaller future tenant if this became multi-company software. |
| B.3 | NHF (voluntary, private sector) | **Built**, correctly modeled as optional | `src/lib/statutory/nhf.ts` generates NHF schedules; NHF columns were added to payslips relatively late (`20261124000009_nhis_avc_payslip_columns.sql`). Not verified in this pass whether the code treats NHF as opt-in per employee (matching the 2023 amendment) or as a blanket deduction — worth a direct check of `nhf.ts` and the employee-profile opt-in flag, if one exists. |
| B.4 | NSITF (1% employer, ≥5 employees) | **Built** | `src/lib/statutory/nsitf.ts` generates NSITF contribution schedules from payroll; also referenced in `TotalCostTab.tsx` (employer total-cost-of-employment breakdown includes NSITF). No employee-count gating found, but at ~23 staff KD Squares is well above the ≥5 threshold, so this is correct as-is. |
| B.5 | ITF (1% employer, ≥5 employees) | **Built** | `src/lib/statutory/itf.ts` exists and generates ITF schedules — confirming the codebase already assumes ITF applies, which Part B.5's research confirms is the correct call for a ~23-staff company (well above the 5-employee threshold since the 2011 amendment). |
| B.6 | LIRS (Lagos-specific — not asked for, but present) | **Built, and likely irrelevant** | `src/lib/statutory/lirs.ts` exists for Lagos Internal Revenue Service remittance. KD Squares Ltd is Rivers State, not Lagos — this module is presumably dormant/unused for this entity, not a gap. Rivers State's own IRS PAYE remittance (per B.1/B.6 above) is what actually applies; no `src/lib/statutory/rivers.ts` or Rivers-specific remittance file was identified in this pass — worth checking whether Rivers State remittance is handled generically through `tax.ts` or is missing a dedicated module the way Lagos has one. |
| B.6b | NRS Tax ID field / 2026 rebrand | **Not checked** | No search was run in this pass for a `tax_id` or `tin` field on `profiles`/`company_settings` reflecting the new 13-digit NRS Tax ID format. Flagged as an open follow-up, not a confirmed gap either way. |

### Notable overlap with the prior forensic audit's Tier-A findings

Two Part A gaps above (A.5 termination/proration, A.6 immutable audit trail) are the
same items ranked at the top of the earlier session's live-risk tier — this document
independently arrives at the same two gaps by comparing against named industry
practice rather than a generic checklist, which corroborates rather than duplicates
that finding.

---

## Follow-ups this document surfaces (not actioned — read-only research only)

1. Confirm `src/lib/tax.ts` reflects the Nigeria Tax Act 2025 six-band PAYE structure effective 1 Jan 2026 (B.1).
2. Confirm `src/lib/statutory/nhf.ts` treats NHF as employee opt-in, not a blanket deduction (B.3).
3. Confirm whether Rivers State PAYE remittance has a dedicated path, or falls through a generic one (B.6).
4. Confirm whether `profiles`/`company_settings` carries a Tax ID field in the new NRS 13-digit format (B.6b).
5. Direct-source verification of the three open items flagged in Part B research: NTAA 2025 remittance mechanics (B.1), PenCom's 15-employee threshold post-"Pension Revolution 2.0" (B.2), and Rivers State's specific NRS-era remittance channel (B.6).
