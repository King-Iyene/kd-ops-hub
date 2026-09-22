-- Fix NDI finance RLS policies: use profiles.role lookup (matching every other
-- table in the project) instead of auth.jwt() ->> 'user_role' which doesn't
-- exist in the JWT claims.

-- Helper: reusable admin check matching the rest of the codebase
CREATE OR REPLACE FUNCTION public.is_ndi_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
  );
$$;

-- ndi_dedicated_account
DROP POLICY IF EXISTS "ndi_dedicated_account_admin_read" ON ndi_dedicated_account;
CREATE POLICY "ndi_dedicated_account_admin_read"
  ON ndi_dedicated_account FOR SELECT TO authenticated
  USING (public.is_ndi_admin());

DROP POLICY IF EXISTS "ndi_dedicated_account_admin_write" ON ndi_dedicated_account;
CREATE POLICY "ndi_dedicated_account_admin_write"
  ON ndi_dedicated_account FOR ALL TO authenticated
  USING (public.is_ndi_admin())
  WITH CHECK (public.is_ndi_admin());

-- ndi_wallet_ledger
DROP POLICY IF EXISTS "ndi_wallet_ledger_admin_read" ON ndi_wallet_ledger;
CREATE POLICY "ndi_wallet_ledger_admin_read"
  ON ndi_wallet_ledger FOR SELECT TO authenticated
  USING (public.is_ndi_admin());

DROP POLICY IF EXISTS "ndi_wallet_ledger_admin_insert" ON ndi_wallet_ledger;
CREATE POLICY "ndi_wallet_ledger_admin_insert"
  ON ndi_wallet_ledger FOR INSERT TO authenticated
  WITH CHECK (public.is_ndi_admin());

-- ndi_beneficiaries
DROP POLICY IF EXISTS "ndi_beneficiaries_admin_all" ON ndi_beneficiaries;
CREATE POLICY "ndi_beneficiaries_admin_all"
  ON ndi_beneficiaries FOR ALL TO authenticated
  USING (public.is_ndi_admin())
  WITH CHECK (public.is_ndi_admin());

-- ndi_transfers
DROP POLICY IF EXISTS "ndi_transfers_admin_read" ON ndi_transfers;
CREATE POLICY "ndi_transfers_admin_read"
  ON ndi_transfers FOR SELECT TO authenticated
  USING (public.is_ndi_admin());

DROP POLICY IF EXISTS "ndi_transfers_admin_insert" ON ndi_transfers;
CREATE POLICY "ndi_transfers_admin_insert"
  ON ndi_transfers FOR INSERT TO authenticated
  WITH CHECK (public.is_ndi_admin());

DROP POLICY IF EXISTS "ndi_transfers_admin_update" ON ndi_transfers;
CREATE POLICY "ndi_transfers_admin_update"
  ON ndi_transfers FOR UPDATE TO authenticated
  USING (public.is_ndi_admin())
  WITH CHECK (public.is_ndi_admin());
