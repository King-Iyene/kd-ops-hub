-- =============================================================================
-- Leave balances (TimeCamp parity gap: the Leave module had request/approve/
-- reject but no concept of "days remaining" — every leave type was effectively
-- unlimited). Adds a per-leave-type annual allowance and a function that
-- computes used/remaining days for a given employee + calendar year from the
-- existing time_leave_requests data — no new per-employee ledger table, so
-- there's nothing to keep in sync: it's derived fresh from approved requests
-- every time, same pattern as time_finance_report / time_planner_vs_actual.
-- =============================================================================

ALTER TABLE public.time_leave_types
  ADD COLUMN IF NOT EXISTS annual_allowance_days numeric(5,2); -- NULL = unlimited (e.g. unpaid "Other")

COMMENT ON COLUMN public.time_leave_types.annual_allowance_days IS
  'Days granted per calendar year for this leave type. NULL means unlimited / not tracked.';

-- A reasonable default so existing data isn't silently "unlimited" post-migration.
UPDATE public.time_leave_types SET annual_allowance_days = 20 WHERE name = 'Vacation' AND annual_allowance_days IS NULL;
UPDATE public.time_leave_types SET annual_allowance_days = 10 WHERE name = 'Sick' AND annual_allowance_days IS NULL;
-- 'Other' stays NULL (unlimited/unpaid), matching its is_paid = false default.

CREATE OR REPLACE FUNCTION public.time_leave_balance_summary(p_employee_id uuid, p_year integer)
RETURNS TABLE (
  leave_type_id uuid,
  leave_type_name text,
  annual_allowance_days numeric,
  used_days numeric,
  remaining_days numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_employee_id AND NOT public.time_has_capability('approve_leave') THEN
    RAISE EXCEPTION 'Not permitted to view this employee''s leave balance';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.annual_allowance_days,
    COALESCE(SUM(
      -- Whole days in [start_date, end_date] that fall within the requested year,
      -- weighted by hours_per_day/8 for a partial-day request (NULL = full day).
      (LEAST(r.end_date, make_date(p_year, 12, 31)) - GREATEST(r.start_date, make_date(p_year, 1, 1)) + 1)
      * COALESCE(r.hours_per_day / 8.0, 1.0)
    ) FILTER (
      WHERE r.status = 'approved'
        AND r.start_date <= make_date(p_year, 12, 31)
        AND r.end_date >= make_date(p_year, 1, 1)
    ), 0)::numeric AS used_days,
    CASE WHEN t.annual_allowance_days IS NULL THEN NULL
      ELSE t.annual_allowance_days - COALESCE(SUM(
        (LEAST(r.end_date, make_date(p_year, 12, 31)) - GREATEST(r.start_date, make_date(p_year, 1, 1)) + 1)
        * COALESCE(r.hours_per_day / 8.0, 1.0)
      ) FILTER (
        WHERE r.status = 'approved'
          AND r.start_date <= make_date(p_year, 12, 31)
          AND r.end_date >= make_date(p_year, 1, 1)
      ), 0)
    END AS remaining_days
  FROM public.time_leave_types t
  LEFT JOIN public.time_leave_requests r
    ON r.leave_type_id = t.id AND r.employee_id = p_employee_id
  WHERE t.is_archived = false
  GROUP BY t.id, t.name, t.annual_allowance_days
  ORDER BY t.name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_leave_balance_summary(uuid, integer) TO authenticated;
