# Expense job (Debit) - final spec

Runs INSIDE Supabase (edge function `expense-sync` + pg_cron). No Slack, no messages, no outside API key.
Schedule: daily 23:59 Africa/Lagos = 22:59 UTC (`59 22 * * *`). Looks back 3 days. Dates are Lagos dates.
First 3 days: DRY RUN (lists what it would add, writes nothing) until the owner approves.

## Reads
- Moniepoint "Debit alert!" emails (king@ mailbox): every debit, INCLUDING transfers to a KDS account.
- Raenest card payments (code@ mailbox), only if Raenest sends them: tools and web services only.
  SKIP transfers to a KDS account, card funding, conversions, wallet credits, reversals (double counting).
- Never read or store sign-in codes, passwords, security emails, marketing. Ignore Kuda, Access, FCMB, Payoneer debits.

## Writes (Expenses table only)
- One row per payment, dated the day the payment happened.
- Cost (NGN), Date, Category, Notes, Paid/Done ticked, Month link. Never Employee, Planner or Profit.
- Moniepoint Notes: `<payee / narration> msg:<id>`. Alerts omit fees, VAT and stamp duty, so totals run slightly under the statement.
- Raenest Notes: `Raenest  <payee> ($20.00 @ ₦1,495.0/$ <rate source>) msg:<id>`
  (two spaces after Raenest, dollars 2 decimals, rate 1 decimal). Cost = USD x rate.

## Category
1. Read the live options of the Category dropdown.
2. First matching row in `bank_rules` (narration text -> category) whose option exists wins.
3. No match: "Utilities & Bills", Notes gets "auto-category", row listed as "defaulted".
4. Never create a new option. Moniepoint-to-KDS transfers use their own category [FILL IN].

## USD -> NGN rate (Raenest rows)
1. Owner's own USD->NGN conversion rate: weighted average of conversions on or before the payment date, within 7 days.
2. Else parallel-market average: collect several sources daily, drop outliers, average. Store every source and the average in `fx_rates`. Notes say "parallel avg of N".
3. Else fallback: the mid-market ("Google") rate from a free public feed. Notes say "mid-market".
4. Else the last saved rate, Notes "rate carried over", row in "needs attention".

## Safety
- Skip any email whose `msg:<id>` is already in Notes. At most 40 rows per run.
- Never delete or overwrite a row a person edited. Unclear items are left alone and listed under "needs attention".
- Only these tables are touched: Expenses (write), `bank_rules`, `fx_rates`, `bank_email_runs`. Super-admin access only.

## Report (the Runs page in KDOps, nothing else)
Counts: added, skipped as duplicate, skipped on purpose, defaulted, needs attention. One line per row (table, date, amount, category).
No account numbers or balances. Weekly: Moniepoint previous balance + credits - latest balance should equal money out.

## Still needed from the owner
- Moniepoint category rules and the category for Moniepoint-to-KDS transfers.
- Raenest card-payment emails to code@ (or the weekly statement as input).
- Allow the king@ mailbox for the job.
