-- Ops Agent: a read-only audit of the daily report table, for Super Admins and Admins (it changes nothing).
--
--   SELECT public.agent_report_audit();            -- today, Eastern
--   SELECT public.agent_report_audit('2026-11-19');
--
-- It answers "why does Reports in say 1 of 8?" with facts: which table and fields are read, how many rows there are per day (by the Report Date
-- and by the day they were added), and for the chosen day each row with its Report Date value, who it names and who added it. Names only, no
-- amounts, bank details or report text.
--
-- Rollback: DROP FUNCTION public.agent_report_audit(date);

CREATE OR REPLACE FUNCTION public.agent_report_audit(p_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_setting text; v_person text; v_date text; v_fields jsonb; v_by_day jsonb; v_rows jsonb; v_table text;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := coalesce(p_day, (now() AT TIME ZONE s.timezone)::date);
  IF s.report_table_id IS NULL THEN RETURN jsonb_build_object('error', 'No daily report table is chosen in Agent Settings.'); END IF;
  SELECT t.name, t.report_date_field INTO v_table, v_setting FROM public.tm_tables t WHERE t.id = s.report_table_id;
  SELECT f.id::text INTO v_person FROM agent_read.v_report_fields f WHERE f.type = 'person' ORDER BY f.position LIMIT 1;
  IF v_setting IS DISTINCT FROM 'created_at' THEN
    SELECT f.id::text INTO v_date FROM agent_read.v_report_fields f WHERE f.type = 'date' AND (v_setting IS NULL OR f.id::text = v_setting) ORDER BY f.position LIMIT 1;
    IF v_date IS NULL AND v_setting IS NOT NULL THEN
      SELECT f.id::text INTO v_date FROM agent_read.v_report_fields f WHERE f.type = 'date' ORDER BY f.position LIMIT 1;
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'type', f.type) ORDER BY f.position), '[]'::jsonb) INTO v_fields FROM agent_read.v_report_fields f;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'day' DESC), '[]'::jsonb) INTO v_by_day FROM (
    SELECT jsonb_build_object('day', d.day, 'rows_by_report_date', count(*) FILTER (WHERE d.by_date = d.day), 'rows_added_that_day', count(*) FILTER (WHERE d.added = d.day)) AS x
      FROM (SELECT g::date AS day FROM generate_series(v_day - 6, v_day, interval '1 day') g) days
      LEFT JOIN LATERAL (
        SELECT coalesce(public.agent_safe_date(left(r.data ->> v_date, 10)), (r.created_at AT TIME ZONE s.timezone)::date) AS by_date,
               (r.created_at AT TIME ZONE s.timezone)::date AS added, days.day AS day
          FROM agent_read.v_report_rows r) d ON true
     GROUP BY days.day, d.day) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'added_at', r.created_at, 'report_date_value', r.data ->> v_date,
           'counted_for_day', coalesce(public.agent_safe_date(left(r.data ->> v_date, 10)), (r.created_at AT TIME ZONE s.timezone)::date) = v_day,
           'person_value', r.data -> v_person,
           'names', (SELECT coalesce(jsonb_agg(p.full_name), '[]'::jsonb) FROM profiles p WHERE p.id::text IN (
                       SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.data -> v_person) = 'array' THEN r.data -> v_person
                                                             WHEN jsonb_typeof(r.data -> v_person) = 'string' THEN jsonb_build_array(r.data -> v_person) ELSE '[]'::jsonb END))),
           'added_by', (SELECT p.full_name FROM profiles p WHERE p.id = r.created_by)) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (SELECT * FROM agent_read.v_report_rows rr
           WHERE (rr.created_at AT TIME ZONE s.timezone)::date = v_day
              OR coalesce(public.agent_safe_date(left(rr.data ->> v_date, 10)), (rr.created_at AT TIME ZONE s.timezone)::date) = v_day
           ORDER BY rr.created_at DESC LIMIT 60) r;

  RETURN jsonb_build_object('day', v_day, 'table', v_table, 'date_field', v_date, 'person_field', v_person, 'fields', v_fields,
                            'last_7_days', v_by_day, 'rows_for_the_day', v_rows,
                            'people_counted', (SELECT count(*) FROM public.agent_report_submitters(v_day)));
END $$;
REVOKE ALL ON FUNCTION public.agent_report_audit(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_report_audit(date) TO authenticated, service_role;
