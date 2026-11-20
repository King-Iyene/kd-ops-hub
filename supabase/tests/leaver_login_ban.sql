-- =============================================================================
-- S2: leaver login ban (20261430000000_leaver_login_ban.sql)
--
-- Run AFTER the migration on the local replay database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/leaver_login_ban.sql
-- Everything is rolled back. Needs public.profiles, public.audit_logs and auth.users.
--
-- What this proves
--   1  active -> inactive bans the sign-in (banned_until = infinity)
--   2  inactive -> active lifts it
--   3  a super_admin is never banned: the status still changes, an audit row says the ban was skipped
--   4  'invited' is never banned, and cancelling an invite for someone with no auth row does not fail
--   5  a manual time-limited ban is not lifted by a reactivation, and is made permanent by a deactivation
--   6  an UPDATE that does not change the status leaves auth.users alone
--   7  a profile inserted already inactive is banned
--   8  if the ban cannot be written the status change still goes through, and an audit row says so
--   9  the trigger function is not callable by signed-in users
-- =============================================================================
BEGIN;

-- the minimal replay database has no banned_until; the real auth.users does (no-op there)
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;

CREATE FUNCTION public.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF;
END $$;
CREATE FUNCTION public.t_ban(p_id uuid) RETURNS timestamptz LANGUAGE sql AS $$ SELECT banned_until FROM auth.users WHERE id = p_id $$;

-- ── Fixture ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'sue@t.local'),
  ('b0000000-0000-0000-0000-000000000002', 'olu@t.local'),
  ('b0000000-0000-0000-0000-000000000003', 'ife@t.local'),
  ('b0000000-0000-0000-0000-000000000004', 'tade@t.local'),
  ('b0000000-0000-0000-0000-000000000005', 'zed@t.local');
INSERT INTO public.profiles (id, email, full_name, role, status) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'sue@t.local',  'Sue Super', 'super_admin', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'olu@t.local',  'Olu',       'field_staff', 'active'),
  ('b0000000-0000-0000-0000-000000000003', 'ife@t.local',  'Ife',       'operations',  'active'),
  ('b0000000-0000-0000-0000-000000000004', 'tade@t.local', 'Tade',      'finance',     'active'),
  ('b0000000-0000-0000-0000-000000000005', 'zed@t.local',  'Zed',       'field_staff', 'active');

-- ── 1 + 2. deactivate bans, reactivate lifts ───────────────────────────────
DO $$
BEGIN
  PERFORM public.t_eq('nobody is banned to start with', (SELECT count(*) FROM auth.users WHERE banned_until IS NOT NULL), 0::bigint);
  UPDATE public.profiles SET status = 'inactive' WHERE id = 'b0000000-0000-0000-0000-000000000002';
  PERFORM public.t_eq('inactive is banned for good', public.t_ban('b0000000-0000-0000-0000-000000000002'), 'infinity'::timestamptz);
  PERFORM public.t_eq('only that person', (SELECT count(*) FROM auth.users WHERE banned_until IS NOT NULL), 1::bigint);
  UPDATE public.profiles SET status = 'active' WHERE id = 'b0000000-0000-0000-0000-000000000002';
  PERFORM public.t_eq('reactivated: the ban is lifted', public.t_ban('b0000000-0000-0000-0000-000000000002'), NULL::timestamptz);
  RAISE NOTICE 'PASS 1+2: deactivate bans, reactivate lifts';
END $$;

