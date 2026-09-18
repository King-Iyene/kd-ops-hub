# Payroll — what is left, for a session with a browser

Written 18 September 2026 at the end of a long session that could not reach
the app. Everything below is either blocked on a browser or blocked on a
decision. The finished work is on `main`; the full record is in
`docs/payroll-redesign-session-2026-09-18.md` and
`docs/payroll-standards-reference.md`.

## State of the repo

- Branch `main`, everything pushed, CI green.
- 531 unit tests pass (`npm run test`), lint has 0 errors.
- `npm run typecheck` reports **993 errors — all pre-existing**, 6 of them in
  `src/pages/Payroll.tsx`. That is the baseline. Do not "fix" them as part of
  payroll work; just check the number has not gone up.

## 1. The money decision — cumulative PAYE

The one thing most worth a human's judgement.

`computePayslip()` in `src/lib/tax.ts` works out PAYE by annualising the month
in front of it. On a flat salary that is exact. On uneven pay it over-withholds,
because progressive bands are convex:

| Pay pattern | Over-withheld over the year |
|---|---|
| Flat ₦400k/month | ₦0 |
| + ₦2.0m December bonus | ₦48,333 (4.8%) |
| + ₦6.0m December bonus | ₦293,000 (16.9%) |
| ₦60k/month + ₦300k bonus | ₦14,300 (**43.3%**) |

The lowest earner is hurt worst proportionally: the bonus is what carries them
over the ₦800k exemption, so their bonus month is taxed as if every month
looked like it, and nothing later in the year gives it back.

`src/lib/paye-cumulative.ts` implements the fix (project year-to-date income to
a full year, tax that, take this period's share, withhold the difference). Eight
tests, including that a flat salary is unchanged and that December trues the
year up exactly. **It is not wired in.** Turning it on changes take-home on
every payslip where pay is uneven.

Before switching it on, decide and check:
- Does the business want withholding corrected, or kept as-is with employees
  reclaiming on their annual return?
- **Mid-year switching produces a one-off correction** in the first cumulative
  run, because it trues up every prior month at once. Verify what that does to
  a real employee's payslip before running it on everyone. Starting at a tax
  year boundary avoids this entirely.
- The YTD data it needs already exists (`ytdByEmployee` in `Payroll.tsx`).

## 2. Browser testing — never done

The previous environment's egress proxy refused `ops.kdsquares.com` and
`supabase.com` (403 on CONNECT), so no screen was ever seen. **If this session
still cannot reach them, say so immediately rather than working around it** —
the fix is the environment's network policy, and it only takes effect in a new
session.

Automated cover that DOES exist: `playwright.yml` (workflow_dispatch) ran 88
tests against the live app, all payroll ones passing. That proves screens load.
It does not prove the redesign is understandable.

Still to do, all of it by hand in a browser:

- [ ] Dashboard: load, then filter All companies / KD Squares / NDI and confirm
      every figure changes with the filter (the burn total, "On payroll", the
      runs list).
- [ ] Open an existing completed run — confirm historical runs still render.
- [ ] Open a payslip; use **Save as PDF** in the preview dialog (new) and check
      the PDF is A4, has selectable text, and keeps the coloured net-pay band.
- [ ] Wizard step 1: pick company → pay group → period. Check the pay-group
      cards show headcount and "about ₦X gross a month".
- [ ] Wizard step 2: the needs-attention / ready-to-pay split, the search box,
      and that excluded people stay behind the disclosure.
- [ ] Wizard step 3: totals, then Back → Back → forward, confirming selections
      survive.
- [ ] Run the same for NDI.
- [ ] Responsive at 1440, 768 and 375 px: dashboard, wizard, payslip.
- [ ] Edge cases: a pay group with nobody in it; everyone needing attention;
      a duplicate run for a period that already has one (should warn); the
      empty state for a company with no runs.

## 3. The review loop (brief Phase 8) — never done

For each screen ask: would a non-technical HR person know what to do; does it
look as good as Deel or Gusto; can it be done in fewer clicks; if it goes wrong
does the user know what to do; is there anything that makes them smile. Fix,
commit, repeat. This needs eyes on the screens, which is why it is still open.

## 4. Smaller things left

- **Bulk salary adjustments** ("give everyone in Staff a 10% raise") — not
  built. Handle with care: it is a mass write to the field payroll is computed
  from.
- Employee self-service payslip history already exists in `src/pages/Profile.tsx`.
- A payslip QR code was deliberately dropped: there is no employee-facing
  payslip route for it to point at. Only worth doing if one is built.
- Two ideas worth stealing from SeamlessHR (see the standards reference,
  Part D): approving from an emailed link without logging in, and freezing the
  approver set once a run is submitted.

## Do not re-fix these — they were checked and are correct

Each looked wrong at a glance and is not. The reasoning is in
`docs/payroll-standards-reference.md`, Part C.

| Thing | Why it looks wrong, why it is right |
|---|---|
| PAYE bands | Stored as band **widths**, not cumulative ceilings. Several published summaries put the 18%/21% boundary at ₦10m; the statute's "next ₦9,000,000" wording gives ₦12m, which is what the code has. Moving it changes PAYE for the highest earners only. |
| Rent relief | ₦500,000 cap is correct (s.30(2)(a)(vi)). One source says ₦200,000. |
| Minimum tax | Correctly absent — abolished by NTA 2025. |
| Pension 8%/10%, NHF 2.5% of basic, NSITF 1%, ITF 1%, NHIS 5%/10% | All verified. PenCom's 2026 rate review is not in force. |

## Money safety rules — unchanged

- Never trigger a real disbursement, and never call a payment API with real data.
- Never modify a `paid` run or historical payroll data.
- **Do not dispatch `payroll-live-verification.yml`.** Its own header says it
  mutates real production payroll data, and it drives draft → submit →
  **approve**. `playwright.yml` and `payroll-screenshot.yml` are the read-only
  ones.
- Creating draft runs for testing is fine.
