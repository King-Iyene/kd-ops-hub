# Security backlog — KD Ops Hub

Open security items found during the system audit, saved for future hardening
work. Each entry has a plain-English summary, the technical detail, the risk,
and the recommended fix. Nothing here is an active breach — they are hardening
gaps and "do this properly" items on a live money platform.

_Last reviewed: 2026-05-26._

> Note on risk language: "live money path" = code that moves real funds via
> Paystack (payment batches, payroll). Changes there must be tested before they
> ship, ideally on a Supabase Pro preview branch with **Paystack test keys**.

---

## HIGH

### S1 — `payroll-scheduler` edge function is unauthenticated
- **Plain English:** A background robot auto-creates draft payroll runs. Its
  "door" has no lock — anyone who knows its URL could trigger it (spam draft
  payrolls, flood Finance with notifications). It does **not** move money
  itself (drafts only).
- **Technical:** `supabase/functions/payroll-scheduler/index.ts` is deployed
  `--no-verify-jwt` and performs no cron-secret / role check before calling
  `schedule_auto_draft` and inserting notifications.
- **Risk:** Unauthenticated write + notification spam (DoS-ish). No direct fund
  movement.
- **Fix:** Require a shared secret, e.g. compare an `x-cron-secret` header to a
  `CRON_SHARED_SECRET` env var (the pattern `batch-worker` uses), and reject
  otherwise. **Care:** confirm how the live cron currently invokes this function
  (it documents an `Authorization: Bearer <service_role>` header) so the lock
  doesn't break automated drafting — accept that method too, or update the cron
  job in the same change.

---

## MEDIUM

### S2 — Tamper-evident audit chain does not seal the `description` field
- **Plain English:** The audit log is built so history can't be secretly
  rewritten — each entry is cryptographically sealed. But the seal currently
  covers who / when / what-action, **not** the human-readable `description`
  (which holds the money detail, e.g. "paid ₦1,000,000 to X"). Someone with DB
  access could edit a description ("₦1,000,000" → "₦1,000") and the tamper check
  wouldn't notice.
- **Technical:** `supabase/migrations/20260824000000_fix_hash_chain_digest.sql`
  hashes `prev_hash || id || action_type || performed_by || created_at` only.
  `audit_logs.description` is excluded. (A separate immutability trigger still
  blocks edits, so this is defence-in-depth, not the only protection.)
- **Risk:** "Tamper-evident" is overstated for the field holding the financial
  narrative.
- **Fix:** Include `description` (and any amount/entity columns) in the hashed
  payload. **Care:** existing rows were hashed the old way, so the new hash must
  not retroactively invalidate them — either re-hash from a checkpoint or have
  `verify_audit_chain()` handle both old and new formats.

### S3 — Bank account numbers stored in plaintext alongside encrypted columns
- **Plain English:** Account numbers are saved as plain readable text **and** as
  an encrypted copy — so the encryption is only half-done. Anyone with DB access
  (or a leak) can still read every account number.
- **Technical:** `supabase/migrations/20260428000001_encrypt_account_numbers.sql`
  added `*_enc` columns but kept the plaintext columns. `select('*')` on
  `contractors` / `batch_items` still returns full NUBANs.
- **Risk:** PII-at-rest exposure; weakens the NDPR posture the encryption was
  meant to provide.
- **Fix:** Migrate all reads to the decrypt RPC / `*_enc` columns, stop using
  `select('*')` on these tables, then **drop the plaintext columns**.
  **Care:** dropping columns is irreversible — verify *nothing* reads the
  plaintext first, or payments break.

---

## LOW

### S4 — `list_banks` / `resolve_account` are unauthenticated and unthrottled
- **Plain English:** The "look up a bank account name" feature can be called by
  anyone, as many times as they like.
- **Technical:** `supabase/functions/paystack-transfer/index.ts` allows the
  `list_banks` and `resolve_account` actions without auth and with no rate
  limit.
- **Risk:** Account-name enumeration and Paystack quota abuse.
- **Fix:** Add IP/user rate limiting. Doing it properly needs a shared store
  (a small DB table or KV) since edge functions are stateless — a per-instance
  in-memory limiter is weak.

### S5 — Verify early `USING (true)` RLS policies were superseded in production
- **Plain English:** A few old database access rules were briefly wide-open and
  later tightened by newer migrations. Confirm the tightened versions are the
  ones actually live.
- **Technical:** e.g. `employee_deductions` (`20260425120000`) and several
  phase-4 tables shipped `FOR ALL USING (true)`, later restricted by
  `20260616000000_phase1_security_and_missing_tables.sql`. The empty
  migration-history baseline (now fixed) had made this hard to confirm.
- **Risk:** If a "fix" migration didn't apply, an open policy could persist.
- **Fix:** Query live `pg_policies` (a read-only check workflow can dump this)
  and confirm no `qual = 'true'` policy remains on a sensitive table.

---

## Already fixed (for context)
These came out of the same audit and are **done / live**:
- 429 rate-limit retry with backoff on all Paystack calls.
- DB-level idempotency: unique index on `batch_items.paystack_reference`.
- Soft-deleted/anonymised records excluded from all lists, KPIs, reports, and
  the Communications email recipient list (privacy).
- Webhook HMAC verification, atomic idempotent webhook RPC, server-side role
  re-checks, server-enforced transfer caps — verified already correct.

## Deferred to a staging environment (Supabase Pro preview branch)
- **C1 core** — "claim-before-send" lease + single dispatcher (the structural
  double-pay prevention beyond the index backstop).
- `bulkTransfer` batching + `batch-worker` concurrency tuning.

These rewrite the live payment loop and must be exercised against the 6-scenario
test matrix (double-click, mid-send crash, watchdog overlap, retry, two admins,
normal) with Paystack **test** keys before touching production.
