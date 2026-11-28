# Auto-population prompts (DRAFT, nothing is created or scheduled)

Two separate routines. Both write straight into the live **KDS Finances** base through the KDOps REST API with a dedicated key. Neither uses Slack or any messaging channel; each reports in its own run summary.

Lines marked **[ASSUMPTION]** are my reading of what you said. Lines marked **[FILL IN]** need your answer before the routine can be created.

---

## Shared rules (put at the top of both prompts)

```
You keep the KDS Finances base current from bank emails. Work only from the emails and
tools named below. Never guess an amount, a date or a client: if anything is unclear,
skip that item and list it under "Needs attention" in your run summary.

MAIL ACCESS
- Read-only: list and get messages only. Never trash, delete, move, mark or send anything.
- Page the most recent messages and filter by sender and subject yourself.
- Never open, copy or store sign-in links, one-time codes, password resets or any other
  security email. Ignore marketing. Ignore Kuda completely (not a tracked account).
- Mailbox clock is America/Toronto; the business is in Africa/Lagos. Use Lagos dates.

WRITING
- Use only the KDS Finances base, with the API key you were given. Use the exact field
  names. Never create a new column or table. Never delete or overwrite a row that a
  person edited.
- Before adding a row, search for the email's message id in the row's Notes
  ("msg:<id>"). If it is there, skip it. Write "msg:<id>" into Notes on every row you add.
- Add at most 40 rows per run. If more are waiting, do the oldest 40 and say how many remain.
- Run daily at 07:00 Africa/Lagos and look back 3 days, so a missed run catches up.

REPORT (the run summary, nothing else)
- Counts: added, updated, skipped as duplicate, skipped on purpose, needs attention.
- One line per added or updated row: table, date, amount, client or category.
- Under "Needs attention": every item you could not place, with the email date and sender
  (no account numbers, no balances).
```

---

## 1. DEBIT routine (Expenses)

Money going out. Tracks **two accounts only**.

| Account | Where its emails arrive | Tracked |
|---|---|---|
| **Moniepoint** (KD SQUARES LTD, NGN) | king@kdsquares.com inbox ("Debit alert!") **[ASSUMPTION: this is what you meant by "Moniepoint is king@"]** | Yes |
| **Raenest** (USD) | code@kdsquares.com shared mailbox **[ASSUMPTION: "Raenest is code@"]** | Yes |
| Access, FCMB, Payoneer, Kuda | n/a | **No** (their debits are moving money, not expenses) |

**Moniepoint: track every debit, including transfers to a KDS account** (your correction).

**Raenest: never track a debit that is a transfer to a KDS account** (KD Squares Ltd, the KDS Moniepoint account, "Kd Squares One Card" funding, wallet top-ups, currency conversions). That money has not left the business and is already counted where it lands, so tracking it would count it twice. Also skip, on both accounts, reversed or failed payments, and Raenest items that are not card payments to a tool or web service.

```
DEBIT ROUTINE

Add one Expenses row for each real expense found in these emails.

1. MONIEPOINT (king@ inbox): messages titled "Debit alert!" for KD SQUARES LTD.
   - Read amount, date and the narration (who was paid).
   - Track EVERY debit, including a transfer to a KDS account. Do not skip it. If the
     narration shows a transfer to a KDS account, choose its Category from
     [FILL IN: the category a Moniepoint-to-KDS transfer belongs under]; until that is
     filled in, add the row with Category empty and list it under "Needs attention".
   - Cost = the debited amount in NGN. The alert does not show the transfer fee, VAT or
     stamp duty, so totals run slightly under the bank statement; note this in the summary.

2. RAENEST (code@ shared mailbox): card-payment notifications, if any arrive.
   - Count only card payments to tools and web services (for example Anthropic, Google,
     GoDaddy, Canva, HighLevel, Supabase, Vercel, Replit, n8n).
   - SKIP any transfer to a KDS account (Kd Squares Ltd, the KDS Moniepoint account),
     card funding ("Kd Squares One Card"), conversions, wallet credits and reversals. These
     are internal moves and would be counted twice.
   - Raenest does not currently email card payments. If none arrive, say "no Raenest card
     alerts this run" in the summary and do nothing for Raenest.
   - When rows are made, follow the existing weekly convention: one row per Monday-to-Sunday
     week, dated the Sunday, Notes "Raenest  Expenses for 28 Sep-4 Oct ($121.21)" (two spaces
     after Raenest, two decimals), Cost = USD total x that week's weighted-average USD->NGN
     transfer rate (one decimal), Category "Utilities & Bills".

FIELDS on each new Expenses row
- Cost: the NGN amount. Date: the transaction date (Lagos).
- Category: the first matching rule below; if none matches, leave Category empty and list the
  item under "Needs attention". [FILL IN: category rules, for example
  "narration contains X -> Category Y".]
- Notes: a short description (payee, what for) and "msg:<id>".
- Paid/Done: checked.
- Do not write Month, Employee, Planner or Profit (link fields).
```

