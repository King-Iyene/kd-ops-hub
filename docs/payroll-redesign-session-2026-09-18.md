# Payroll module — session summary, 18 September 2026

What changed in this session, what was verified and how, and what is
explicitly still open. Written so the next person does not have to
reconstruct any of it from the commit log.

This session continued work already in progress. The company/pay-group
consolidation (Phase 3 of the brief), the payslip redesign and most of the
dashboard and wizard work had already landed in earlier commits; the audit
and research documents those phases produced are in
`docs/payroll-pay-groups-and-lifecycle-design.md` and
`docs/payroll-standards-reference.md`. What follows is this session's work
on top of that.

---

## 1. Correctness fixes (the important ones)

### "Record as manually paid" could strand a run paid with balances unsettled

The worst defect found. Recording a run as manually paid did two things as
two separate browser round-trips: flip the status to `paid`, then call
`settle_payroll_run_deductions` — the step that actually reduces what
employees owe (recurring deductions, advance outstanding balances, staff
loans).

If settlement failed, the client tried to undo the status change with a
plain `UPDATE ... SET status='approved'` and told the operator *"Settlement
failed — reverted to Approved"*.

That revert **cannot succeed**. `trg_fn_lock_paid_payroll_run` raises on any
status change out of `paid`, which is correct — a paid run is immutable. The
client never checked that update's error, so the failure was invisible.

Consequence: the run stayed `paid` with balances unsettled, while the
operator was told it had rolled back and to retry — and the retry answered
"Already marked paid". Settlement therefore never happened, leaving advance
and staff-loan balances overstated, so **an employee could be deducted again
for money they had already repaid**.

Fixed by `mark_payroll_run_paid()`, which does both steps in one
transaction, the same way the automated disbursement path already did. A
settlement failure now rolls the status change back with it.

*Verified:* executed against local PostgreSQL 16 with the real lock trigger,
confirming both the old failure mode and the fix
(`supabase/tests/payroll_mark_paid_atomicity.sql`).

### Starting a new payroll run could silently un-approve an existing one

`upsert_payroll_draft()` is find-or-create on (company, period, pay group).
When it found an existing run it rewrote every money column and forced status
back to `draft` — without checking what that run's status was.

Reproduced against PostgreSQL 16 with the real triggers, drafting ₦99 over an
existing ₦4,477,000 run:

| Existing run's state | What happened |
|---|---|
| `pending_approval` | reset to draft, figures overwritten |
| `approved` | reset to draft, figures overwritten, `approved_by` **left set** |
| `processing` | reset to draft, figures overwritten, mid-disbursement |
| `paid` | correctly refused by the paid-run lock |

No error or warning in the first three. This makes the maker-checker control
meaningless — any later draft could un-approve a run and change its numbers —
and the stale `approved_by` left the row naming an approver who never approved
the figures it then held.

Neither existing guard covered it: the approval-state lock deliberately exempts
non-`authenticated` roles so SECURITY DEFINER RPCs can work (and this is one),
and the paid-run lock only covers `paid`.

Now refused unless the existing run is still a draft, with the wizard warning at
the point the period is picked. `schedule_auto_draft()` (the cron auto-draft) was
checked and is unaffected — it does its own INSERT with an existence guard and
never calls this function.

### Payroll approvals recorded who, but never when

`payroll_runs.approved_by` recorded the approver; nothing recorded the time.
The only time signal was `updated_at`, which every later write clobbers
(scheduling a disbursement, recording a disbursement error, settling
deductions). After any of those, the approval time was gone — which
materially weakens the maker-checker control `approve_payroll_run()` exists
to enforce.

Separately, **no** payroll status change was written to `audit_logs` at all.

Both fixed at the database layer, because the React client is only one of
four writers (`payroll-scheduler`, `payroll-disburse` and `batch-worker` all
move runs between statuses as `service_role`):

- `submitted_at` / `approved_at` / `paid_at`, stamped by trigger.
- An `AFTER UPDATE` trigger writing one `audit_logs` row per transition,
  linked to the run via `entity_type`/`entity_id`.

