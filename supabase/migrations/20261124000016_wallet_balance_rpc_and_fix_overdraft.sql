-- Fix: the overdraft trigger referenced a non-existent wallet_id column
-- and checked for negative amount_ngn, but the table uses direction + positive amounts.
-- Also add a principal_wallet_balance() RPC for server-side sufficiency checks.

-- 1. Balance RPC (org-wide, no parameters)
CREATE OR REPLACE FUNCTION public.principal_wallet_balance()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN direction = 'credit' THEN amount_ngn ELSE -amount_ngn END
  ), 0)
  FROM public.principal_wallet_ledger;
$$;

REVOKE EXECUTE ON FUNCTION public.principal_wallet_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.principal_wallet_balance() TO authenticated, service_role;

-- 2. Fix overdraft trigger to use direction-based logic
CREATE OR REPLACE FUNCTION public.enforce_principal_wallet_no_overdraft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF NEW.direction <> 'debit' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('principal_wallet_balance'));

  SELECT COALESCE(SUM(
    CASE WHEN direction = 'credit' THEN amount_ngn ELSE -amount_ngn END
  ), 0) - NEW.amount_ngn
    INTO v_balance
    FROM public.principal_wallet_ledger;

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Requested: %',
      v_balance + NEW.amount_ngn, NEW.amount_ngn
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