**Check once a week (in the summary):** previous Moniepoint balance + credits - latest balance should equal the money out. If the gap is more than fees and VAT can explain, say so.

---

## 2. CREDIT routine (Income)

Money coming in. Tracks **four accounts**.

| Account | Currency | Where its emails arrive | Notes |
|---|---|---|---|
| **Raenest** | USD | code@ ("You made a transfer of N USD" for transfers; credits unconfirmed) | main USD income account |
| **Access Bank** | USD | code@ ("AccessAlert Transaction Alert [Credit: ...]", monthly statements) | receives USD income |
| **FCMB** | NGN | code@ ("Credit Alert", ebusiness@fcmb.com) | naira income, plus converted money from Access |
| **Payoneer** | USD | code@kdsquares.com shared mailbox (it is the code@ account) **[your correction]**; payment notices ("You have received a payment" style) | when I last looked (22 Nov) code@ held only Payoneer marketing and no payment notices, so confirm Payoneer email notifications are switched on |

**The complication: different clients pay into different accounts.** The routine decides what a credit is by who paid, not by which account it landed in.

```
CREDIT ROUTINE

Record client payments as Income. Decide what each credit is BEFORE writing anything.

STEP 1: classify every credit
 a. CLIENT PAYMENT: the narration or sender matches a client in the table below.
    -> this is income.
 b. OWN MONEY MOVING: a conversion, a transfer from Access or Raenest, a transfer from a
    KDS or director account, wallet funding, a refund or reversal.
    -> NOT income (it was counted when the client paid). Do not add a row.
    -> It may supply the naira amount for the matching USD income row (see STEP 3).
 c. UNKNOWN: anything else -> "Needs attention", write nothing.

STEP 2: match the client payment to a row
 - Income rows are mostly pre-made as Record Type "Template" (one per client per month and
   period "1st" or "2nd"), waiting for the real payment.
 - Find the Template row for the same Client, the month of the payment date and the
   nearest Month Period. If found: UPDATE it: Record Type "Actual", Payment Status "Paid",
   Date Paid = payment date, Total Income (USD) or (NGN) = the amount received (USD
   payments fill USD, naira payments fill NGN). Only fill empty fields; never change a
   value a person already entered.
 - If there is no matching Template row: ADD a new row, Record Type "Actual", Payment
   Status "Paid", with the same fields, Revenue Type from the client's usual type, and
   list it under "Needs attention" so a person can check the month and period.

STEP 3: naira side of a USD payment
 - When a conversion credit arrives (usually in FCMB) that clearly matches a USD client
   payment received earlier (same week, amount in the expected range), write it into
   Total Income (NGN) on that USD row only. "FX Rate (Actual)" is a formula and fills
   itself once both amounts are present.

NEVER mark a row Actual from a Template without an email that proves the payment.

CLIENT -> ACCOUNT TABLE  [FILL IN the Account column; add the narration text to look for]
 Client                 Account paid into            Currency   Narration / sender to look for
 Relentless             [FILL IN]                    [FILL IN]  [FILL IN]
 Relentless (Nina)      [FILL IN]
 Relentless (Faith)     [FILL IN]
 Relentless (Denzel)    [FILL IN]
 Extendly               [FILL IN]
 HL Pro (Howells)       [FILL IN]
 HL Pro (Bright)        [FILL IN]
 Otherside              [FILL IN]
 Careershift            [FILL IN]
 BBP                    [FILL IN]
 Melissa                [FILL IN]
 (any other client)     [FILL IN]
```

**Clients with Template rows or recent payments today** (from the Income table): Relentless (52 rows) and its sub-clients Nina, Faith and Denzel; Extendly; HL Pro (Howells); HL Pro (Bright); Otherside; Careershift; BBP; Melissa. Older clients (BTP, GTE, Cause Life, Health Secret and others) have no Actual rows since 2025 and are left out.

---

## What is done and what is still needed

Done:
1. **Links.** The REST API now writes link fields (Month and the others) and runs the Expense -> Profit and Income -> Profit automations on API writes (PR 399).
2. **Key safety.** The key table is closed to the public and a key can be limited to one base (PR 400). The routines use one key limited to KDS Finances, with record read and write only.

Still needed from you:
1. Create the key (Database module, KDS Finances, Integrations, API Keys), then put it in the routine's secret settings (never in GitHub).
2. **Client to account table** for the income routine (above).
3. **Moniepoint category rules** and the category for a Moniepoint-to-KDS transfer.
4. **Raenest card-payment emails** and **Payoneer payment notices** switched on (Raenest does not email card payments today; Payoneer sent only marketing to code@ on 22 Nov).
5. Moniepoint alerts live in king@'s inbox: allow that mailbox for the routine, or move the alert email to code@.