One subtlety: `payroll-disburse` rolls a failed disbursement back to
`approved`. Treating that as a fresh approval would overwrite the real
approval time with the time of a failed payment retry, and log an approval
nobody performed. Only `draft`/`pending_approval` → `approved` stamps
`approved_at`; the rollback is logged as `payroll_run_disbursement_reverted`.

Historical runs are **not** backfilled. There is no trustworthy source to
backfill from, and inventing plausible timestamps for runs that already paid
real salaries would look like evidence. They render as "time not recorded".

### The audit trigger initially double-logged

Caught and fixed in the same session. The client already logged
`payroll_submitted`, `payroll_approved` and `payroll_paid`, so the new
trigger briefly produced two rows per action in a hash-chained audit log.
The database is now the single source of truth and the redundant client
calls are gone.

Every `payroll_run_*` action type was also added to the audit log page's
`MODULE_OF` map — without it they fall through to the `—` default and
disappear from that page's Payroll filter, which is the exact screen someone
opens to investigate a payroll question.

---

## 2. UI/UX

### Progress rail cut from six steps to four

It showed Draft → Calculated → Review → Approve → Paid → Locked, two of
which a run can never sit at. "Calculated" rendered as a permanently dashed
circle whose tooltip read *"design-only, not a state a run can be in today"*
— developer-facing text on an HR screen, and a progress bar with a step that
never completes reads as broken.

Now exactly Draft → Review → Approved → Paid, matching the brief. Locked is
shown as the padlock on Paid, because a paid run is already immutable. Adds
per-stage hover text and a large variant for the top of a run's own panel.

### Run history with real timestamps

The run detail panel's "Activity" section showed `Approved: Yes` with no
time. Replaced with a Draft → Review → Approved → Paid timeline showing
actual times, degrading honestly to "time not recorded" for runs that
predate the stage timestamps rather than substituting `updated_at`.

### "All companies" view

The switcher listed KD Squares and NDI but had no combined option, so
"what is payroll costing us in total this month" could not be answered
without flipping between companies and adding it up by hand.

Because the sentinel is not a uuid, every writing path resolves a real
company first: starting a run from the combined view asks *"Who are you
paying?"* with a card per company (headcount, last run date). Silently
defaulting to the first company is how a KD Squares run ends up holding
NDI's employees.

Run rows show which company they belong to via a labelled badge, not a
second colour — the left stripe already encodes status, and a colour-only
cue tells nothing to someone who cannot distinguish the two brand colours.

### Download all payslips

A run's payslips can be downloaded as one ZIP. The naming is unit-tested
because it has a quiet failure mode: `JSZip.file()` overwrites, so two
employees sharing a name would produce an archive silently missing one of
them. Collisions get a numeric suffix, compared case-insensitively since an
extracted ZIP lands on a case-insensitive filesystem on Windows and macOS.

### Adjustments after approval are now visible