-- ── 3. a super_admin is never banned ───────────────────────────────────────
DO $$
BEGIN
  UPDATE public.profiles SET status = 'inactive' WHERE id = 'b0000000-0000-0000-0000-000000000001';
  PERFORM public.t_eq('the status still changed', (SELECT status FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000001'), 'inactive');
  PERFORM public.t_eq('but the super_admin is not banned', public.t_ban('b0000000-0000-0000-0000-000000000001'), NULL::timestamptz);
  PERFORM public.t_eq('and the skip is in the audit log', (SELECT count(*) FROM public.audit_logs WHERE action_type = 'leaver_login_ban_skipped' AND description LIKE '%sue@t.local%'), 1::bigint);
  UPDATE public.profiles SET status = 'active' WHERE id = 'b0000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'PASS 3: super_admin is never banned';
END $$;

-- ── 4. invited is never banned; cancelling an invite with no auth row works ─
DO $$
BEGIN
  UPDATE public.profiles SET status = 'invited' WHERE id = 'b0000000-0000-0000-0000-000000000003';
  PERFORM public.t_eq('invited is not banned', public.t_ban('b0000000-0000-0000-0000-000000000003'), NULL::timestamptz);
  UPDATE public.profiles SET status = 'active' WHERE id = 'b0000000-0000-0000-0000-000000000003';
  -- a placeholder profile (invite not accepted: no auth.users row) cancelled
  INSERT INTO public.profiles (id, email, full_name, role, status) VALUES ('b0000000-0000-0000-0000-0000000000f1', 'ghost@t.local', 'Ghost', 'field_staff', 'invited');
  UPDATE public.profiles SET status = 'inactive' WHERE id = 'b0000000-0000-0000-0000-0000000000f1';
  PERFORM public.t_eq('the cancelled invite is inactive', (SELECT status FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-0000000000f1'), 'inactive');
  RAISE NOTICE 'PASS 4: invited is not banned, no auth row is fine';
END $$;

-- ── 5. manual time-limited ban ─────────────────────────────────────────────
DO $$
BEGIN
  UPDATE auth.users SET banned_until = now() + interval '30 days' WHERE id = 'b0000000-0000-0000-0000-000000000004';
  UPDATE public.profiles SET status = 'inactive' WHERE id = 'b0000000-0000-0000-0000-000000000004';
  PERFORM public.t_eq('a deactivation makes a short ban permanent', public.t_ban('b0000000-0000-0000-0000-000000000004'), 'infinity'::timestamptz);
  UPDATE public.profiles SET status = 'active' WHERE id = 'b0000000-0000-0000-0000-000000000004';
  PERFORM public.t_eq('and a reactivation lifts it', public.t_ban('b0000000-0000-0000-0000-000000000004'), NULL::timestamptz);
  UPDATE auth.users SET banned_until = now() + interval '30 days' WHERE id = 'b0000000-0000-0000-0000-000000000004';
  UPDATE public.profiles SET status = 'invited' WHERE id = 'b0000000-0000-0000-0000-000000000004';
  UPDATE public.profiles SET status = 'active'  WHERE id = 'b0000000-0000-0000-0000-000000000004';
  PERFORM public.t_eq('a ban set by hand (not infinity) survives a move to active', public.t_ban('b0000000-0000-0000-0000-000000000004') IS NOT NULL, true);
  UPDATE auth.users SET banned_until = NULL WHERE id = 'b0000000-0000-0000-0000-000000000004';
  RAISE NOTICE 'PASS 5: manual bans';
END $$;

-- ── 6. an update that does not change the status leaves auth.users alone ───
DO $$
BEGIN
  UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = 'b0000000-0000-0000-0000-000000000005';
  UPDATE public.profiles SET full_name = 'Zed Renamed', status = status WHERE id = 'b0000000-0000-0000-0000-000000000005';
  PERFORM public.t_eq('same status: the manual ban is untouched', public.t_ban('b0000000-0000-0000-0000-000000000005') < now() + interval '2 days', true);
  UPDATE auth.users SET banned_until = NULL WHERE id = 'b0000000-0000-0000-0000-000000000005';
  RAISE NOTICE 'PASS 6: no status change, no write';
END $$;

-- ── 7. inserted already inactive ───────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0000-000000000006', 'new@t.local');
  INSERT INTO public.profiles (id, email, full_name, role, status) VALUES ('b0000000-0000-0000-0000-000000000006', 'new@t.local', 'New', 'field_staff', 'inactive');
  PERFORM public.t_eq('inserted inactive is banned', public.t_ban('b0000000-0000-0000-0000-000000000006'), 'infinity'::timestamptz);
  RAISE NOTICE 'PASS 7: insert as inactive';
END $$;

-- ── 8. a failing ban never blocks the status change ────────────────────────
CREATE FUNCTION public.t_block_ban() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test: auth.users is read-only'; END $$;
CREATE TRIGGER t_block_ban BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.t_block_ban();
DO $$
BEGIN
  UPDATE public.profiles SET status = 'inactive' WHERE id = 'b0000000-0000-0000-0000-000000000005';
  PERFORM public.t_eq('the status change went through', (SELECT status FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000005'), 'inactive');
  PERFORM public.t_eq('and the failure is in the audit log', (SELECT count(*) FROM public.audit_logs WHERE action_type = 'leaver_login_ban_failed' AND description LIKE '%zed@t.local%'), 1::bigint);
  RAISE NOTICE 'PASS 8: failure does not block';
END $$;
DROP TRIGGER t_block_ban ON auth.users;

-- ── 9. not callable by signed-in users ─────────────────────────────────────
DO $$
BEGIN
  PERFORM public.t_eq('authenticated cannot execute it', has_function_privilege('authenticated', 'public.sync_leaver_login_ban()', 'EXECUTE'), false);
  PERFORM public.t_eq('anon cannot execute it', has_function_privilege('anon', 'public.sync_leaver_login_ban()', 'EXECUTE'), false);
  PERFORM public.t_eq('it is a security definer', (SELECT prosecdef FROM pg_proc WHERE oid = 'public.sync_leaver_login_ban()'::regprocedure), true);
  RAISE NOTICE 'PASS 9: function privileges';
END $$;

ROLLBACK;
SELECT 'ok' AS leaver_login_ban;
