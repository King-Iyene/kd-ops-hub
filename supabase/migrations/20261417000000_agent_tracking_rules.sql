-- Ops Agent: five more rules for time tracking (Track).
--
--   TR06  Timer running with no tracker evidence   an open timer, the desktop app is on for the person, and no activity has been
--                                                  captured since the timer started (45 minutes grace, or 3 capture intervals + 10)
--   TR07  Manual time with nothing to back it      manual entries added in the last 48 hours: 2 hours or more on a day with no
--                                                  captured activity (app on), or added 2+ days after the work and 1 hour or more
--   TR08  Blocked or unproductive apps             native apps (not websites) in the Blocked or Unproductive category today
--   TR09  Hours that do not add up                 a closed entry of 10 hours or more, a day total of 12 hours or more, or 2 hours
--                                                  or more tracked on a day of approved leave
--   TR10  Tracker not set up                       once a week per person: settings missing or off, the app never installed, or
--                                                  time tracked on the web only
--
-- Every rule looks at the KD Squares team only (agent_team_v), in the agent time zone, skips Placement and people exempt from
-- time rules, and skips days where work is not expected (leave, holiday, weekend; TR09 reads leave on purpose). Every query is
-- bounded: today, the last 48 hours, or the last 3 days, and uses the existing (employee_id, start_time) and
-- (employee_id, captured_at) indexes, so a first run on production cannot flood the Inbox or scan history.
--
-- Thresholds live in agent_rules.params (agent_rule_param), so they can change without code:
--   TR06 {"grace_minutes": 45, "high_hours": 3}          TR07 {"unbacked_minutes": 120, "backdated_minutes": 60, "high_entry_minutes": 360}
--   TR08 {"unproductive_minutes": 15}                    TR09 {"long_entry_minutes": 600, "day_total_minutes": 720, "leave_minutes": 120}
--
-- Manual entries are saved from the browser without a time zone, so the database reads them as UTC clock time. They are compared
-- by DAY (the date that was typed), never by clock time; agent_entry_day() holds that rule in one place.
--
-- Also redefines agent_flag_link, agent_flag_draft and agent_flag_detail (from 20261413000000_agent_v5.sql) so the Inbox card
-- and the drafted message read well for the new rules. Everything they did before is unchanged.
--
-- Rollback: supabase/rollbacks/20261417_agent_tracking_rules_down.sql

-- ── Helper: the day an entry belongs to ────────────────────────────────────
-- Timer entries carry a real moment: their day is the Eastern day. Manual entries carry the typed clock time read as UTC: their
-- day is the typed date.
CREATE OR REPLACE FUNCTION public.agent_entry_day(p_start timestamptz, p_source text, p_tz text)
RETURNS date LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_source = 'manual' THEN (p_start AT TIME ZONE 'UTC')::date ELSE (p_start AT TIME ZONE p_tz)::date END
$$;

