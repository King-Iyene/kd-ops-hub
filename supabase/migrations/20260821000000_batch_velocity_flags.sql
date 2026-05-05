-- =============================================================================
-- Batch velocity flags — automated fraud / anomaly detection
--
-- Adds:
--   get_batch_velocity_flags(p_batch_id uuid) RPC
--     Returns a list of flags surfaced on the approval screen and
--     pre-disbursement summary. Soft warnings only — never auto-blocks.
--
-- Flag types:
--   total_change         — total amount differs from prior batch by > 15%
--   headcount_change     — beneficiary count differs from prior batch by > 10%
--   duplicate_account    — same account number appears more than once in batch
--   recent_bank_change   — a beneficiary's bank account was changed in last 48h
--   new_employee         — beneficiary's profile was created less than 5 days ago
--   high_amount          — any single payment is greater than 3x its beneficiary's average
--                          across prior batches in the same workspace
--
-- All flags are advisory; the approver acknowledges them in the UI before
-- proceeding. Admin/super_admin self-approval is unaffected — these are signals,
-- not gates.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_batch_velocity_flags(p_batch_id uuid)
RETURNS TABLE (
  flag_type   text,
  severity    text,        -- 'low' | 'medium' | 'high'
  message     text,
  details     jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_batch         public.payment_batches;
  v_prev_batch    public.payment_batches;
  v_total_pct     numeric;
  v_count_pct     numeric;
BEGIN
  SELECT * INTO v_batch FROM public.payment_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RETURN;  -- no rows for missing batch
  END IF;

  -- ── Find the previous successfully-completed batch from the same creator ──
  SELECT * INTO v_prev_batch
    FROM public.payment_batches
   WHERE created_by = v_batch.created_by
     AND id <> p_batch_id
     AND status IN ('approved','funded','processing','processed','partially_processed')
   ORDER BY created_at DESC
   LIMIT 1;

  -- ── Flag 1: total amount % change ─────────────────────────────────────────
  IF FOUND AND COALESCE(v_prev_batch.total_amount, 0) > 0 THEN
    v_total_pct := ROUND(
      ABS(v_batch.total_amount - v_prev_batch.total_amount) / v_prev_batch.total_amount * 100,
      1
    );
    IF v_total_pct > 15 THEN
      flag_type := 'total_change';
      severity  := CASE WHEN v_total_pct > 30 THEN 'high' ELSE 'medium' END;
      message   := format(
        'Total amount %s by %s%% from previous batch (₦%s → ₦%s)',
        CASE WHEN v_batch.total_amount > v_prev_batch.total_amount THEN 'increased' ELSE 'decreased' END,
        v_total_pct,
        to_char(v_prev_batch.total_amount, 'FM999,999,999,999'),
        to_char(v_batch.total_amount,      'FM999,999,999,999')
      );
      details := jsonb_build_object(
        'pct',          v_total_pct,
        'previous',     v_prev_batch.total_amount,
        'current',      v_batch.total_amount,
        'previous_id',  v_prev_batch.id
      );
      RETURN NEXT;
    END IF;

    -- ── Flag 2: headcount % change ──────────────────────────────────────────
    IF COALESCE(v_prev_batch.beneficiary_count, 0) > 0 THEN
      v_count_pct := ROUND(
        ABS(v_batch.beneficiary_count - v_prev_batch.beneficiary_count)::numeric
          / v_prev_batch.beneficiary_count * 100,
        1
      );
      IF v_count_pct > 10 THEN
        flag_type := 'headcount_change';
        severity  := CASE WHEN v_count_pct > 20 THEN 'high' ELSE 'medium' END;
        message   := format(
          'Beneficiary count %s by %s%% from previous batch (%s → %s)',
          CASE WHEN v_batch.beneficiary_count > v_prev_batch.beneficiary_count THEN 'increased' ELSE 'decreased' END,
          v_count_pct,
          v_prev_batch.beneficiary_count,
          v_batch.beneficiary_count
        );
        details := jsonb_build_object(
          'pct',         v_count_pct,
          'previous',    v_prev_batch.beneficiary_count,
          'current',     v_batch.beneficiary_count,
          'previous_id', v_prev_batch.id
        );
        RETURN NEXT;
      END IF;
    END IF;
  END IF;

  -- ── Flag 3: duplicate account numbers within this batch ───────────────────
  FOR flag_type, severity, message, details IN
    SELECT
      'duplicate_account'::text,
      'high'::text,
      format(
        '%s beneficiaries share the same account number (****%s) — review for ghost-employee fraud',
        cnt,
        right(account_number, 4)
      ),
      jsonb_build_object(
        'account_mask',  '****' || right(account_number, 4),
        'occurrences',   cnt,
        'beneficiaries', names
      )
    FROM (
      SELECT
        account_number,
        count(*) AS cnt,
        jsonb_agg(full_name ORDER BY full_name) AS names
      FROM public.batch_items
      WHERE batch_id = p_batch_id
        AND account_number IS NOT NULL
        AND account_number <> ''
      GROUP BY account_number
      HAVING count(*) > 1
    ) dups
  LOOP
    RETURN NEXT;
  END LOOP;

  -- ── Flag 4: recent bank-account changes among beneficiaries ───────────────
  -- Match batch_items to profiles via account_number to find which payees
  -- recently had their bank account modified on their profile.
  FOR flag_type, severity, message, details IN
    SELECT
      'recent_bank_change'::text,
      'high'::text,
      format(
        '%s''s bank account was changed %s hours ago — within 48h cooling-off window',
        p.full_name,
        ROUND(EXTRACT(EPOCH FROM (now() - p.bank_account_modified_at)) / 3600, 1)
      ),
      jsonb_build_object(
        'user_id',      p.id,
        'full_name',    p.full_name,
        'modified_at',  p.bank_account_modified_at,
        'hours_ago',    ROUND(EXTRACT(EPOCH FROM (now() - p.bank_account_modified_at)) / 3600, 1)
      )
    FROM public.batch_items bi
    JOIN public.profiles p
      ON p.bank_account_number = bi.account_number
     AND COALESCE(p.bank_name, '') = COALESCE(bi.bank_name, '')
    WHERE bi.batch_id = p_batch_id
      AND p.bank_account_modified_at IS NOT NULL
      AND p.bank_account_modified_at > now() - interval '48 hours'
  LOOP
    RETURN NEXT;
  END LOOP;

  -- ── Flag 5: newly-created employee profiles (under 5 days old) ────────────
  FOR flag_type, severity, message, details IN
    SELECT
      'new_employee'::text,
      'medium'::text,
      format(
        '%s was added %s days ago — review before payroll inclusion',
        p.full_name,
        ROUND(EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400, 1)
      ),
      jsonb_build_object(
        'user_id',     p.id,
        'full_name',   p.full_name,
        'created_at',  p.created_at,
        'days_old',    ROUND(EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400, 1)
      )
    FROM public.batch_items bi
    JOIN public.profiles p
      ON p.bank_account_number = bi.account_number
     AND COALESCE(p.bank_name, '') = COALESCE(bi.bank_name, '')
    WHERE bi.batch_id = p_batch_id
      AND p.created_at > now() - interval '5 days'
  LOOP
    RETURN NEXT;
  END LOOP;

  -- ── Flag 6: any payment > 3x the beneficiary's historical average ────────
  -- Compare each batch_item against the average of past completed payments
  -- to the same account_number.
  FOR flag_type, severity, message, details IN
    SELECT
      'high_amount'::text,
      'medium'::text,
      format(
        '%s''s payment (₦%s) is %sx their historical average (₦%s)',
        bi.full_name,
        to_char(bi.amount_ngn, 'FM999,999,999,999'),
        ROUND(bi.amount_ngn / NULLIF(avg_amount, 0), 1),
        to_char(avg_amount, 'FM999,999,999,999')
      ),
      jsonb_build_object(
        'beneficiary',   bi.full_name,
        'account_mask',  '****' || right(bi.account_number, 4),
        'current',       bi.amount_ngn,
        'average',       avg_amount,
        'multiplier',    ROUND(bi.amount_ngn / NULLIF(avg_amount, 0), 1)
      )
    FROM public.batch_items bi
    JOIN LATERAL (
      SELECT AVG(prior.amount_ngn)::numeric AS avg_amount
        FROM public.batch_items prior
        JOIN public.payment_batches pb ON pb.id = prior.batch_id
       WHERE prior.account_number = bi.account_number
         AND prior.batch_id <> p_batch_id
         AND pb.status IN ('processed','partially_processed','funded')
    ) hist ON true
    WHERE bi.batch_id = p_batch_id
      AND avg_amount IS NOT NULL
      AND avg_amount > 0
      AND bi.amount_ngn > avg_amount * 3
  LOOP
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_batch_velocity_flags IS
  'Returns automated fraud/anomaly flags for a payment batch (compared to '
  'prior batch from the same creator and to historical per-beneficiary norms). '
  'Soft warnings only — never auto-blocks. The approval UI surfaces these and '
  'requires explicit acknowledgement before proceeding.';

REVOKE EXECUTE ON FUNCTION public.get_batch_velocity_flags(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_batch_velocity_flags(uuid)
  TO authenticated, service_role;
