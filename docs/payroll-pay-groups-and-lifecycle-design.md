# Pay Groups & Run Lifecycle — Design

Read-only design document. No code or SQL was written or run to produce this file;
field lists below describe what a pay group needs to know, not table definitions.
Grounded in `docs/payroll-standards-reference.md` and direct inspection of the
current schema (`pay_schedules`, `payroll_segments`, `employee_deductions`,
`contractors`, `referrals`, `commission_overrides`, `company_settings`, and the
`payment_batches`/`payroll_runs` tables).

---

## Where KDOps actually stands today

Before designing forward, it's worth being precise about what already exists,
because two of the three groups below are **not new concepts** — they're existing,
partially-built features that have never been unified under one "pay group"
abstraction:

- **Employees** run through the real payroll engine: `pay_schedules` (cadence),
  `payroll_segments` (population filtering by department/category/employment type),
  `payroll_runs` (the lifecycle), and the statutory modules in `src/lib/statutory/`.
- **Contractors** are paid through the same `payroll_runs`/`payment_batches`
  machinery, but only as an aggregate total (`payment_batches.batch_type = 'contractor'`)
  computed via WHT rather than PAYE — there is no per-contractor payroll record
  comparable to a payslip, and no dedicated pay group structure. `contractors` exists
  as a table (used by the referral/HeyReach features below), but payroll doesn't
  join to it — it just sums a batch total.
- **The LinkedIn outreach / commission network is currently two disconnected
  features**, neither of which is a payroll run at all:
  - `src/components/ReferralCommissions.tsx` computes what's owed (referral
    one-time bonus after a qualifying-day window, or recurring tiered affiliate
    commission) from `referrals` + `commission_overrides` + `company_settings`
    rate columns — but it's **view-only**. It generates no payment batch and has
    no approval action.
  - `src/components/PartnerPayCalculator.tsx` generates an actual payment batch
    for HeyReach-active contractors (`contractors.heyreach_status = 'active'`),
    but reuses `batch_type = 'contractor'` and is keyed to a monthly period label
    rather than to the underlying commission events — it's calendar-shaped
    plumbing wrapped around an event-shaped business reality.
  - A dead `referral_partners` table exists from an earlier design and is unused —
    the live model treats referrers as existing `contractors`.

  There is no `'referral'` or `'affiliate'` value in `payment_batches.batch_type`
  today (`'contractor' | 'employee_salary' | 'advance' | 'prize' | 'mixed'` only).

The design below proposes a `pay_groups` concept that gives all three populations
the same structural home, without inventing a fourth thing for the commission
network to live in — it should sit on top of the existing `contractors` table and
`referrals`/`commission_overrides` logic, not replace them.

---

## Proposed pay group structure

A **pay group** is the thing that answers: *who is in this population, what
currency do they get paid in, what triggers a payment, and what gets deducted?*
It is deliberately closer to Workday's formal Pay Group object (§A.2 of the
standards reference) than to KDOps' current implicit model, where "who's included"
lives in `payroll_segments.filter_rules` but nothing ties currency, deduction
profile, and trigger type to that same population definition.

### Pay Group 1 — Employees