-- ── TR06 Timer running with no tracker evidence ────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tr06(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; r record; v_grace numeric; v_high numeric; v_sev text;
  v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  v_grace := greatest(public.agent_rule_param('TR06', 'grace_minutes', 45), 1);
  v_high := public.agent_rule_param('TR06', 'high_hours', 3);

  FOR r IN
    SELECT t.person_id, t.full_name, e.id AS entry_id, e.start_time, coalesce(a.capture_interval_minutes, 10) AS capture_min,
           greatest(v_grace, 3 * coalesce(a.capture_interval_minutes, 10) + 10) AS need_min,
           extract(epoch FROM (p_now - e.start_time)) / 60.0 AS run_min
      FROM public.agent_team_today(p_now) t
      JOIN agent_read.v_time_entries e ON e.employee_id = t.person_id AND e.end_time IS NULL AND e.entry_source IS DISTINCT FROM 'manual'
      JOIN public.time_agent_settings a ON a.employee_id = t.person_id AND a.is_enabled
     WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_time
       AND e.start_time <= p_now AND e.start_time > p_now - interval '48 hours'   -- older timers are TR02's
  LOOP
    -- the web timer writes no activity, and a replay after being offline can arrive late: the grace covers both
    IF r.run_min >= r.need_min
       AND NOT EXISTS (SELECT 1 FROM agent_read.v_activity_domains l WHERE l.employee_id = r.person_id AND l.captured_at >= r.start_time) THEN
      v_sev := CASE WHEN r.run_min >= v_high * 60 THEN 'high' ELSE 'medium' END;
      IF public.agent_raise_flag('TR06', 'track', r.person_id, 'person', r.person_id::text, v_day::text, v_sev, 'Timer running with no tracker evidence',
           format('The timer started at %s has been running for %s minutes and the Track desktop app has captured no activity since it started.',
                  public.agent_fmt_ts(r.start_time, s.timezone), round(r.run_min)),
           jsonb_build_object('entry_id', r.entry_id, 'started_at', r.start_time, 'started_text', public.agent_fmt_ts(r.start_time, s.timezone),
                              'running_minutes', round(r.run_min), 'needed_minutes', r.need_min, 'capture_interval_minutes', r.capture_min, 'person_name', r.full_name),
           'Ask them to check the Track desktop app is open and signed in, or to stop the timer if they are not working.', p_now) THEN v_created := v_created + 1; END IF;
      v_keep := v_keep || r.person_id::text;
    END IF;
  END LOOP;

  -- the timer stopped, activity appeared, or the day is over: close it
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TR06' AND status IN ('open', 'snoozed') AND NOT (period_key = v_day::text AND subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── TR07 Manual time with nothing to back it ───────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tr07(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_tz text; r record; v_a numeric; v_b numeric; v_high numeric; v_sev text; v_why text; v_parts text[];
  v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_tz := s.timezone;
  v_a := public.agent_rule_param('TR07', 'unbacked_minutes', 120);
  v_b := public.agent_rule_param('TR07', 'backdated_minutes', 60);
  v_high := public.agent_rule_param('TR07', 'high_entry_minutes', 360);

  FOR r IN
    WITH m AS (
      -- manual entries added in the last 48 hours; the start_time bound keeps the index in play
      SELECT e.id, e.employee_id, e.created_at,
             greatest(coalesce(e.duration_minutes, extract(epoch FROM (e.end_time - e.start_time)) / 60.0), 0) AS mins,
             public.agent_entry_day(e.start_time, e.entry_source, v_tz) AS d,
             public.agent_entry_day(e.end_time, e.entry_source, v_tz) AS end_d
        FROM agent_read.v_time_entries e
       WHERE e.entry_source = 'manual' AND e.end_time IS NOT NULL
         AND e.created_at >= p_now - interval '48 hours' AND e.created_at <= p_now
         AND e.start_time >= p_now - interval '60 days'
    ), tt AS (   -- who the person is on that day (work expected, placement, exemption)
      SELECT dd.d, t.person_id, t.full_name
        FROM (SELECT DISTINCT d FROM m) dd
        CROSS JOIN LATERAL public.agent_team_today(((dd.d::timestamp + interval '12 hours') AT TIME ZONE v_tz)) t
       WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_time
    ), per_day AS (
      SELECT dy.employee_id, dy.d, tt.full_name, coalesce(ts.is_enabled, false) AS app_on,
             NOT EXISTS (SELECT 1 FROM agent_read.v_activity_domains l WHERE l.employee_id = dy.employee_id
                          AND l.captured_at >= (dy.d::timestamp AT TIME ZONE v_tz) AND l.captured_at < ((dy.d + 1)::timestamp AT TIME ZONE v_tz)) AS no_logs
        FROM (SELECT DISTINCT employee_id, d FROM m) dy
        JOIN tt ON tt.person_id = dy.employee_id AND tt.d = dy.d
        LEFT JOIN public.time_agent_settings ts ON ts.employee_id = dy.employee_id
    ), f AS (
      SELECT m.id, m.employee_id, m.d, m.mins, m.created_at, pd.full_name,
             (pd.app_on AND pd.no_logs AND sum(m.mins) OVER (PARTITION BY m.employee_id, m.d) >= v_a) AS hit_a,
             ((m.created_at AT TIME ZONE v_tz)::date - m.end_d >= 2 AND m.mins >= v_b) AS hit_b
        FROM m JOIN per_day pd ON pd.employee_id = m.employee_id AND pd.d = m.d
    )
    SELECT f.employee_id, f.d, f.full_name, count(*) AS n, sum(f.mins) AS total_min, max(f.mins) AS max_min,
           count(*) FILTER (WHERE f.hit_a) AS n_a, count(*) FILTER (WHERE f.hit_b) AS n_b,
           jsonb_agg(jsonb_build_object('id', f.id, 'minutes', round(f.mins), 'added_at', f.created_at) ORDER BY f.created_at, f.id) AS entries
      FROM f WHERE f.hit_a OR f.hit_b
     GROUP BY f.employee_id, f.d, f.full_name
  LOOP
    v_sev := CASE WHEN r.max_min >= v_high THEN 'high' ELSE 'medium' END;
    v_parts := '{}';
    IF r.n_a > 0 THEN v_parts := v_parts || format('%s on a day with no activity captured by the desktop app', r.n_a); END IF;
    IF r.n_b > 0 THEN v_parts := v_parts || format('%s added more than a day after the work', r.n_b); END IF;
    v_why := format('%s manual time %s (%s) for %s: %s.', r.n, CASE WHEN r.n = 1 THEN 'entry' ELSE 'entries' END, public.agent_hm(r.total_min),
                    to_char(r.d, 'Dy Mon FMDD'), array_to_string(v_parts, '; '));
    IF public.agent_raise_flag('TR07', 'track', r.employee_id, 'person', r.employee_id::text, r.d::text, v_sev, 'Manual time with nothing to back it', v_why,
         jsonb_build_object('day', r.d, 'entries', r.entries, 'count', r.n, 'total_minutes', round(r.total_min), 'total_hours', round(r.total_min / 60.0, 1),
                            'longest_entry_minutes', round(r.max_min), 'no_activity_entries', r.n_a, 'added_late_entries', r.n_b, 'person_name', r.full_name),
         'Ask what the time was for, and for a note on each entry saying what was done.', p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || (r.employee_id::text || '|' || r.d::text);
  END LOOP;

  -- the entry was deleted or changed, or it is now more than 48 hours old: close it
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TR07' AND status IN ('open', 'snoozed') AND NOT ((subject_id || '|' || period_key) = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── TR08 Blocked or unproductive apps ──────────────────────────────────────
-- Native apps only (no website). Websites are TR05's, which ignores Blocked; no site is counted twice.
CREATE OR REPLACE FUNCTION public.agent_rule_tr08(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_start timestamptz; r record; v_unprod_min numeric; v_sev text; v_title text;
  v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  v_start := v_day::timestamp AT TIME ZONE s.timezone;
  v_unprod_min := public.agent_rule_param('TR08', 'unproductive_minutes', 15);

  FOR r IN
    WITH per AS (
      SELECT a.employee_id, coalesce(nullif(btrim(a.app_name), ''), 'Unknown app') AS app,
             count(*) FILTER (WHERE a.productivity_category = 'blocked') AS blocked_n,
             coalesce(sum(coalesce(a.window_seconds, 0)) FILTER (WHERE a.productivity_category = 'blocked'), 0) AS blocked_s,
             coalesce(sum(coalesce(a.window_seconds, 0)) FILTER (WHERE a.productivity_category = 'unproductive'), 0) AS unprod_s
        FROM agent_read.v_activity_domains a
        JOIN public.agent_team_today(p_now) t ON t.person_id = a.employee_id AND t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_time
       WHERE a.captured_at >= v_start AND a.captured_at <= p_now AND a.domain IS NULL
         AND a.productivity_category IN ('blocked', 'unproductive')
       GROUP BY a.employee_id, coalesce(nullif(btrim(a.app_name), ''), 'Unknown app')
    ), ranked AS (
      SELECT p.*, row_number() OVER (PARTITION BY p.employee_id ORDER BY (p.blocked_n > 0) DESC, p.blocked_s + p.unprod_s DESC, p.app) AS rn
        FROM per p
    )
    SELECT k.employee_id, tm.full_name,
           sum(k.blocked_n)::integer AS blocked_n, sum(k.blocked_s)::integer AS blocked_s, sum(k.unprod_s)::integer AS unprod_s,
           count(*) FILTER (WHERE k.blocked_n > 0)::integer AS blocked_apps, count(*)::integer AS app_count,
           (array_agg(k.app ORDER BY k.rn))[1] AS top_app,
           jsonb_agg(jsonb_build_object('app', k.app, 'seconds', k.blocked_s + k.unprod_s, 'category', CASE WHEN k.blocked_n > 0 THEN 'blocked' ELSE 'unproductive' END) ORDER BY k.rn) FILTER (WHERE k.rn <= 8) AS apps,
           string_agg(k.app || ' ' || greatest(1, round((k.blocked_s + k.unprod_s) / 60.0))::int || ' min' || CASE WHEN k.blocked_n > 0 THEN ' (blocked)' ELSE '' END, ', ' ORDER BY k.rn) FILTER (WHERE k.rn <= 3) AS top_list
      FROM ranked k JOIN public.agent_team_v tm ON tm.person_id = k.employee_id
     GROUP BY k.employee_id, tm.full_name
  LOOP
    IF r.blocked_n > 0 OR r.unprod_s >= v_unprod_min * 60 THEN
      v_sev := CASE WHEN r.blocked_n > 0 THEN 'high' ELSE 'medium' END;
      v_title := CASE WHEN r.blocked_n > 0 AND r.blocked_apps = 1 THEN 'Blocked app used: ' || r.top_app
                      WHEN r.blocked_n > 0 THEN 'Blocked apps used (' || r.blocked_apps || ')'
                      WHEN r.app_count = 1 THEN 'Unproductive app: ' || r.top_app
                      ELSE 'Unproductive apps (' || r.app_count || ')' END;
      IF public.agent_raise_flag('TR08', 'track', r.employee_id, 'person', r.employee_id::text, v_day::text, v_sev, v_title,
           'Today: ' || r.top_list || CASE WHEN r.app_count > 3 THEN format(' and %s more', r.app_count - 3) ELSE '' END || '.',
           jsonb_build_object('apps', r.apps, 'blocked_seconds', r.blocked_s, 'unproductive_seconds', r.unprod_s, 'day', v_day, 'person_name', r.full_name),
           'Check the apps and talk to them if it is not work.', p_now) THEN v_created := v_created + 1; END IF;
      v_keep := v_keep || r.employee_id::text;
    END IF;
  END LOOP;

  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TR08' AND status IN ('open', 'snoozed') AND NOT (period_key = v_day::text AND subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── TR09 Hours that do not add up ──────────────────────────────────────────
-- Today and yesterday only. Closed entries only (a running timer is TR02's). Short entries and overlaps are not looked at.
CREATE OR REPLACE FUNCTION public.agent_rule_tr09(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_tz text; v_day date; v_yday date; r record; v_long numeric; v_total numeric; v_leave numeric;
  v_sev text; v_parts text[]; v_why text; v_c_long boolean; v_c_total boolean; v_c_leave boolean;
  v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_tz := s.timezone;
  v_day := (p_now AT TIME ZONE v_tz)::date; v_yday := v_day - 1;
  v_long := public.agent_rule_param('TR09', 'long_entry_minutes', 600);
  v_total := public.agent_rule_param('TR09', 'day_total_minutes', 720);
  v_leave := public.agent_rule_param('TR09', 'leave_minutes', 120);

  FOR r IN
    WITH tt AS (
      SELECT v_day AS d, t.person_id, t.full_name, t.grp, t.expects_work, t.exempt_time FROM public.agent_team_today(((v_day::timestamp + interval '12 hours') AT TIME ZONE v_tz)) t
      UNION ALL
      SELECT v_yday, t.person_id, t.full_name, t.grp, t.expects_work, t.exempt_time FROM public.agent_team_today(((v_yday::timestamp + interval '12 hours') AT TIME ZONE v_tz)) t
    ), ent AS (
      SELECT e.id, e.employee_id, public.agent_entry_day(e.start_time, e.entry_source, v_tz) AS d,
             greatest(coalesce(e.duration_minutes, extract(epoch FROM (e.end_time - e.start_time)) / 60.0), 0) AS mins
        FROM agent_read.v_time_entries e
       WHERE e.end_time IS NOT NULL AND e.start_time >= (v_yday::timestamp AT TIME ZONE v_tz) - interval '1 day'
    ), dy AS (
      SELECT en.employee_id, en.d, sum(en.mins) AS total_min, max(en.mins) AS max_min, count(*) FILTER (WHERE en.mins >= v_long) AS long_n,
             coalesce(jsonb_agg(jsonb_build_object('id', en.id, 'minutes', round(en.mins)) ORDER BY en.mins DESC) FILTER (WHERE en.mins >= v_long), '[]'::jsonb) AS long_entries
        FROM ent en WHERE en.d IN (v_yday, v_day) GROUP BY en.employee_id, en.d
    )
    SELECT dy.*, tt.full_name, tt.expects_work,
           EXISTS (SELECT 1 FROM agent_read.v_leave l WHERE l.employee_id = dy.employee_id AND dy.d BETWEEN l.start_date AND l.end_date AND l.is_half_day IS NOT TRUE) AS on_leave,
           ( extract(isodow FROM dy.d)::integer = ANY (coalesce(tv.working_days, s.default_working_days))
             AND NOT EXISTS (SELECT 1 FROM public.public_holidays h WHERE h.holiday_date = dy.d
                              AND h.country_code = coalesce(tv.country_code, s.default_country_code) AND h.is_observed IS NOT FALSE) ) AS base_working
      FROM dy
      JOIN tt ON tt.person_id = dy.employee_id AND tt.d = dy.d AND coalesce(tt.grp, '') <> 'placement' AND NOT tt.exempt_time
      JOIN public.agent_team_v tv ON tv.person_id = dy.employee_id
  LOOP
    v_c_long := r.expects_work AND r.long_n > 0;
    v_c_total := r.expects_work AND r.total_min >= v_total;
    v_c_leave := r.on_leave AND r.total_min >= v_leave;
    IF v_c_long OR v_c_total OR v_c_leave THEN
      v_parts := '{}';
      IF v_c_long THEN v_parts := v_parts || CASE WHEN r.long_n = 1 THEN format('one entry of %s', public.agent_hm(r.max_min))
                                                  ELSE format('%s entries of %s or more (longest %s)', r.long_n, public.agent_hm(v_long), public.agent_hm(r.max_min)) END; END IF;
      IF v_c_total THEN v_parts := v_parts || format('%s tracked in the day', public.agent_hm(r.total_min)); END IF;
      IF v_c_leave THEN v_parts := v_parts || format('%s tracked on a day of approved leave', public.agent_hm(r.total_min)); END IF;
      v_why := format('Hours on %s do not add up: %s.', to_char(r.d, 'Dy Mon FMDD'), array_to_string(v_parts, '; '));
      v_sev := CASE WHEN v_c_leave AND NOT v_c_long AND NOT v_c_total AND NOT r.base_working THEN 'low' ELSE 'medium' END;
      IF public.agent_raise_flag('TR09', 'track', r.employee_id, 'person', r.employee_id::text, r.d::text, v_sev, 'Hours that do not add up', v_why,
           jsonb_build_object('day', r.d, 'total_minutes', round(r.total_min), 'longest_entry_minutes', round(r.max_min), 'long_entries', r.long_entries,
                              'long_entry', v_c_long, 'day_total', v_c_total, 'on_leave', v_c_leave, 'person_name', r.full_name),
           'Ask them to check the entries and correct any that are wrong.', p_now) THEN v_created := v_created + 1; END IF;
      v_keep := v_keep || (r.employee_id::text || '|' || r.d::text);
    END IF;
  END LOOP;

  -- fixed, no longer today or yesterday: close it
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TR09' AND status IN ('open', 'snoozed') AND NOT ((subject_id || '|' || period_key) = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── TR10 Tracker not set up ────────────────────────────────────────────────
-- One low item per person per ISO week, raised on a day they are expected to work. It stays until the setup is fixed.
CREATE OR REPLACE FUNCTION public.agent_rule_tr10(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_week text; r record; v_reasons text[]; v_codes text[]; v_wd integer;
  v_keep text[] := '{}'; v_hold text[]; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  v_week := to_char(v_day, 'IYYY-"W"IW');

  FOR r IN
    SELECT t.person_id, t.full_name, pr.start_date, (a.employee_id IS NOT NULL) AS has_row, coalesce(a.is_enabled, false) AS is_enabled,
           coalesce(a.screenshots_enabled, false) AS screenshots_enabled, a.app_version, a.last_login_at,
           EXISTS (SELECT 1 FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.entry_source = 'timer'
                    AND e.start_time >= p_now - interval '3 days' AND e.start_time <= p_now) AS timer_3d,
           EXISTS (SELECT 1 FROM agent_read.v_activity_domains l WHERE l.employee_id = t.person_id
                    AND l.captured_at >= p_now - interval '3 days' AND l.captured_at <= p_now) AS logs_3d
      FROM public.agent_team_today(p_now) t
      JOIN public.profiles pr ON pr.id = t.person_id
      LEFT JOIN public.time_agent_settings a ON a.employee_id = t.person_id
     WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_time
  LOOP
    v_reasons := '{}'; v_codes := '{}';
    -- (a) settings missing, or the tracker or screenshots off (the policy is on for everyone)
    IF NOT r.has_row THEN
      v_reasons := v_reasons || 'no desktop tracker settings exist for them'::text; v_codes := v_codes || 'no_settings'::text;
    ELSE
      IF NOT r.is_enabled THEN v_reasons := v_reasons || 'the desktop tracker is switched off for them'::text; v_codes := v_codes || 'tracker_off'::text; END IF;
      IF NOT r.screenshots_enabled THEN v_reasons := v_reasons || 'screenshots are switched off for them'::text; v_codes := v_codes || 'screenshots_off'::text; END IF;
    END IF;
    -- (b) the desktop app was never installed or signed in, more than 3 working days after they started
    IF r.has_row AND r.app_version IS NULL AND r.start_date IS NOT NULL AND v_day > r.start_date THEN
      IF v_day - r.start_date > 30 THEN v_wd := 99;
      ELSE SELECT count(*) INTO v_wd FROM generate_series(1, v_day - r.start_date) g(i) WHERE public.agent_is_working_day(r.start_date + g.i); END IF;
      IF v_wd > 3 THEN
        v_reasons := v_reasons || format('the Track desktop app has not been installed or signed in (they started on %s)', to_char(r.start_date, 'Mon FMDD'));
        v_codes := v_codes || 'app_not_installed'::text;
      END IF;
    END IF;
    -- (c) time tracked with the web timer only: no activity at all and no desktop login for 14 days
    IF r.timer_3d AND NOT r.logs_3d AND (r.last_login_at IS NULL OR r.last_login_at < p_now - interval '14 days') THEN
      v_reasons := v_reasons || 'they tracked time in the last 3 days with the web timer only (no activity captured and no desktop app login in 14 days)'::text;
      v_codes := v_codes || 'web_only'::text;
    END IF;

    IF cardinality(v_reasons) > 0 THEN
      IF public.agent_raise_flag('TR10', 'track', r.person_id, 'person', r.person_id::text, v_week, 'low', 'Tracker not set up',
           format('The time tracker is not set up for %s: %s.', r.full_name, array_to_string(v_reasons, '; ')),
           jsonb_build_object('week', v_week, 'reasons', to_jsonb(v_codes), 'has_settings', r.has_row, 'tracker_enabled', r.is_enabled, 'screenshots_enabled', r.screenshots_enabled,
                              'app_version', r.app_version, 'last_login_at', r.last_login_at, 'person_name', r.full_name),
           'Check their Track tracker settings, and help them install or sign in to the desktop app.', p_now) THEN v_created := v_created + 1; END IF;
      v_keep := v_keep || r.person_id::text;
    END IF;
  END LOOP;

  -- Someone on a day off, or on leave, is not looked at today: their item for the week stays as it is.
  SELECT coalesce(array_agg(person_id::text), '{}') INTO v_hold FROM public.agent_team_today(p_now)
   WHERE NOT expects_work AND coalesce(grp, '') <> 'placement' AND NOT exempt_time;
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TR10' AND status IN ('open', 'snoozed')
                AND NOT (period_key = v_week AND (subject_id = ANY (v_keep) OR subject_id = ANY (v_hold))) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── Inbox links, drafts and detail: the new codes ──────────────────────────
CREATE OR REPLACE FUNCTION public.agent_flag_link(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; s public.agent_settings%ROWTYPE; v_path text; v_person_path text; v_label text; v_table uuid; v_token text;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;

  IF f.evidence ->> 'task_id' ~ '^[0-9a-f-]{36}$' THEN
    v_path := '/task?task=' || (f.evidence ->> 'task_id'); v_person_path := v_path; v_label := 'Open the task';
  ELSIF f.rule_code IN ('RP01', 'RP03') THEN
    v_table := s.report_table_id;
    IF v_table IS NOT NULL THEN
      v_path := '/task/table/' || v_table;
      SELECT token INTO v_token FROM public.tm_forms WHERE table_id = v_table AND is_open ORDER BY created_at LIMIT 1;
      IF v_token IS NOT NULL THEN v_person_path := '/tf/' || v_token; END IF;
    END IF;
    v_label := 'Open the report';
  ELSIF f.rule_code IN ('TR01', 'TR02', 'TR03', 'TR05', 'TR06', 'TR07', 'TR08', 'TR09', 'TR10') THEN
    v_path := '/timesheets'; v_person_path := '/timesheets'; v_label := 'Open Track';
  ELSIF f.rule_code LIKE 'PY%' THEN v_path := '/payroll'; v_label := 'Open Payroll';
  ELSIF f.rule_code LIKE 'BK%' THEN v_path := '/payments'; v_label := 'Open Payments';
  ELSIF f.rule_code LIKE 'LN%' THEN v_path := '/ewa'; v_label := 'Open Earned wage access';
  ELSIF f.rule_code = 'DC01' THEN v_path := '/grievances'; v_label := 'Open Grievances';
  ELSIF f.rule_code = 'DC02' THEN v_path := '/disciplinary'; v_label := 'Open Disciplinary records';
  ELSIF f.rule_code LIKE 'PF%' THEN v_path := '/performance'; v_label := 'Open Performance';
  ELSIF f.rule_code LIKE 'HL%' THEN v_path := '/hr-letters'; v_label := 'Open HR letters';
  ELSIF f.rule_code LIKE 'CT%' THEN v_path := '/contractors'; v_label := 'Open Contractors';
  END IF;
  -- anything else lives in the Inbox itself
  IF v_path IS NULL THEN v_path := '/agent/inbox?flag=' || f.id; v_label := 'Open in the Ops Agent Inbox'; END IF;

  RETURN jsonb_build_object(
    'label', v_label, 'path', v_path, 'url', s.app_url || v_path,
    'person_path', v_person_path, 'person_url', CASE WHEN v_person_path IS NULL THEN NULL ELSE s.app_url || v_person_path END,
    'inbox_url', s.app_url || '/agent/inbox?flag=' || f.id);
END $$;

CREATE OR REPLACE FUNCTION public.agent_flag_draft(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; p public.profiles%ROWTYPE; m public.profiles%ROWTYPE; rec jsonb; v_n integer; v_win integer;
  v_first text; v_link jsonb; v_item text := ''; v_to text := 'person'; v_rcpt public.profiles%ROWTYPE; v_obs text; v_ask text; v_rep text := ''; v_subject text; v_sites text; v_unprod boolean; v_unknown boolean; v_apps text;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = f.person_id;
  SELECT * INTO m FROM public.profiles WHERE id = coalesce(f.manager_id, p.reporting_manager_id);
  rec := public.agent_flag_recurrence(p_flag);
  v_n := (rec ->> 'count_in_window')::int; v_win := (rec ->> 'window_days')::int;

  -- who should hear about it: reviews go to the manager; everything else to the person
  IF f.rule_code IN ('TK08', 'TK13') AND m.id IS NOT NULL THEN v_to := 'manager'; v_rcpt := m; ELSE v_rcpt := p; END IF;
  v_first := coalesce(nullif(split_part(coalesce(v_rcpt.full_name, ''), ' ', 1), ''), 'there');

  v_obs := f.why;
  v_sites := (SELECT string_agg(s ->> 'domain' || ' (about ' || greatest(1, round(((s ->> 'seconds')::numeric) / 60)) || ' min)', ', ')
                FROM (SELECT s FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) s LIMIT 4) q(s));
  v_unprod := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) s WHERE s ->> 'category' = 'unproductive');
  v_unknown := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) s WHERE s ->> 'category' <> 'unproductive');

  v_apps := (SELECT string_agg(a ->> 'app' || ' (about ' || greatest(1, round(((a ->> 'seconds')::numeric) / 60)) || ' min)', ', ')
               FROM (SELECT a FROM jsonb_array_elements(coalesce(f.evidence -> 'apps', '[]'::jsonb)) a LIMIT 4) q(a));

  v_link := public.agent_flag_link(p_flag);
  -- the specific thing, by name, and where to find it (never a vague "a task")
  v_item := CASE
    WHEN f.evidence ->> 'task_title' IS NOT NULL THEN format('Task: "%s"%s', f.evidence ->> 'task_title', CASE WHEN f.evidence ->> 'due_date' IS NOT NULL THEN ' (due ' || to_char((f.evidence ->> 'due_date')::date, 'Mon FMDD') || ')' ELSE '' END)
    WHEN f.rule_code IN ('RP01', 'RP03') THEN 'Daily report for ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'today')
    WHEN f.rule_code = 'TR03' THEN 'Tracked time on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code IN ('TR01', 'TR02') THEN 'Your timer: ' || f.title
    WHEN f.rule_code = 'TR06' THEN 'Your timer, started at ' || coalesce(f.evidence ->> 'started_text', 'earlier')
    WHEN f.rule_code = 'TR07' THEN 'Manual time on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code = 'TR08' THEN 'Apps used on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code = 'TR09' THEN 'Tracked time on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code = 'TR10' THEN 'Time tracker setup, week ' || f.period_key
    ELSE '' END;

  v_ask := CASE f.rule_code
    WHEN 'TR01' THEN 'Please start your timer, or let me know if you are in a meeting or away from your desk.'
    WHEN 'TR02' THEN 'Please check whether that timer is still running by mistake and stop it if so.'
    WHEN 'TR03' THEN 'Could you tell me what got in the way, and whether any of that work was tracked somewhere else?'
    WHEN 'TR05' THEN CASE
        WHEN v_unprod AND v_unknown THEN 'Some of these look personal and some I do not recognise. If any of it was for work, tell me what it is for and I will add it to our list; otherwise please keep work time for work.'
        WHEN v_unprod THEN 'These look personal. Please keep work time for work; if any of it was for a work reason, tell me what it was.'
        ELSE 'Was this for work? If it was, tell me what it is used for and I will add it to our approved list so it does not come up again.' END
    WHEN 'TR06' THEN 'Your timer is running but the Track desktop app has captured nothing since it started. Please check the app is open and signed in, or stop the timer if you are not working.'
    WHEN 'TR07' THEN 'Could you tell me what this time was for, and why it was added afterwards? Please add a note to each entry saying what was done.'
    WHEN 'TR08' THEN CASE WHEN coalesce((f.evidence ->> 'blocked_seconds')::numeric, 0) > 0
        THEN 'Some of these apps are blocked on work time. Please stop using them; if there was a work reason, tell me what it was.'
        ELSE 'These do not look like work. Please keep work time for work; if any of it was for a work reason, tell me what it was.' END
    WHEN 'TR09' THEN 'Please check this time and correct anything that is wrong. If it is right, tell me what it covers.'
    WHEN 'TR10' THEN 'Your time tracker is not fully set up. Please make sure the Track desktop app is installed and signed in on the computer you work on. If something is stopping you, tell me and we will sort it out.'
    WHEN 'TK01' THEN 'Please add an update in the task comments with when it will be finished. Due dates are not moved once set.'
    WHEN 'TK02' THEN 'Due dates are not moved once set. Please explain the change in the task comments so it is on record.'
    WHEN 'TK04' THEN 'What is blocking it, and who can clear it? Please say so in the task comments.'
    WHEN 'TK05' THEN 'Please add a short update in the task comments on where it stands.'
    WHEN 'TK06' THEN 'You have no open tasks at the moment. Please check with your manager for what to pick up next.'
    WHEN 'TK07' THEN 'Please add a description that says what needs doing and what success looks like.'
    WHEN 'TK08' THEN 'Please review it and either move it to Complete or say what is missing.'
    WHEN 'TK11' THEN 'Is anything stopping you from starting? Please tell me today so we can fix it.'
    WHEN 'TK13' THEN 'Please review it and either move it to Complete or say what is missing.'
    WHEN 'TK14' THEN 'Thank you, nice work.'
    WHEN 'RP01' THEN 'Please send your daily report now.'
    WHEN 'RP03' THEN 'Please send your report today, and tell me what is making them hard to send so we can fix it.'
    ELSE 'Please let me know what is happening.' END;

  IF v_to = 'manager' THEN
    v_obs := format('%s''s task is ready for you. %s', coalesce(p.full_name, 'A team member'), f.why);
  ELSIF f.rule_code = 'TR05' AND v_sites IS NOT NULL THEN
    v_obs := format('I noticed time on %s today.', v_sites);
  ELSIF f.rule_code = 'TR08' AND v_apps IS NOT NULL THEN
    v_obs := format('I noticed time in %s today.', v_apps);
  END IF;

  IF v_n >= 2 AND f.rule_code <> 'TK14' AND v_to = 'person' THEN
    v_rep := format('This is the %s time in the last %s days that this has come up, so I wanted to raise it with you directly.', public.agent_ordinal(v_n), v_win);
    IF v_n >= 3 THEN v_rep := v_rep || ' If it keeps happening I will need to take it up with your manager.'; END IF;
  END IF;

  v_subject := left(f.title, 120);
  RETURN jsonb_build_object(
    'to', v_to, 'recipient_name', v_rcpt.full_name, 'recipient_email', v_rcpt.email, 'recipient_id', v_rcpt.id, 'subject', v_subject,
    'link', v_link,
    'body', 'Hi ' || v_first || E',\n\n' || v_obs
      || CASE WHEN v_item <> '' THEN E'\n\n' || v_item ELSE '' END
      || CASE WHEN v_link ->> 'person_url' IS NOT NULL THEN E'\nOpen it here: ' || (v_link ->> 'person_url') ELSE '' END
      || E'\n\n' || v_ask || CASE WHEN v_rep <> '' THEN E'\n\n' || v_rep ELSE '' END || E'\n\nThank you,\nKD Squares Operations');
END $$;

CREATE OR REPLACE FUNCTION public.agent_flag_detail(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; s public.agent_settings%ROWTYPE; p public.profiles%ROWTYPE; m public.profiles%ROWTYPE;
  v_day date; v_person jsonb := NULL; v_today jsonb := NULL; v_sites jsonb := '[]'::jsonb; v_tracked numeric; v_tracker jsonb := NULL;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (now() AT TIME ZONE s.timezone)::date;

  IF f.person_id IS NOT NULL THEN
    SELECT * INTO p FROM public.profiles WHERE id = f.person_id;
    SELECT * INTO m FROM public.profiles WHERE id = coalesce(f.manager_id, p.reporting_manager_id);
    v_person := jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'photo_url', p.photo_url, 'job_title', p.job_title,
      'manager', CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id', m.id, 'full_name', m.full_name, 'photo_url', m.photo_url) END);
    SELECT coalesce(sum(coalesce(e.duration_minutes, extract(epoch FROM (now() - e.start_time)) / 60.0)), 0) INTO v_tracked
      FROM agent_read.v_time_entries e WHERE e.employee_id = f.person_id AND (e.start_time AT TIME ZONE s.timezone)::date = v_day;
    v_today := jsonb_build_object(
      'tracked_minutes', round(v_tracked),
      'tracking_now', EXISTS (SELECT 1 FROM agent_read.v_time_entries e WHERE e.employee_id = f.person_id AND e.end_time IS NULL),
      'open_tasks', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.assignee_id = f.person_id AND t.status <> 'done' AND t.parent_id IS NULL),
      'overdue_tasks', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.assignee_id = f.person_id AND t.status <> 'done' AND t.parent_id IS NULL AND t.due_date < v_day),
      'reported_today', f.person_id IN (SELECT public.agent_report_submitters(v_day)),
      'on_leave', EXISTS (SELECT 1 FROM agent_read.v_leave l WHERE l.employee_id = f.person_id AND v_day BETWEEN l.start_date AND l.end_date));
  END IF;

  IF f.rule_code = 'TR05' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'domain', x.domain, 'seconds', x.seconds, 'category', x.category,
             'list', (SELECT d.category FROM public.agent_domain_list d WHERE d.domain = x.domain AND d.company_id IS NULL AND d.team IS NULL LIMIT 1),
             'hint', public.agent_site_hint(x.domain),
             'days_seen', (SELECT count(DISTINCT (a.captured_at AT TIME ZONE s.timezone)::date) FROM agent_read.v_activity_domains a
                            WHERE a.employee_id = f.person_id AND a.domain = x.domain AND a.captured_at > now() - interval '30 days'),
             'team_users', (SELECT count(DISTINCT a.employee_id) FROM agent_read.v_activity_domains a WHERE a.domain = x.domain AND a.captured_at > now() - interval '14 days'))
           ORDER BY x.seconds DESC), '[]'::jsonb)
      INTO v_sites
      FROM (SELECT e ->> 'domain' AS domain, (e ->> 'seconds')::int AS seconds, e ->> 'category' AS category
              FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) e WHERE e ->> 'domain' IS NOT NULL) x;
  END IF;

  -- the tracking rules: what the desktop tracker looks like for this person (counts and dates only, never a URL or a title)
  IF f.rule_code IN ('TR06', 'TR07', 'TR08', 'TR09', 'TR10') AND f.person_id IS NOT NULL THEN
    SELECT jsonb_build_object('app_enabled', a.is_enabled, 'screenshots_enabled', a.screenshots_enabled, 'app_version', a.app_version,
                              'last_login_at', a.last_login_at, 'capture_interval_minutes', a.capture_interval_minutes)
      INTO v_tracker FROM public.time_agent_settings a WHERE a.employee_id = f.person_id;
    v_tracker := coalesce(v_tracker, '{}'::jsonb) || jsonb_build_object(
      'has_settings', v_tracker IS NOT NULL,
      'activity_captures_today', (SELECT count(*) FROM agent_read.v_activity_domains l WHERE l.employee_id = f.person_id AND l.captured_at >= v_day::timestamp AT TIME ZONE s.timezone),
      'last_activity_at', (SELECT max(l.captured_at) FROM agent_read.v_activity_domains l WHERE l.employee_id = f.person_id AND l.captured_at >= now() - interval '7 days'));
  END IF;

  RETURN jsonb_build_object(
    'flag', jsonb_build_object('id', f.id, 'rule_code', f.rule_code, 'severity', f.severity, 'status', f.status, 'title', f.title, 'why', f.why,
      'evidence', f.evidence, 'suggested_action', f.suggested_action, 'occurrence_count', f.occurrence_count, 'escalation_level', f.escalation_level,
      'first_seen_at', f.first_seen_at, 'last_seen_at', f.last_seen_at, 'resolution_note', f.resolution_note, 'snoozed_until', f.snoozed_until,
      'subject_type', f.subject_type, 'subject_id', f.subject_id, 'period_key', f.period_key, 'item_type', f.item_type),
    'person', v_person,
    'today', v_today,
    'recurrence', public.agent_flag_recurrence(p_flag),
    'link', public.agent_flag_link(p_flag),
    'sites', v_sites,
    'tracker', v_tracker,
    'draft', CASE WHEN f.item_type = 'flag' AND f.status IN ('open', 'snoozed') THEN public.agent_flag_draft(p_flag) ELSE NULL END,
    'timeline', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ev.kind, 'at', ev.created_at, 'actor', a.full_name, 'detail', ev.detail) ORDER BY ev.created_at DESC), '[]'::jsonb)
                   FROM public.agent_flag_events ev LEFT JOIN public.profiles a ON a.id = ev.actor_id WHERE ev.flag_id = f.id),
    'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', mm.id, 'channel', mm.channel, 'status', mm.status, 'body', mm.body, 'recipient', mm.recipient_label, 'sent_at', mm.sent_at, 'error', mm.error) ORDER BY mm.created_at DESC), '[]'::jsonb)
                   FROM public.agent_messages mm WHERE mm.flag_id = f.id));
