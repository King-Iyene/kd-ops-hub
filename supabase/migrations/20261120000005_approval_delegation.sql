-- =============================================================================
-- Approval delegation — when a manager is on leave, their approvals (leave,
-- expense, salary advance) can be routed to a backup approver for a date
-- range.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.approval_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id uuid NOT NULL REFERENCES profiles(id),
  delegate_id uuid NOT NULL REFERENCES profiles(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  is_active boolean DEFAULT true,
  approval_types text[] DEFAULT '{leave,expense,advance}',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT no_self_delegation CHECK (delegator_id != delegate_id),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegator
  ON public.approval_delegations (delegator_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegate
  ON public.approval_delegations (delegate_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_approval_delegations_dates
  ON public.approval_delegations (start_date, end_date) WHERE is_active;

ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_delegations_select" ON public.approval_delegations;
CREATE POLICY "approval_delegations_select" ON public.approval_delegations
  FOR SELECT TO authenticated
  USING (
    delegator_id = auth.uid()
    OR delegate_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

DROP POLICY IF EXISTS "approval_delegations_insert" ON public.approval_delegations;
CREATE POLICY "approval_delegations_insert" ON public.approval_delegations
  FOR INSERT TO authenticated
  WITH CHECK (
    delegator_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

DROP POLICY IF EXISTS "approval_delegations_update" ON public.approval_delegations;
CREATE POLICY "approval_delegations_update" ON public.approval_delegations
  FOR UPDATE TO authenticated
  USING (
    delegator_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  )
  WITH CHECK (
    delegator_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

DROP POLICY IF EXISTS "approval_delegations_delete" ON public.approval_delegations;
CREATE POLICY "approval_delegations_delete" ON public.approval_delegations
  FOR DELETE TO authenticated
  USING (
    delegator_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

-- -----------------------------------------------------------------------------
-- get_effective_approver — resolves an employee's approving manager, taking
-- into account any active delegation covering today for the given approval
-- type. Falls back to reporting_manager_id when there's no manager, no
-- delegation, or the delegation doesn't cover this approval type.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_effective_approver(
  p_employee_id uuid,
  p_approval_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_manager_id uuid;
  v_delegate_id uuid;
BEGIN
  SELECT reporting_manager_id INTO v_manager_id
  FROM public.profiles
  WHERE id = p_employee_id;

  IF v_manager_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT delegate_id INTO v_delegate_id
  FROM public.approval_delegations
  WHERE delegator_id = v_manager_id
    AND is_active
    AND current_date BETWEEN start_date AND end_date
    AND p_approval_type = ANY (approval_types)
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_delegate_id, v_manager_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_approver(uuid, text) TO authenticated;