| | |
|---|---|
| **Trigger type** | Calendar — driven by `pay_schedules` (monthly cadence for NGN salaried staff; the schema already supports weekly/biweekly/semimonthly/etc. for future use). |
| **Population** | `payroll_segments` filter rules (department, employee_category, employment_type), same mechanism as today. |
| **Required fields** | Employee ID, `pay_currency` (NGN default), basic/housing/transport breakdown (pension-eligible emolument needs this split, not just a gross figure), bank account, Pension PIN, NRS Tax ID (13-digit format effective 2026 — see standards doc B.6), employment_type, department. |
| **Applicable deductions** | PAYE (`tax.ts` — needs verification against the 2026 six-band structure, standards doc B.1), Pension 8% employee / 10% employer (`pencom.ts`, mandatory at KD Squares' ~23-staff headcount), NHF — **opt-in only**, not blanket (`nhf.ts`, standards doc B.3), NSITF 1% employer-only (`nsitf.ts`), ITF 1% employer-only, annual (`itf.ts`, confirmed applicable at this headcount per standards doc B.5), plus ad-hoc `employee_deductions` (staff loans, EWA settlement). |
| **Approval path** | Full lifecycle below, maker-checker enforced, **including admin/super_admin** (closing the self-approval bypass flagged in the prior audit). |
| **Currency** | NGN. USD is representable via `pay_currency` today but with no FX rate captured at run time — a gap this design doesn't need to solve, but a future employee pay group in USD would need it solved first (standards doc A/B gap). |

### Pay Group 2 — Contractors

Today this is a payment-batch label, not master data. The fix isn't a new table —
`contractors` already exists and is used elsewhere (HeyReach status, referral
attribution). The fix is **making payroll join to it** instead of treating
contractor pay as an unstructured batch total.

| | |
|---|---|
| **Trigger type** | Calendar (retainer contractors paid monthly, same cutoff/lead-time model as employees) *or* per-invoice/one-time (project-based contractors) — a `payment_cadence` field on the contractor record, not a hardcoded assumption. |
| **Population** | Rows in `contractors` flagged as active and payroll-eligible — a real join, not a batch-level aggregate. |
| **Required fields** | Contractor ID (FK to `contractors`), `pay_currency` (NGN or USD, contractor-specific — many are paid in USD today per the HeyReach flow), `payment_cadence`, bank account or USD payment rail, WHT category/rate, Tax ID (TIN), contract_type (retainer vs. project-based), rate_type (fixed / hourly / deliverable-based). |
| **Applicable deductions** | **WHT (withholding tax) only** — contractors are explicitly excluded from PAYE/pension/NHF/NSITF/ITF, which are employee-specific per standards doc Part B. No other statutory deduction applies. VAT handling if the contractor is a VAT-registered entity is a separate, unresolved question worth flagging to Finance rather than assuming either way. |
| **Approval path** | Same lifecycle as employees, but as its own lane (own `pay_group_id`, its own calculated/reviewed/approved run) rather than folded into the employee run's aggregate total — this is what makes per-contractor payslip-equivalents possible, which don't exist today. |
| **Currency** | Mixed NGN/USD per contractor. This pay group is exactly where FX-rate-capture-per-run (standards doc A/B gap, item 7 of the original 12-point baseline) actually starts to matter in practice, since contractor USD amounts are currently converted at calculation time with no frozen rate on the record. |

### Pay Group 3 — LinkedIn Outreach Partners / commission-based payees (~800+)

This is the group that most needs new structure, but it should be designed as **a
commission-triggered lane over the existing `contractors` + `referrals` +
`commission_overrides` data**, not a parallel roster. Most of the 800+ are already
`contractors` rows (via HeyReach connection); the commission logic that determines
*what they're owed* already exists in `ReferralCommissions.tsx` — it just has no
path to becoming an approved, paid, audited run.

| | |
|---|---|
| **Trigger type** | **Event-triggered, not calendar-triggered.** The earning event is a referral conversion clearing its qualifying-day window (`company_settings.referral_qualifying_days`, default 30) or a recurring monthly affiliate tier calculation for an active account — not a pay-schedule date. A periodic sweep (e.g. monthly) is still needed to *batch* accumulated event-triggered earnings into a payable run, the same way a credit-card issuer batches authorizations into a statement — but the underlying obligation is created by the event, not the calendar. |
| **Population** | Partners with at least one payable commission event since the last batch — a dynamic, event-derived population, not a static filter like `payroll_segments`. |
| **Required fields** | Partner ID (FK to `contractors`, since the live model already treats referrers as contractors — no separate roster needed at the master-data level), commission_type (referral / affiliate), rate reference (`company_settings` flat USD rates, or a `commission_overrides` row for a partner-specific arrangement), the qualifying referral/account event ID each line item traces back to (this is the audit trail a commission payout needs — "why was this partner paid ₦X" should always resolve to a specific referral row), payment currency, **minimum payout threshold** (a new recommendation — batching sub-threshold balances forward rather than issuing many tiny payments is standard practice at this network size and isn't currently modeled anywhere). |
| **Applicable deductions** | **None statutory by default** — these are not employees, and referral/affiliate commission is not payroll income. **Open compliance question, not asserted either way**: whether Nigerian tax rules require WHT on commission paid to non-employee individuals at this volume. This should go to Finance/tax counsel before the first real batch runs at ~800-partner scale — it is exactly the kind of thing that's cheap to get right up front and expensive to unwind later. |
| **Approval path** | Same seven-state lifecycle for consistency and auditability, but the **calculated** step here means something specific: a frozen list of qualifying referral/affiliate events for the period, so an approver can see *which events* produced *which amounts* rather than approving an opaque total. Given per-partner amounts are typically small, a lighter cutoff-window requirement than the employee cycle is reasonable, but the same non-negotiables apply: no self-approval, no editing a paid batch. |
| **Currency** | USD-rated (`company_settings` rate columns are all USD-minor-unit), paid out in NGN via FX conversion. Same frozen-rate-at-calculation gap as Pay Group 2 applies here, arguably more urgently given the volume of partners. |

### The structural piece all three groups are missing

None of the three groups above currently sit under one object that says "this is a
pay group: here's its population rule, its currency, its deduction profile, its
trigger type, its approval policy." Employees get the closest approximation via
`payroll_segments` + `pay_schedules`, but that pairing only encodes population and
calendar — not currency or deduction profile. A `pay_groups` concept that each of
the three sections above maps onto would let `payroll_runs` reference a single
`pay_group_id` instead of the current ad hoc mix of `payroll_segment_id`,
`pay_schedule_id`, and `payment_batches.batch_type`, and would give the commission
network in particular a real home instead of two disconnected read-only/reused-batch-type
features.

---

## Run-status lifecycle: current vs. designed

Requested target: `draft → calculated → reviewed → approved → processing → paid → locked`

### What exists today

Actual deployed lifecycle (`payroll_runs.status` CHECK constraint, per the schema):

```
draft → pending_approval → approved → processing → paid
```

Five states, not seven. Two gaps map directly onto states the target design
introduces:

| Target state | Exists today? | Notes |
|---|---|---|
| `draft` | **Yes** | An auto-generated run starts here with all totals at zero; a manually-created run also starts here. |
| `calculated` | **No — new.** | This is the gap the prior audit flagged as "no explicit Calculate step distinct from Draft" (standards doc A.1). Today, a draft's totals are computed live whenever an operator opens it — there's no frozen, timestamped snapshot of "these are the figures as of this calculation" for a reviewer to check against. Workday's split between its Calculate task and Complete Payroll task is the direct model for this state. |
| `reviewed` | **Partially — collapsed into `pending_approval`.** | Today, submitting a draft moves it straight to `pending_approval`, which conflates "submitted for someone to look at" with "actually been checked." The codebase already has the raw material for a real review gate — `src/lib/anomalies.ts` includes payroll-run anomaly scanning — but nothing today requires that scan to run, or its result to be acknowledged, before a run can be approved. `reviewed` should mean: anomaly scan has run, variance against the prior period has been shown, and a reviewer (who need not be the final approver) has explicitly signed off on the *numbers*, before anyone is asked to authorize *payment*. |
| `approved` | **Yes**, and enforced server-side. | `approve_payroll_run()` blocks self-approval and a trigger blocks direct writes to `approved_by` — genuinely solid maker-checker mechanics. The one gap (also previously flagged): `admin`/`super_admin` are exempt from the self-approval check, which undermines the point of the control for exactly the roles most likely to hold disbursement authority. This design assumes that exemption is closed as part of introducing `reviewed` as a separate, earlier gate — separating "did someone check the math" from "did someone with authority sign off on the money" is what makes closing the admin exemption safe to do without adding friction. |
| `processing` | **Yes.** | Disbursement in flight; this is also the module's strongest area today per the standards-reference gap check — row-level locking, idempotent payment references, orphan recovery all already exist here. |
| `paid` | **Yes.** | Terminal today — and that's exactly the problem the next state fixes. |
| `locked` | **No — new, and the most important addition.** | This is the direct fix for the prior audit's top structural finding: nothing today stops a `paid` payroll run or its payslips from being edited or deleted like any other row. `locked` should be the state that actually carries an immutability trigger — no `UPDATE`/`DELETE` permitted on a locked run or its payslips, full stop, for any role including admin. A `paid` run should transition to `locked` either automatically after a short grace window (to allow same-day reconciliation corrections) or manually once Finance confirms reconciliation is clean. Any correction after that point must go through a `correction`-type run referencing the locked original — which `run_type` already supports in the schema, it's just never been wired to a hard immutability boundary. |

### Why the two new states solve two different problems

- **`calculated`** is a *quality* gate — it stops an approver from ever looking at
  live-recomputed numbers that could change between when they were shown and when
  they're approved. It's the fix for "there's no committed snapshot" (§A.1).
- **`locked`** is a *safety* gate — it stops anyone, including the people who are
  allowed to approve payroll, from quietly rewriting history after money has moved.
  It's the fix for "processed records aren't immutable" (§A.6, and the top
  live-risk finding from the earlier audit).

They're easy to conflate because both sound like "make payroll more rigid," but
they close different holes: one protects the *decision*, the other protects the
*record* after the decision has already been acted on.

### Applying this to all three pay groups

The seven-state lifecycle should be the same shape for Employees, Contractors, and
the commission network — the audit trail value of "reviewed, then approved, then
locked" doesn't stop mattering just because a commission batch is smaller money or
event-triggered rather than calendar-triggered. What should differ per pay group is
*policy parameters* layered on top of the same states — cutoff/lead-time windows,
who counts as an eligible reviewer, whether `calculated` requires a mandatory
anomaly-scan pass or just makes one available — not the states themselves. Giving
all three groups the same lifecycle is also what makes a future consolidated
payroll register (all pay groups, one period, one audit trail) possible without
three different reconciliation stories.