END $$;

-- ── The rules, switched on ─────────────────────────────────────────────────
-- Thresholds in params are the defaults and can be changed in Settings; a re-run keeps any change.
INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('TR06', 'track', 'Timer running with no tracker evidence', 'A timer has been running for 45 minutes or more (longer if the app captures less often) with the desktop app on and nothing captured since it started. High at 3 hours.', true, 'medium', '{"grace_minutes": 45, "high_hours": 3}', 'ready'),
  ('TR07', 'track', 'Manual time with nothing to back it', 'Manual time added in the last 48 hours: 2 hours or more on a day with no captured activity (desktop app on), or added more than a day after the work and 1 hour or more long. High if one entry is 6 hours or more.', true, 'medium', '{"unbacked_minutes": 120, "backdated_minutes": 60, "high_entry_minutes": 360}', 'ready'),
  ('TR08', 'track', 'Blocked or unproductive apps', 'Time in a desktop app (not a website) marked Blocked or Unproductive today. High for any Blocked app, medium for 15 minutes or more of Unproductive apps. Websites are covered by Unexpected sites.', true, 'medium', '{"unproductive_minutes": 15}', 'ready'),
  ('TR09', 'track', 'Hours that do not add up', 'Today or yesterday: one finished entry of 10 hours or more, a day total of 12 hours or more, or 2 hours or more tracked on a day of approved leave.', true, 'medium', '{"long_entry_minutes": 600, "day_total_minutes": 720, "leave_minutes": 120}', 'ready'),
  ('TR10', 'track', 'Tracker not set up', 'Once a week per person: the desktop tracker or screenshots are off, the app was never installed more than 3 working days after they started, or time is tracked on the web only.', true, 'low', '{}', 'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, module_key = EXCLUDED.module_key, severity = EXCLUDED.severity, status = 'ready';

REVOKE ALL ON FUNCTION public.agent_entry_day(timestamptz, text, text),
  public.agent_rule_tr06(timestamptz), public.agent_rule_tr07(timestamptz), public.agent_rule_tr08(timestamptz), public.agent_rule_tr09(timestamptz), public.agent_rule_tr10(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_entry_day(timestamptz, text, text),
  public.agent_rule_tr06(timestamptz), public.agent_rule_tr07(timestamptz), public.agent_rule_tr08(timestamptz), public.agent_rule_tr09(timestamptz), public.agent_rule_tr10(timestamptz)
  TO service_role;
REVOKE ALL ON FUNCTION public.agent_flag_link(uuid), public.agent_flag_draft(uuid), public.agent_flag_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_flag_link(uuid), public.agent_flag_draft(uuid), public.agent_flag_detail(uuid) TO authenticated, service_role;
