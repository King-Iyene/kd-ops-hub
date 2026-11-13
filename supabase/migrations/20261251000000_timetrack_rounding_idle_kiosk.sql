-- =============================================================================
-- Three more TimeCamp-parity features, confirmed in scope:
--   1. Time rounding rules — applied server-side in time_entries_before_write()
--      so it's consistent regardless of entry path (timer stop, manual entry,
--      any future import), not something the client can bypass.
--   2. Idle-time threshold — pure config; the popup itself is JS-only
--      (mouse/keyboard listeners), no native agent needed. This just stores
--      the admin-configurable threshold.
--   3. Kiosk/shared-device clock-in — a single shared-device login clocks
--      OTHER employees in/out via a 4-digit PIN, without giving that device
--      a real session per employee. Gated by the existing
--      'track_time_for_others' capability, never by raw table access.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rounding settings (singleton row)
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_rounding_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  round_to_minutes integer NOT NULL DEFAULT 15 CHECK (round_to_minutes IN (5, 10, 15, 30, 60)),
  round_direction text NOT NULL DEFAULT 'nearest' CHECK (round_direction IN ('nearest', 'up', 'down')),
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.time_rounding_settings (id) VALUES (true);

CREATE OR REPLACE FUNCTION public.time_apply_rounding(p_minutes integer)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_settings public.time_rounding_settings;
  v_increment integer;
  v_remainder integer;
BEGIN
  SELECT * INTO v_settings FROM public.time_rounding_settings WHERE id = true;
  IF NOT v_settings.is_enabled OR p_minutes IS NULL THEN
    RETURN p_minutes;
  END IF;

  v_increment := v_settings.round_to_minutes;
  v_remainder := p_minutes % v_increment;
  IF v_remainder = 0 THEN
    RETURN p_minutes;
  END IF;

  RETURN CASE v_settings.round_direction
    WHEN 'up' THEN p_minutes + (v_increment - v_remainder)
    WHEN 'down' THEN p_minutes - v_remainder
    ELSE CASE WHEN v_remainder >= v_increment / 2.0 THEN p_minutes + (v_increment - v_remainder) ELSE p_minutes - v_remainder END
  END;
END;
$$;

-- Re-point the existing before-write trigger function at the rounding
-- helper. Same signature/trigger binding as before — CREATE OR REPLACE only.
CREATE OR REPLACE FUNCTION public.time_entries_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_rate_found boolean;
BEGIN
  SELECT project_id INTO v_project_id FROM public.time_tasks WHERE id = NEW.task_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Task % does not exist', NEW.task_id;
  END IF;
  NEW.project_id := v_project_id;

  IF NEW.end_time IS NOT NULL THEN
    NEW.duration_minutes := public.time_apply_rounding(
      GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60)::integer)
    );
  ELSE
    NEW.duration_minutes := NULL;
  END IF;

  IF NEW.is_billable THEN
    SELECT EXISTS (
      SELECT 1 FROM public.time_resolve_billing_rate(NEW.employee_id, NEW.project_id, NEW.start_time::date)
    ) INTO v_rate_found;
    IF NOT v_rate_found THEN
      RAISE EXCEPTION 'Cannot mark time entry billable: no billing rate on file for this employee/project as of %', NEW.start_time::date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.time_rounding_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_rounding_settings_read" ON public.time_rounding_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_rounding_settings_write" ON public.time_rounding_settings
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Idle-time threshold (singleton row) — the popup itself is client-side JS
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_idle_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  idle_threshold_minutes integer NOT NULL DEFAULT 5 CHECK (idle_threshold_minutes >= 1),
  is_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.time_idle_settings (id) VALUES (true);

ALTER TABLE public.time_idle_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_idle_settings_read" ON public.time_idle_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_idle_settings_write" ON public.time_idle_settings
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Kiosk mode — PIN-based clock-in/out for a shared device, on behalf of
--    another employee, without that employee ever logging into the device.
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_kiosk_pins (
  employee_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.time_set_kiosk_pin(p_employee_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Not permitted to set kiosk PINs';
  END IF;
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits';
  END IF;

  INSERT INTO public.time_kiosk_pins (employee_id, pin_hash, updated_by)
  VALUES (p_employee_id, crypt(p_pin, gen_salt('bf')), auth.uid())
  ON CONFLICT (employee_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_by = auth.uid(), updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_set_kiosk_pin(uuid, text) TO authenticated;

-- The device's own logged-in account must hold 'track_time_for_others' to
-- use this at all — a PIN alone is never sufficient on its own.
CREATE OR REPLACE FUNCTION public.time_kiosk_clock(p_employee_id uuid, p_pin text, p_action text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_open_id uuid;
BEGIN
  IF p_action NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Invalid action %', p_action;
  END IF;
  IF NOT public.time_has_capability('track_time_for_others') THEN
    RAISE EXCEPTION 'This device is not authorized for kiosk clock-in';
  END IF;

  SELECT pin_hash INTO v_hash FROM public.time_kiosk_pins WHERE employee_id = p_employee_id;
  IF v_hash IS NULL OR v_hash <> crypt(p_pin, v_hash) THEN
    RAISE EXCEPTION 'Incorrect PIN';
  END IF;

  IF p_action = 'in' THEN
    IF EXISTS (SELECT 1 FROM public.time_attendance_entries WHERE employee_id = p_employee_id AND clock_out IS NULL) THEN
      RAISE EXCEPTION 'Already clocked in';
    END IF;
    INSERT INTO public.time_attendance_entries (employee_id, clock_in, source)
    VALUES (p_employee_id, now(), 'kiosk')
    RETURNING id INTO v_open_id;
    RETURN v_open_id;
  ELSE
    SELECT id INTO v_open_id FROM public.time_attendance_entries WHERE employee_id = p_employee_id AND clock_out IS NULL;
    IF v_open_id IS NULL THEN
      RAISE EXCEPTION 'Not currently clocked in';
    END IF;
    UPDATE public.time_attendance_entries SET clock_out = now() WHERE id = v_open_id;
    RETURN v_open_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_kiosk_clock(uuid, text, text) TO authenticated;

ALTER TABLE public.time_kiosk_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_kiosk_pins_admin_only" ON public.time_kiosk_pins
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

COMMENT ON FUNCTION public.time_kiosk_clock IS
  'PIN is secondary, not primary, auth: the calling DEVICE session must already hold track_time_for_others.';
