-- Task module: tables are for admins only, and Home gets a custom date range.
--
-- 1. Tables (their fields, rows and forms) can now only be seen and edited
--    by admins and super admins. Shared form links keep working for
--    everyone: tm_form_load / tm_form_person_tasks / tm_form_submit are
--    SECURITY DEFINER and check the form's own access setting.
--    tm_set_record_cell and tm_my_records run as the caller, so they follow
--    these policies too (members' "My records" card is retired in the app).

DROP POLICY IF EXISTS tm_tables_select ON public.tm_tables;
CREATE POLICY tm_tables_select ON public.tm_tables FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS tm_table_fields_select ON public.tm_table_fields;
CREATE POLICY tm_table_fields_select ON public.tm_table_fields FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS tm_table_records_select ON public.tm_table_records;
CREATE POLICY tm_table_records_select ON public.tm_table_records FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS tm_table_records_write ON public.tm_table_records;
CREATE POLICY tm_table_records_write ON public.tm_table_records FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS tm_forms_select ON public.tm_forms;
CREATE POLICY tm_forms_select ON public.tm_forms FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'));

-- 2. Home: a "custom" date range with its own start and end, saved with the
--    rest of the person's Home layout.
ALTER TABLE public.tm_home_layouts ADD COLUMN IF NOT EXISTS range_from date;
ALTER TABLE public.tm_home_layouts ADD COLUMN IF NOT EXISTS range_to date;
ALTER TABLE public.tm_home_layouts DROP CONSTRAINT IF EXISTS tm_home_layouts_date_range_check;
ALTER TABLE public.tm_home_layouts ADD CONSTRAINT tm_home_layouts_date_range_check
  CHECK (date_range IN ('all', 'week', 'month', 'last30', 'custom'));
ALTER TABLE public.tm_home_layouts DROP CONSTRAINT IF EXISTS tm_home_layouts_custom_range_check;
ALTER TABLE public.tm_home_layouts ADD CONSTRAINT tm_home_layouts_custom_range_check
  CHECK (date_range <> 'custom' OR (range_from IS NOT NULL AND range_to IS NOT NULL AND range_from <= range_to));
