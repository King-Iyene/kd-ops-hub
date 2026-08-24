-- "Authenticated users can create audit logs" (with_check: true) is a second
-- permissive INSERT policy on audit_logs that ORs against
-- audit_logs_insert_self_only. Since permissive policies OR together, the
-- unrestricted one wins — any authenticated user can insert a row with an
-- arbitrary performed_by, forging audit trail entries as another employee.
-- SECURITY DEFINER functions that write audit_logs run as the function owner
-- and bypass RLS entirely, so they are unaffected by removing this policy.

DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON public.audit_logs;
