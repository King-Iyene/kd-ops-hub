-- =============================================================================
-- Leave v2: one safe place for every leave action
-- =============================================================================
-- Why: admins could approve or reject a request, but could not change an
-- approved one, could not record leave for someone, and could not see what had
-- happened to a request. Every action was a loose set of screen-side updates
-- that could leave the balance wrong.
--
-- What this adds (all additive, nothing existing is dropped):
--   * leave_events            - a timeline of everything that happened to a request
--   * leave_balance_adjustments - a record of every manual balance change, with reason
--   * extra columns on leave_requests (note, who/when reviewed, who recorded it...)
--   * leave_* functions (admin-only where it matters) that change the request, the
--     balance, the timeline and the notifications in ONE step, so they cannot drift.
--   * a trigger so a new request always gets a timeline entry and tells the admins.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extra columns on leave_requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS review_note   text,
  ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at     timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'employee';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_source_check') THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT leave_requests_source_check CHECK (source IN ('employee', 'admin'));
  END IF;
END $$;

-- The original check only allowed annual / sick / unpaid, but the leave library
-- (leave_policies) offers more. Relax it to "any short code".
DO $$
DECLARE v_conname text;
BEGIN
  FOR v_conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.leave_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%leave_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.leave_requests DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;
ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_leave_type_check CHECK (leave_type ~ '^[a-z_]{2,40}$');

CREATE INDEX IF NOT EXISTS leave_requests_dates_idx
  ON public.leave_requests (start_date, end_date) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id    uuid NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind        text NOT NULL,   -- submitted, recorded, approved, rejected, edited, cancelled, reverted, deleted, noted, status_changed
  from_status text,
  to_status   text,
  note        text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_events_leave_idx ON public.leave_events (leave_id, created_at);

ALTER TABLE public.leave_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leave_events_select" ON public.leave_events;
CREATE POLICY "leave_events_select" ON public.leave_events FOR SELECT TO authenticated
USING (
  public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  OR EXISTS (SELECT 1 FROM public.leave_requests lr WHERE lr.id = leave_events.leave_id AND lr.employee_id = auth.uid())
);
-- No insert/update/delete policy on purpose: only the leave_* functions write here.

-- ---------------------------------------------------------------------------
-- 3. Balance change history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_balance_adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year        integer NOT NULL,
  field       text NOT NULL,
  old_value   numeric,
  new_value   numeric NOT NULL,
  reason      text NOT NULL,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_balance_adj_emp_idx ON public.leave_balance_adjustments (employee_id, year, created_at DESC);

ALTER TABLE public.leave_balance_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leave_balance_adj_select" ON public.leave_balance_adjustments;
CREATE POLICY "leave_balance_adj_select" ON public.leave_balance_adjustments FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
);

-- ---------------------------------------------------------------------------
-- 4. Small helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_caller_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.current_user_role() IN ('super_admin', 'admin'), false);
$$;

