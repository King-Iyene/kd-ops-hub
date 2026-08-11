-- payment_batches, batch_items, and audit_logs each carry a legacy blanket
-- policy (`<table>_auth`, USING(true) WITH CHECK(true), FOR ALL, role
-- authenticated) alongside the real, carefully role-gated policies added by
-- later migrations (batches_select/insert/update/delete,
-- batch_items_select/insert/update/delete, audit_logs_select_managers /
-- audit_logs_insert_self_only / the "No client updates/deletes" pair).
--
-- Postgres ORs permissive RLS policies together for the same command, so
-- these blanket policies silently override every role restriction the
-- specific policies enforce — ANY authenticated user (including
-- field_staff/driver) currently has unrestricted read/write on
-- payment_batches and batch_items, and unrestricted read/update/delete on
-- audit_logs, regardless of role.
--
-- None of the three blanket policies appear anywhere in this repo's tracked
-- migration history — they were added out-of-band directly against
-- production, the same way the orphaned on_auth_user_created trigger
-- (20260811140631) was. Confirmed via pg_policies that the specific
-- policies already fully cover every legitimate access pattern for all
-- four commands (SELECT/INSERT/UPDATE/DELETE) on all three tables before
-- dropping these. Verified live post-drop: a field_staff-role session now
-- sees 0 rows on payment_batches/batch_items/audit_logs (was previously
-- unrestricted), and a super_admin-role session is unaffected.
DROP POLICY IF EXISTS batches_auth ON public.payment_batches;
DROP POLICY IF EXISTS batch_items_auth ON public.batch_items;
DROP POLICY IF EXISTS audit_logs_auth ON public.audit_logs;