Per-employee adjustments feed payslip generation, and payslips are what
disbursement pays. Nothing restricts when one can be added — `payslip_adjustments`
RLS checks the caller's role and nothing else — so `approve → add adjustment →
regenerate → disburse` pays a different total than was signed off, with no second
approval.

Whether to block that is a policy call for the business (a last-minute bonus is a
legitimate thing to want), so this surfaces it rather than forbidding it: the run
detail panel now says how many adjustments were added after approval and what they
are worth, above the disbursement controls. Only detectable because `approved_at`
now exists.

### "Fix now" links land on the field that is wrong

The brief asks for links that go *directly* to the fix. Employee profile tabs are
now deep-linkable via `?tab=`, so the roster's bank-account link points at Job &
Pay and every compliance warning links each named employee to their Statutory tab,
where Tax ID, PenCom PIN, NHF and NHIS numbers live.

### Compliance check before approval

The review step said what a run would cost but nothing about whether it was
correct. It now summarises PAYE, Pension, NHF, NHIS and the employer-only
levies, computed from the same filtered roster the figures come from.

**One deliberate departure from the brief**, which asked for "NHF not
configured for 3 employees" as a warning: NHF contribution has been
*voluntary* for private-sector employees since the Business Facilitation Act
2022 amended the NHF Act. Warning about employees who have not enrolled
would push HR to "fix" something lawful and teach them the panel cries wolf,
at which point it stops being read at all. Not being enrolled is
information; what earns a warning is opting **in** with nowhere to remit to.

### Other

- Three "new payroll run" buttons called `setDialog(true)` directly instead
  of `openNewDraft`, skipping the form reset — a previously-edited draft's
  period, bonuses, allowances and deduction toggles carried into what looked
  like a blank new run. All now use one entry point.
- Touch targets on the new controls raised to 44px / 32px.

---

## 3. Compliance position

Verified as **correct as implemented** — no changes needed:

| Item | Status |
|---|---|
| PAYE | Nigeria Tax Act 2025 six-band structure (0/15/18/21/23/25%), ₦800k exempt threshold, CRA abolished, rent relief. Correct. |
| Pension | 8% employee / 10% employer on basic + housing + transport (PRA 2014 s.4). Correct — not 8% of gross. |
| NHF | 2.5% of **basic only** (NHF Act s.4), treated as per-employee opt-in, matching the 2022 amendment. Correct. |
| NSITF | 1% employer-only. Present. |
| ITF | 1% employer-only, annual. Present. |
| NHIS | 5% employee / 10% employer of basic (NHIA Act 2022 s.26). Present. |

Four independent arithmetic verifications were added
(`src/lib/payroll-arithmetic-verification.test.ts`). They matter because the
existing assertions were largely expressed in terms of the engine's own
constants — that shape of test moves with a bug and cannot catch a wrong
rate or base. The new figures are derived by hand from the regulations with
the working shown.

---

## 4. How this was verified

- **502 unit tests** across 30 files, all passing (was 447/25).
- **Lint** clean (0 errors).
- **Typecheck** unchanged against the pre-session baseline: 993 pre-existing
  errors before and after, same 6 in `Payroll.tsx`, no newly-failing file.
  (Note: the CI comment describing "~205 pre-existing errors" is stale — the
  real count is 993.)
- **Production build** passes.
- **Migrations executed against a real local PostgreSQL 16**, with the
  genuine surrounding triggers (paid-run lock, approval-state lock, audit
  hash chain) copied in, rather than being eyeballed as SQL. This is how both
  of the serious bugs above were found: each was confirmed by reproducing the
  old behaviour first, then re-running the same script against the fix.
- **All migrations deployed successfully to the live database**
  (Deploy Supabase Migrations runs #258, #259, #260 and the draft-overwrite
  guard that followed), and the types
  regenerated from the live schema confirm the new columns and function
  exist in production.

### What was NOT verified, and why

**No browser testing was possible in this session.** This environment's
network policy refuses outbound connections to every external host,
including `ops.kdsquares.com` and `supabase.com` (403 on CONNECT), and there
are no Supabase credentials locally, so the app cannot boot against real
data here. Login credentials do not help — the block is at the network
layer.

So the following parts of the brief are **not** done and should not be
assumed: clicking through the wizard in production, screenshots (before or
after), the Playwright E2E suite, visual/responsive checking at real
viewport sizes, and verifying the deployed site after release. To do these,
the environment's network policy needs to allow those hosts, which takes
effect only in a **new** session.

---

## 5. Known issues found but not fixed

1. **Audit hash-chain ordering is ambiguous within a transaction.**
   `chain_audit_log_row()` picks the previous row with
   `ORDER BY created_at DESC, id DESC`, and `created_at` defaults to
   `now()` — the *transaction* timestamp. Two audit rows written in one
   transaction therefore share it and the tie is broken by a random uuid,
   so the chain links in an arbitrary order. `verify_audit_chain` would
   report false tampering for such rows. Pre-existing and not
   payroll-specific; fixing it touches every module's audit trail, so it
   was left alone deliberately.

2. **Stale CI comment.** `.github/workflows/ci.yml` describes "~205
   pre-existing tsc errors"; the real figure is 993. Typecheck is
   `continue-on-error`, so this is documentation drift rather than a broken
   gate, but the number misleads anyone deciding whether their change made
   things worse.

3. **Phases of the brief left undone**, beyond the browser work above:
   several Phase 6 ideas (payslip QR code, P9 year-end summaries surfaced in
   the UI, bulk salary adjustments, payroll calendar view) were not built.
   They were judged lower value than the correctness defects above, which is
   a judgement call worth revisiting.