-- Monday-Friday days between two dates, minus public holidays. A single day
-- marked half-day counts 0.5.
CREATE OR REPLACE FUNCTION public.leave_working_days(p_start date, p_end date, p_half boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days numeric;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_days
  FROM generate_series(p_start, p_end, interval '1 day') g(d)
  WHERE EXTRACT(ISODOW FROM g.d) < 6
    AND NOT EXISTS (SELECT 1 FROM public.public_holidays h WHERE h.holiday_date = g.d::date AND h.is_observed);
  IF p_half AND p_start = p_end AND v_days > 0 THEN RETURN 0.5; END IF;
  RETURN v_days;
END;
$$;

-- Annual days EARNED so far: quota/12 per month, from the start month, never
-- more than the quota. Earlier years are fully earned, later years nothing.
CREATE OR REPLACE FUNCTION public.leave_accrued_days(p_quota numeric, p_year integer, p_start date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_cur integer := EXTRACT(YEAR FROM now() AT TIME ZONE 'UTC')::int;
  v_month integer := EXTRACT(MONTH FROM now() AT TIME ZONE 'UTC')::int;
  v_start_month integer := 1;
  v_elapsed integer;
BEGIN
  IF p_year < v_cur THEN RETURN p_quota; END IF;
  IF p_year > v_cur THEN RETURN 0; END IF;
  IF p_start IS NOT NULL THEN
    IF EXTRACT(YEAR FROM p_start)::int > p_year THEN RETURN 0; END IF;
    IF EXTRACT(YEAR FROM p_start)::int = p_year THEN v_start_month := EXTRACT(MONTH FROM p_start)::int; END IF;
  END IF;
  v_elapsed := v_month - v_start_month + 1;
  IF v_elapsed <= 0 THEN RETURN 0; END IF;
  RETURN LEAST(p_quota, ROUND((p_quota / 12.0) * v_elapsed));
END;
$$;

-- Which "used" column a leave type counts against (NULL = not tracked, e.g. casual).
CREATE OR REPLACE FUNCTION public.leave_used_column(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_type IN ('annual','sick','unpaid','maternity','paternity','compassionate','study')
              THEN p_type || '_used' END;
$$;

-- Yearly annual quota for someone (their balance row, else the company default).
CREATE OR REPLACE FUNCTION public.leave_annual_quota(p_employee uuid, p_year integer)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT annual_quota FROM public.leave_balances WHERE employee_id = p_employee AND year = p_year),
    (SELECT default_days FROM public.leave_policies WHERE code = 'annual'),
    20
  );
$$;

-- Move a balance up (+days) or down (-days). Serialised per person and year.
-- When p_cap is given (annual leave, someone who may not overdraw) the move is
-- refused if it would go above the cap. Returns false when refused.
CREATE OR REPLACE FUNCTION public.leave_move_balance(
  p_employee uuid, p_year integer, p_type text, p_days numeric, p_cap numeric DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_col text := public.leave_used_column(p_type);
  v_used numeric;
BEGIN
  IF v_col IS NULL OR COALESCE(p_days, 0) = 0 THEN RETURN true; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('leave_bal_' || p_employee::text || '_' || p_year::text));
  INSERT INTO public.leave_balances (employee_id, year, annual_quota)
  VALUES (p_employee, p_year, public.leave_annual_quota(p_employee, p_year))
  ON CONFLICT (employee_id, year) DO NOTHING;
  EXECUTE format('SELECT COALESCE(%I, 0) FROM public.leave_balances WHERE employee_id = $1 AND year = $2', v_col)
    INTO v_used USING p_employee, p_year;
  IF p_days > 0 AND p_cap IS NOT NULL AND v_used + p_days > p_cap THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'UPDATE public.leave_balances SET %I = GREATEST(0, COALESCE(%I, 0) + $1) WHERE employee_id = $2 AND year = $3',
    v_col, v_col
  ) USING p_days, p_employee, p_year;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_log_event(
  p_leave uuid, p_kind text, p_from text, p_to text, p_note text, p_details jsonb DEFAULT NULL
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.leave_events (leave_id, actor_id, kind, from_status, to_status, note, details)
  VALUES (p_leave, auth.uid(), p_kind, p_from, p_to, NULLIF(btrim(COALESCE(p_note, '')), ''), p_details);
$$;

CREATE OR REPLACE FUNCTION public.leave_notify(
  p_user uuid, p_title text, p_body text, p_priority text DEFAULT 'normal'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL OR p_user = auth.uid() THEN RETURN; END IF;
  BEGIN
    INSERT INTO public.notifications (user_id, type, module, priority, title, body)
    VALUES (p_user, 'leave', 'leave', p_priority, p_title, p_body);
  EXCEPTION WHEN OTHERS THEN NULL; -- a notification problem must never undo a leave action
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_notify_admins(p_title text, p_body text, p_except uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE role IN ('super_admin', 'admin') AND COALESCE(status, 'active') <> 'inactive' AND id IS DISTINCT FROM p_except LOOP
    PERFORM public.leave_notify(r.id, p_title, p_body, 'high');
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_describe(p_leave uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p.full_name, 'Someone') || ' · ' || initcap(replace(lr.leave_type, '_', ' ')) || ' leave · '
         || to_char(lr.start_date, 'DD Mon YYYY')
         || CASE WHEN lr.end_date <> lr.start_date THEN ' to ' || to_char(lr.end_date, 'DD Mon YYYY') ELSE '' END
         || ' (' || trim(trailing '.' FROM trim(trailing '0' FROM lr.days_requested::text)) || ' day' || CASE WHEN lr.days_requested = 1 THEN '' ELSE 's' END || ')'
  FROM public.leave_requests lr JOIN public.profiles p ON p.id = lr.employee_id
  WHERE lr.id = p_leave;
$$;

-- ---------------------------------------------------------------------------
-- 5. A new request always gets a timeline entry and tells the admins
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.leave_events (leave_id, actor_id, kind, to_status, note)
  VALUES (NEW.id, COALESCE(NEW.created_by, NEW.employee_id), CASE WHEN NEW.source = 'admin' THEN 'recorded' ELSE 'submitted' END, NEW.status, NEW.reason);
  IF NEW.status = 'pending' AND NEW.source = 'employee' THEN
    PERFORM public.leave_notify_admins('New leave request', public.leave_describe(NEW.id), NEW.employee_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS leave_after_insert_trg ON public.leave_requests;
CREATE TRIGGER leave_after_insert_trg AFTER INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.leave_after_insert();

-- A status change made any other way (an old screen, a script) is still written
-- to the timeline, so nothing happens silently.
CREATE OR REPLACE FUNCTION public.leave_after_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('leave.rpc', true), '') <> '1' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.leave_events (leave_id, actor_id, kind, from_status, to_status, note)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status, COALESCE(NEW.review_note, NEW.rejection_reason));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS leave_after_status_change_trg ON public.leave_requests;
CREATE TRIGGER leave_after_status_change_trg AFTER UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.leave_after_status_change();

-- ---------------------------------------------------------------------------
-- 6. Internal: check a request's dates against the person's other leave
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_assert_no_overlap(p_employee uuid, p_start date, p_end date, p_except uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clash record;
BEGIN
  SELECT start_date, end_date, status INTO v_clash
  FROM public.leave_requests
  WHERE employee_id = p_employee AND deleted_at IS NULL
    AND status IN ('pending', 'approved')
    AND id IS DISTINCT FROM p_except
    AND start_date <= p_end AND end_date >= p_start
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'These dates overlap other leave (% to %, %).',
      to_char(v_clash.start_date, 'DD Mon YYYY'), to_char(v_clash.end_date, 'DD Mon YYYY'), v_clash.status
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_check_dates(p_start date, p_end date, p_half boolean)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days numeric;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN RAISE EXCEPTION 'Pick a start and end date.'; END IF;
  IF p_end < p_start THEN RAISE EXCEPTION 'The end date is before the start date.'; END IF;
  IF p_end - p_start > 366 THEN RAISE EXCEPTION 'That is more than a year of leave.'; END IF;
  v_days := public.leave_working_days(p_start, p_end, p_half);
  IF v_days <= 0 THEN RAISE EXCEPTION 'Those dates are all weekends or public holidays, so there is nothing to take off.'; END IF;
  RETURN v_days;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Employee: ask for leave (checks everything in one place)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_submit(
  p_type text, p_start date, p_end date, p_half boolean DEFAULT false, p_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_days numeric;
  v_year integer := EXTRACT(YEAR FROM p_start)::int;
  v_id uuid;
  v_used numeric;
  v_accrued numeric;
  v_start date;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leave_policies WHERE code = p_type AND active) THEN
    RAISE EXCEPTION 'That leave type is not available.';
  END IF;
  v_days := public.leave_check_dates(p_start, p_end, p_half);
  PERFORM public.leave_assert_no_overlap(v_me, p_start, p_end);

  IF p_type = 'annual' THEN
    SELECT start_date INTO v_start FROM public.profiles WHERE id = v_me;
    SELECT COALESCE(annual_used, 0) INTO v_used FROM public.leave_balances WHERE employee_id = v_me AND year = v_year;
    v_used := COALESCE(v_used, 0);
    v_accrued := public.leave_accrued_days(public.leave_annual_quota(v_me, v_year), v_year, v_start);
    IF v_used + v_days > v_accrued THEN
      RAISE EXCEPTION 'You have % annual day(s) available so far this year (leave is earned monthly), and this asks for %.',
        GREATEST(0, v_accrued - v_used), v_days;
    END IF;
  END IF;

  PERFORM set_config('leave.rpc', '1', true);
  INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, days_requested, is_half_day, reason, source, created_by)
  VALUES (v_me, p_type, p_start, p_end, v_days, COALESCE(p_half, false) AND p_start = p_end, NULLIF(btrim(COALESCE(p_reason, '')), ''), 'employee', v_me)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Admin: approve or reject
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_review(
  p_id uuid, p_decision text, p_note text DEFAULT NULL, p_override boolean DEFAULT false
) RETURNS public.leave_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.leave_requests;
  v_year integer;
  v_cap numeric;
  v_start date;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF NOT public.leave_caller_is_admin() THEN RAISE EXCEPTION 'Only an admin can review leave.' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'Decision must be approve or reject.'; END IF;
  SELECT * INTO r FROM public.leave_requests WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That request no longer exists.'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'That request is already %. Refresh to see the latest.', r.status;
  END IF;
  PERFORM set_config('leave.rpc', '1', true);
  v_year := EXTRACT(YEAR FROM r.start_date)::int;

  IF p_decision = 'approve' THEN
    IF r.leave_type = 'annual' AND NOT COALESCE(p_override, false) THEN
      SELECT start_date INTO v_start FROM public.profiles WHERE id = r.employee_id;
      v_cap := public.leave_accrued_days(public.leave_annual_quota(r.employee_id, v_year), v_year, v_start);
    END IF;
    IF NOT public.leave_move_balance(r.employee_id, v_year, r.leave_type, r.days_requested, v_cap) THEN
      RAISE EXCEPTION 'OVER_BALANCE: this is more annual leave than % has earned so far. Approve anyway to allow it.',
        (SELECT COALESCE(full_name, 'they') FROM public.profiles WHERE id = r.employee_id);
    END IF;
    UPDATE public.leave_requests
       SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note, rejection_reason = NULL
     WHERE id = p_id RETURNING * INTO r;
    PERFORM public.leave_log_event(p_id, 'approved', 'pending', 'approved', v_note,
      CASE WHEN COALESCE(p_override, false) THEN jsonb_build_object('over_balance_allowed', true) END);
    PERFORM public.leave_notify(r.employee_id, 'Your leave was approved', public.leave_describe(p_id) || COALESCE(' — ' || v_note, ''));
  ELSE
    IF v_note IS NULL THEN RAISE EXCEPTION 'Please say why, so they know what to change.'; END IF;
    UPDATE public.leave_requests
       SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note, rejection_reason = v_note
     WHERE id = p_id RETURNING * INTO r;
    PERFORM public.leave_log_event(p_id, 'rejected', 'pending', 'rejected', v_note);
    PERFORM public.leave_notify(r.employee_id, 'Your leave was not approved', public.leave_describe(p_id) || ' — ' || v_note, 'high');
  END IF;
  RETURN r;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Admin: change a request (pending OR approved), balance follows automatically
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_edit(
  p_id uuid, p_type text, p_start date, p_end date, p_half boolean, p_reason text DEFAULT NULL,
  p_note text DEFAULT NULL, p_override boolean DEFAULT false
) RETURNS public.leave_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.leave_requests;
  o public.leave_requests;
  v_days numeric;
  v_old_year integer;
  v_new_year integer;
  v_cap numeric;
  v_start date;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF NOT public.leave_caller_is_admin() THEN RAISE EXCEPTION 'Only an admin can change leave.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.leave_requests WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That request no longer exists.'; END IF;
  IF o.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'A % request cannot be changed. Move it back to pending first.', o.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leave_policies WHERE code = p_type) THEN
    RAISE EXCEPTION 'Unknown leave type.';
  END IF;
  v_days := public.leave_check_dates(p_start, p_end, p_half);
  PERFORM public.leave_assert_no_overlap(o.employee_id, p_start, p_end, p_id);
  PERFORM set_config('leave.rpc', '1', true);

  IF o.status = 'approved' THEN
    v_old_year := EXTRACT(YEAR FROM o.start_date)::int;
    v_new_year := EXTRACT(YEAR FROM p_start)::int;
    -- give the old days back, then take the new ones (even across years or types)
    PERFORM public.leave_move_balance(o.employee_id, v_old_year, o.leave_type, -o.days_requested);
    IF p_type = 'annual' AND NOT COALESCE(p_override, false) THEN
      SELECT start_date INTO v_start FROM public.profiles WHERE id = o.employee_id;
      v_cap := public.leave_accrued_days(public.leave_annual_quota(o.employee_id, v_new_year), v_new_year, v_start);
    END IF;
    IF NOT public.leave_move_balance(o.employee_id, v_new_year, p_type, v_days, v_cap) THEN
      RAISE EXCEPTION 'OVER_BALANCE: that is more annual leave than % has earned so far. Save anyway to allow it.',
        (SELECT COALESCE(full_name, 'they') FROM public.profiles WHERE id = o.employee_id);
    END IF;
  END IF;

  UPDATE public.leave_requests
     SET leave_type = p_type, start_date = p_start, end_date = p_end, days_requested = v_days,
         is_half_day = COALESCE(p_half, false) AND p_start = p_end,
         reason = CASE WHEN p_reason IS NULL THEN reason ELSE NULLIF(btrim(p_reason), '') END,
         edited_at = now(), edited_by = auth.uid()
   WHERE id = p_id RETURNING * INTO r;

  PERFORM public.leave_log_event(p_id, 'edited', o.status, r.status, v_note, jsonb_build_object(
    'before', jsonb_build_object('type', o.leave_type, 'start', o.start_date, 'end', o.end_date, 'days', o.days_requested),
    'after',  jsonb_build_object('type', r.leave_type, 'start', r.start_date, 'end', r.end_date, 'days', r.days_requested)));
  PERFORM public.leave_notify(r.employee_id, 'Your leave was changed', public.leave_describe(p_id) || COALESCE(' — ' || v_note, ''), 'high');
  RETURN r;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Cancel (admin: any pending/approved; employee: own pending, or own approved that has not started)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_cancel(p_id uuid, p_reason text DEFAULT NULL)
RETURNS public.leave_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.leave_requests;
  v_admin boolean := public.leave_caller_is_admin();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_prev text;
BEGIN
  SELECT * INTO r FROM public.leave_requests WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That request no longer exists.'; END IF;
  IF NOT v_admin THEN
    IF r.employee_id <> auth.uid() THEN RAISE EXCEPTION 'You can only cancel your own leave.' USING ERRCODE = '42501'; END IF;
    IF r.status = 'approved' AND r.start_date <= current_date THEN
      RAISE EXCEPTION 'This leave has already started. Ask an admin to change it.';
    END IF;
  END IF;
  IF r.status NOT IN ('pending', 'approved') THEN RAISE EXCEPTION 'That request is already %.', r.status; END IF;
  PERFORM set_config('leave.rpc', '1', true);
  v_prev := r.status;
  IF r.status = 'approved' THEN
    PERFORM public.leave_move_balance(r.employee_id, EXTRACT(YEAR FROM r.start_date)::int, r.leave_type, -r.days_requested);
  END IF;
  UPDATE public.leave_requests
     SET status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = v_reason
   WHERE id = p_id RETURNING * INTO r;
  PERFORM public.leave_log_event(p_id, 'cancelled', v_prev, 'cancelled', v_reason);
  IF v_admin AND r.employee_id <> auth.uid() THEN
    PERFORM public.leave_notify(r.employee_id, 'Your leave was cancelled', public.leave_describe(p_id) || COALESCE(' — ' || v_reason, ''), 'high');
  ELSIF NOT v_admin AND v_prev = 'approved' THEN
    PERFORM public.leave_notify_admins('Approved leave was cancelled', public.leave_describe(p_id), auth.uid());
  END IF;
  RETURN r;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Admin: put a decided request back to pending (balance is given back)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_revert(p_id uuid, p_note text DEFAULT NULL)
RETURNS public.leave_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.leave_requests;
  v_prev text;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF NOT public.leave_caller_is_admin() THEN RAISE EXCEPTION 'Only an admin can do this.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.leave_requests WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That request no longer exists.'; END IF;
  IF r.status = 'pending' THEN RAISE EXCEPTION 'That request is already pending.'; END IF;
  PERFORM public.leave_assert_no_overlap(r.employee_id, r.start_date, r.end_date, p_id);
  PERFORM set_config('leave.rpc', '1', true);
  v_prev := r.status;
  IF r.status = 'approved' THEN
    PERFORM public.leave_move_balance(r.employee_id, EXTRACT(YEAR FROM r.start_date)::int, r.leave_type, -r.days_requested);
  END IF;
  UPDATE public.leave_requests
     SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, rejection_reason = NULL,
         cancelled_by = NULL, cancel_reason = NULL
   WHERE id = p_id RETURNING * INTO r;
  PERFORM public.leave_log_event(p_id, 'reverted', v_prev, 'pending', v_note);
  PERFORM public.leave_notify(r.employee_id, 'Your leave is back under review', public.leave_describe(p_id) || COALESCE(' — ' || v_note, ''));
  RETURN r;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Admin: record leave for someone (approved straight away unless told otherwise)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_record(
  p_employee uuid, p_type text, p_start date, p_end date, p_half boolean DEFAULT false,
  p_reason text DEFAULT NULL, p_status text DEFAULT 'approved', p_override boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_days numeric;
  v_year integer := EXTRACT(YEAR FROM p_start)::int;
  v_id uuid;
  v_cap numeric;
  v_start date;
BEGIN
  IF NOT public.leave_caller_is_admin() THEN RAISE EXCEPTION 'Only an admin can record leave for someone.' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('approved', 'pending') THEN RAISE EXCEPTION 'Status must be approved or pending.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_employee) THEN RAISE EXCEPTION 'Unknown person.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leave_policies WHERE code = p_type) THEN RAISE EXCEPTION 'Unknown leave type.'; END IF;
  v_days := public.leave_check_dates(p_start, p_end, p_half);
  PERFORM public.leave_assert_no_overlap(p_employee, p_start, p_end);
  PERFORM set_config('leave.rpc', '1', true);

  IF p_status = 'approved' THEN
    IF p_type = 'annual' AND NOT COALESCE(p_override, false) THEN
      SELECT start_date INTO v_start FROM public.profiles WHERE id = p_employee;
      v_cap := public.leave_accrued_days(public.leave_annual_quota(p_employee, v_year), v_year, v_start);
    END IF;
    IF NOT public.leave_move_balance(p_employee, v_year, p_type, v_days, v_cap) THEN
      RAISE EXCEPTION 'OVER_BALANCE: that is more annual leave than % has earned so far. Record anyway to allow it.',
        (SELECT COALESCE(full_name, 'they') FROM public.profiles WHERE id = p_employee);
    END IF;
  END IF;

  INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, days_requested, is_half_day, reason,
                                     status, reviewed_by, reviewed_at, source, created_by)
  VALUES (p_employee, p_type, p_start, p_end, v_days, COALESCE(p_half, false) AND p_start = p_end,
          NULLIF(btrim(COALESCE(p_reason, '')), ''), p_status,
          CASE WHEN p_status = 'approved' THEN auth.uid() END, CASE WHEN p_status = 'approved' THEN now() END,
          'admin', auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.leave_notify(p_employee, 'Leave was added for you', public.leave_describe(v_id) || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_reason, '')), ''), ''));
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Admin: delete (soft) and add a note
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_delete(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.leave_requests;
BEGIN
  IF NOT public.leave_caller_is_admin() THEN RAISE EXCEPTION 'Only an admin can delete leave.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.leave_requests WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM set_config('leave.rpc', '1', true);
  IF r.status = 'approved' THEN
    PERFORM public.leave_move_balance(r.employee_id, EXTRACT(YEAR FROM r.start_date)::int, r.leave_type, -r.days_requested);
  END IF;
  UPDATE public.leave_requests SET deleted_at = now() WHERE id = p_id;
  PERFORM public.leave_log_event(p_id, 'deleted', r.status, r.status, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_add_note(p_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.leave_caller_is_admin() THEN RAISE EXCEPTION 'Only an admin can add notes.' USING ERRCODE = '42501'; END IF;
  IF NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN RAISE EXCEPTION 'Write a note first.'; END IF;
  PERFORM public.leave_log_event(p_id, 'noted', NULL, NULL, p_note);
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Admin: change someone's balance, with a reason that is kept
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_adjust_balance(
  p_employee uuid, p_year integer, p_field text, p_value numeric, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old numeric;
BEGIN
  IF NOT public.leave_caller_is_admin() THEN RAISE EXCEPTION 'Only an admin can change balances.' USING ERRCODE = '42501'; END IF;
  IF p_field NOT IN ('annual_quota','annual_used','sick_used','unpaid_used','maternity_used','paternity_used','compassionate_used','study_used') THEN
    RAISE EXCEPTION 'That balance cannot be changed.';
  END IF;
  IF p_value IS NULL OR p_value < 0 OR p_value > 400 THEN RAISE EXCEPTION 'Enter a number of days between 0 and 400.'; END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Please give a reason. It is kept in the history.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('leave_bal_' || p_employee::text || '_' || p_year::text));
  INSERT INTO public.leave_balances (employee_id, year, annual_quota)
  VALUES (p_employee, p_year, public.leave_annual_quota(p_employee, p_year))
  ON CONFLICT (employee_id, year) DO NOTHING;
  EXECUTE format('SELECT COALESCE(%I, 0) FROM public.leave_balances WHERE employee_id = $1 AND year = $2', p_field)
    INTO v_old USING p_employee, p_year;
  EXECUTE format('UPDATE public.leave_balances SET %I = $1 WHERE employee_id = $2 AND year = $3', p_field)
    USING p_value, p_employee, p_year;
  INSERT INTO public.leave_balance_adjustments (employee_id, year, field, old_value, new_value, reason, actor_id)
  VALUES (p_employee, p_year, p_field, v_old, p_value, btrim(p_reason), auth.uid());
  PERFORM public.leave_notify(p_employee, 'Your leave balance was updated',
    initcap(replace(replace(p_field, '_used', ' used'), '_quota', ' yearly allowance')) || ' for ' || p_year || ': ' || v_old || ' → ' || p_value || ' days. ' || btrim(p_reason));
END;
$$;


-- ---------------------------------------------------------------------------
-- 15. Who is away: everyone can see who is out and when, nothing more.
--     Names and dates only. The kind of leave (sick, maternity...) and pending
--     requests are shown to admins and to the person themselves, nobody else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_whos_away(p_from date, p_to date)
RETURNS TABLE (
  leave_id uuid, employee_id uuid, employee_name text, department_name text,
  start_date date, end_date date, days numeric, leave_type text, status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lr.id, lr.employee_id, COALESCE(p.full_name, 'Someone'), d.name,
         lr.start_date, lr.end_date, lr.days_requested,
         CASE WHEN public.leave_caller_is_admin() OR lr.employee_id = auth.uid() THEN lr.leave_type END,
         lr.status
  FROM public.leave_requests lr
  JOIN public.profiles p ON p.id = lr.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE auth.uid() IS NOT NULL
    AND lr.deleted_at IS NULL
    AND lr.start_date <= p_to AND lr.end_date >= p_from
    AND COALESCE(p.status, 'active') <> 'inactive'
    AND (lr.status = 'approved'
         OR (lr.status = 'pending' AND (public.leave_caller_is_admin() OR lr.employee_id = auth.uid())))
  ORDER BY lr.start_date, p.full_name;
$$;
REVOKE ALL ON FUNCTION public.leave_whos_away(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_whos_away(date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 16. One email template for "your leave changed" (edited, cancelled, moved
--     back to pending, added for you). Approved / not-approved reuse the
--     existing request.approved / request.rejected templates.
-- ---------------------------------------------------------------------------
INSERT INTO public.email_templates
  (key, name, description, category, subject, html_body, text_body, variables,
   default_subject, default_html_body, default_text_body, is_system)
VALUES
  ('leave.update',
   'Leave update (employee)',
   'Sent when an admin changes, cancels or adds leave for someone. {{headline}} says what happened.',
   'hr',
   '{{headline}}',
   '<p>Hi {{requester_name}},</p>
<p><strong>{{headline}}</strong></p>
<p>{{summary}}</p>
{{#note}}<p>Note from {{by_name}}: <em>{{note}}</em></p>{{/note}}
<p>See the details in KD Ops: <a href="{{link}}">{{link}}</a></p>',
   'Hi {{requester_name}},
{{headline}}
{{summary}}
Note from {{by_name}}: {{note}}
View: {{link}}',
   '[
     {"name":"requester_name","description":"Employee","example":"Bola"},
     {"name":"headline","description":"What happened","example":"Your leave was changed"},
     {"name":"summary","description":"One-liner","example":"Annual leave, 7 to 11 Dec (5 days)"},
     {"name":"by_name","description":"Who made the change","example":"Siyeofori"},
     {"name":"note","description":"Optional note","example":""},
     {"name":"link","description":"Deep link","example":"https://ops.kdsquares.com/leave"}
   ]'::jsonb,
   '{{headline}}',
   '<p>Hi {{requester_name}},</p>
<p><strong>{{headline}}</strong></p>
<p>{{summary}}</p>
{{#note}}<p>Note from {{by_name}}: <em>{{note}}</em></p>{{/note}}
<p>See the details in KD Ops: <a href="{{link}}">{{link}}</a></p>',
   'Hi {{requester_name}},
{{headline}}
{{summary}}
Note from {{by_name}}: {{note}}
View: {{link}}',
   true)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 17. Who may call what
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'leave_submit(text,date,date,boolean,text)',
    'leave_review(uuid,text,text,boolean)',
    'leave_edit(uuid,text,date,date,boolean,text,text,boolean)',
    'leave_cancel(uuid,text)',
    'leave_revert(uuid,text)',
    'leave_record(uuid,text,date,date,boolean,text,text,boolean)',
    'leave_delete(uuid,text)',
    'leave_add_note(uuid,text)',
    'leave_adjust_balance(uuid,integer,text,numeric,text)',
    'leave_working_days(date,date,boolean)',
    'leave_accrued_days(numeric,integer,date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  -- internal helpers are not callable from the browser
  FOREACH f IN ARRAY ARRAY[
    'leave_move_balance(uuid,integer,text,numeric,numeric)',
    'leave_log_event(uuid,text,text,text,text,jsonb)',
    'leave_notify(uuid,text,text,text)',
    'leave_notify_admins(text,text,uuid)',
    'leave_assert_no_overlap(uuid,date,date,uuid)',
    'leave_describe(uuid)',
    'leave_annual_quota(uuid,integer)',
    'leave_check_dates(date,date,boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

GRANT SELECT ON public.leave_events, public.leave_balance_adjustments TO authenticated;

-- live updates for the admin screens
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_events;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
