-- =============================================================================
-- One-off backfill: link existing batch_items to the right contractor / employee.
--
-- QuickPay (and any earlier path that didn't set the link at insert time) left
-- batch_items.contractor_id / employee_id NULL, so a partner's Payments tab
-- read "No payments" even when money had moved to them. Match by cleaned
-- account number (digits only) — a Nigerian NUBAN belongs to exactly one
-- party, so this is a strong key.
--
-- Safety rules:
--   • Only rows where contractor_id AND employee_id are currently NULL get
--     touched.
--   • Only matches where exactly ONE candidate is found are applied — any
--     ambiguous account (≥2 matches) is left alone so we never assign the
--     wrong owner. Operators can resolve those by hand.
--   • Empty / whitespace-only account numbers are excluded.
--   • Soft-deleted contractors are excluded.
--   • Only contractor_id / employee_id are written; the batch_items state
--     machine only fires on status change so this update is a no-op for it,
--     and the payload-lock trigger only protects amount/account/bank/name —
--     not the link columns — so the run is allowed at any batch status.
--
-- Idempotent: re-running matches nothing new (already-set rows are skipped,
-- and from now on QuickPay sets the link at insert time anyway).
-- =============================================================================

DO $$
DECLARE
  v_contractor_links int;
  v_employee_links   int;
BEGIN
  -- ── 1. Contractor backfill ────────────────────────────────────────────────
  WITH candidates AS (
    SELECT
      bi.id AS item_id,
      c.id  AS contractor_id,
      count(*) OVER (PARTITION BY bi.id) AS match_count
    FROM public.batch_items bi
    JOIN public.contractors c
      ON regexp_replace(coalesce(bi.account_number, ''), '\D', '', 'g')
       = regexp_replace(coalesce(c.account_number,  ''), '\D', '', 'g')
    WHERE bi.contractor_id IS NULL
      AND bi.employee_id   IS NULL
      AND regexp_replace(coalesce(bi.account_number, ''), '\D', '', 'g') <> ''
      AND c.deleted_at IS NULL
  ),
  unique_matches AS (
    SELECT DISTINCT item_id, contractor_id
      FROM candidates
     WHERE match_count = 1
  ),
  updated AS (
    UPDATE public.batch_items bi
       SET contractor_id = m.contractor_id
      FROM unique_matches m
     WHERE bi.id = m.item_id
    RETURNING bi.id
  )
  SELECT count(*) INTO v_contractor_links FROM updated;

  -- ── 2. Employee backfill (rows still unlinked after step 1) ──────────────
  WITH candidates AS (
    SELECT
      bi.id AS item_id,
      p.id  AS employee_id,
      count(*) OVER (PARTITION BY bi.id) AS match_count
    FROM public.batch_items bi
    JOIN public.profiles p
      ON regexp_replace(coalesce(bi.account_number,     ''), '\D', '', 'g')
       = regexp_replace(coalesce(p.bank_account_number, ''), '\D', '', 'g')
    WHERE bi.contractor_id IS NULL
      AND bi.employee_id   IS NULL
      AND regexp_replace(coalesce(bi.account_number, ''), '\D', '', 'g') <> ''
  ),
  unique_matches AS (
    SELECT DISTINCT item_id, employee_id
      FROM candidates
     WHERE match_count = 1
  ),
  updated AS (
    UPDATE public.batch_items bi
       SET employee_id = m.employee_id
      FROM unique_matches m
     WHERE bi.id = m.item_id
    RETURNING bi.id
  )
  SELECT count(*) INTO v_employee_links FROM updated;

  RAISE NOTICE '[backfill] batch_items linked: % contractor rows, % employee rows',
    v_contractor_links, v_employee_links;
END $$;
