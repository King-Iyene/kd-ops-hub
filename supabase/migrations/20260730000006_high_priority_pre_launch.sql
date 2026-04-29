-- Pre-launch HIGH-priority fixes from the 2026-04-29 audit:
--
--   H1. Widen fuel_requests admin policy to also cover finance + super_admin
--       so the Approve button in the UI doesn't silently fail with an RLS
--       error for finance users.
--
--   H4. Add indexes on audit_logs and notifications. Both tables grow fast
--       (every webhook + every state change writes an audit row, every
--       transfer fan-outs notifications to all finance staff). Without
--       these, every page that loads recent activity does a sequential
--       scan after the first few weeks of production.
--
-- All changes are idempotent.

-- ============================================================================
-- H1 — fuel_requests RLS: include finance + super_admin
-- ============================================================================

-- Replace the role = 'admin' check with a role-list check + use the
-- current_user_role() helper which is SECURITY DEFINER and avoids the
-- subselect. This makes the Approve / Mark Sent / Mark Complete flows
-- usable by finance roles as the UI already implies.

DROP POLICY IF EXISTS "Admins can manage fuel requests" ON public.fuel_requests;

CREATE POLICY "Staff can manage fuel requests"
  ON public.fuel_requests
  FOR ALL TO authenticated
  USING  (public.current_user_role() IN ('super_admin', 'admin', 'finance'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

-- ============================================================================
-- H4 — Indexes on hot append-only tables
-- ============================================================================

-- audit_logs: paginated by created_at DESC on the dashboard and audit page.
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_performed_by_idx
  ON public.audit_logs (performed_by);

CREATE INDEX IF NOT EXISTS audit_logs_action_type_idx
  ON public.audit_logs (action_type);

-- notifications: bell dropdown + realtime sub for current user. Most
-- queries are WHERE user_id = ? ORDER BY created_at DESC LIMIT 50, plus
-- a frequent unread-count probe.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id) WHERE read = false;

-- batch_items: pulled by status during the worker loop and by webhook
-- by paystack_reference / reference. The first index supports the
-- worker pull (status IN ('pending') WHERE batch_id = ?), the second
-- supports webhook lookup.
CREATE INDEX IF NOT EXISTS batch_items_batch_id_status_idx
  ON public.batch_items (batch_id, status);

CREATE INDEX IF NOT EXISTS batch_items_paystack_reference_idx
  ON public.batch_items (paystack_reference) WHERE paystack_reference IS NOT NULL;
