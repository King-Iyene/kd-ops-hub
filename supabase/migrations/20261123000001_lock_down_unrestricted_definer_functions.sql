-- Three SECURITY DEFINER functions were reachable by anyone with the public
-- anon key, with no caller check — found in a forensic RLS/function audit.
-- Postgres grants EXECUTE to PUBLIC by default on function creation; each of
-- these was created (or overloaded) without the explicit REVOKE the rest of
-- this codebase consistently applies to privileged functions, so the
-- default grant was never closed.
--
-- 1. credit_principal_wallet(...,p_customer_code) — a second overload added
--    to fix a matching bug, but the REVOKE applied to the original 4-arg
--    version doesn't carry over to a new overload (distinct function object
--    in Postgres). Left open, ANY authenticated (and even anon) caller could
--    invoke it directly via PostgREST RPC and credit the Principal
--    Disbursements wallet ledger with an arbitrary amount against any
--    registered DVA account/customer code — a direct funds-fabrication path
--    with no Paystack charge required. Only paystack-webhook (running as
--    service_role, which bypasses function grants) calls this — no GRANT
--    back to authenticated/anon is needed, matching the sibling overload.
--
-- 2. schedule_auto_draft() — only ever called by the payroll-scheduler edge
--    function (service_role). GRANT ... TO service_role was applied when it
--    was created, but the default PUBLIC grant was never revoked, so any
--    authenticated (and anon) caller could force early auto-drafting of
--    payroll runs outside the intended cron cadence.
--
-- 3. soft_delete_contractor(uuid) — called directly from the browser
--    (ContractorProfile.tsx), so authenticated access is legitimate, but the
--    function itself never checked the caller's role even though the UI
--    only exposes the "permanently delete" action to super_admin. Any
--    logged-in user (driver, contractor, field staff) could anonymize any
--    contractor's PII and payment-record display name via direct RPC call,
--    bypassing the super_admin-only button entirely.

-- Supabase grants EXECUTE on every new public-schema function directly to
-- anon/authenticated/service_role via ALTER DEFAULT PRIVILEGES at creation
-- time — REVOKE ... FROM PUBLIC alone does NOT touch those direct per-role
-- grants (confirmed live: revoking from PUBLIC only left anon/authenticated
-- still able to execute). Must name anon and authenticated explicitly,
-- matching the pattern already used on the sibling
-- credit_principal_wallet(4-arg) overload.
REVOKE ALL ON FUNCTION public.credit_principal_wallet(text, numeric, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_auto_draft() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_contractor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_contractor(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_contractor(p_contractor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only super_admin can permanently delete a contractor' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Anonymise all PII. `full_name` is the correct column (not `name`).
  UPDATE public.contractors
  SET
    full_name             = 'Former Contractor',
    first_name            = NULL,
    last_name             = NULL,
    whatsapp_phone        = NULL,
    heyreach_email        = NULL,
    heyreach_password_enc = NULL,
    linkedin_id           = NULL,
    linkedin_url          = NULL,
    notes                 = NULL,
    status                = 'deleted'
  WHERE id = p_contractor_id;

  -- Keep payment history intact — batch rows show "Former Contractor".
  UPDATE public.batch_items
  SET full_name = 'Former Contractor'
  WHERE contractor_id = p_contractor_id;
END;
$function$;
