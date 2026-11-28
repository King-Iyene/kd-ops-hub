-- Run after the migration, inside something that rolls back (the block ends with an exception that carries the result).
DO $t$
DECLARE o text := ''; ow uuid; sa uuid; ot uuid; n int;
BEGIN
  SELECT owner_profile_id INTO ow FROM public.crew_settings WHERE id;
  SELECT id INTO sa FROM public.profiles WHERE role = 'super_admin' AND id <> ow AND status = 'active' ORDER BY created_at LIMIT 1; -- another super admin
  SELECT id INTO ot FROM public.profiles WHERE role <> 'super_admin' AND status = 'active' ORDER BY created_at LIMIT 1; -- an ordinary employee
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.crew_agents; o := o || 'owner_sees=' || n || '; ';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.crew_agents; o := o || 'other_super_admin_sees=' || n || '; ';
  BEGIN PERFORM public.crew_set_office_viewers(ARRAY[ot]); o := o || 'FAIL other super admin changed viewers; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok only the owner can change viewers; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ot, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.crew_agents; o := o || 'employee_sees_default=' || n || '; ';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.crew_set_office_viewers(ARRAY[ot]);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ot, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.crew_agents; o := o || 'employee_sees_when_allowed=' || n || '; ';
  RAISE EXCEPTION 'TESTRESULT: %', o;
END $t$;
