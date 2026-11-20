-- =============================================================================
-- Platform fixes S3 (scheduled campaigns), S4 (payment_batches.updated_at) and S6 (screenshot files)
--
-- Run AFTER migrations 20261431000000, 20261431000100 and 20261431000200 (and the earlier migrations they build on):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/platform_s3_s4_s6.sql
-- Everything is rolled back.
--
-- What this proves
--   1  claim_campaign_for_sending / claim_message_campaign_for_sending: a draft and a DUE scheduled campaign are claimed
--      exactly once; a future-scheduled, sending, sent or cancelled campaign is not; only service_role may call them
--   2  payment_batches.updated_at exists, is NOT NULL, starts at now(), is bumped by an update that changes nothing
--      else, and is what the BK01/BK02 read path (to_jsonb(pb) ->> 'updated_at') now returns instead of created_at
--   3  deleting a time_screenshots row (directly, or through the retention cascade from time_activity_logs) queues its
--      file for removal, once; nothing is queued for a row that still exists
--   4  timetrack_orphan_screenshot_objects lists bucket objects that have no row, leaves out referenced and very recent
--      ones, and is service_role only; the queue is not readable by app roles
-- =============================================================================
BEGIN;

CREATE FUNCTION public.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF;
END $$;
CREATE FUNCTION public.t_as(p_role text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  IF p_role IS NOT NULL THEN EXECUTE format('SET ROLE %I', p_role); END IF;
END $$;
CREATE FUNCTION public.t_denied(p_sql text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL: % was allowed', p_label;
EXCEPTION WHEN insufficient_privilege THEN RETURN;
END $$;
GRANT EXECUTE ON FUNCTION public.t_eq(text, anyelement, anyelement), public.t_as(text), public.t_denied(text, text) TO PUBLIC;

-- ── 1. campaign claims ─────────────────────────────────────────────────────
DO $$
DECLARE
  c_draft uuid := gen_random_uuid(); c_due uuid := gen_random_uuid(); c_future uuid := gen_random_uuid();
  c_sending uuid := gen_random_uuid(); c_sent uuid := gen_random_uuid(); c_cancelled uuid := gen_random_uuid();
  m_due uuid := gen_random_uuid(); m_future uuid := gen_random_uuid(); m_draft uuid := gen_random_uuid(); m_sending uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.email_campaigns (id, subject, html_body, status, scheduled_for) VALUES
    (c_draft,     's', 'b', 'draft',     NULL),
    (c_due,       's', 'b', 'scheduled', now() - interval '1 minute'),
    (c_future,    's', 'b', 'scheduled', now() + interval '1 hour'),
    (c_sending,   's', 'b', 'sending',   now() - interval '1 hour'),
    (c_sent,      's', 'b', 'sent',      NULL),
    (c_cancelled, 's', 'b', 'cancelled', now() - interval '1 hour');
  INSERT INTO public.message_campaigns (id, channel, message, status, scheduled_for) VALUES
    (m_draft,   'sms', 'hi', 'draft',     NULL),
    (m_due,     'sms', 'hi', 'scheduled', now() - interval '1 minute'),
    (m_future,  'sms', 'hi', 'scheduled', now() + interval '1 hour'),
    (m_sending, 'sms', 'hi', 'sending',   now() - interval '1 hour');

  PERFORM public.t_eq('email draft is claimed',                 public.claim_campaign_for_sending(c_draft), true);
  PERFORM public.t_eq('email draft is not claimed twice',       public.claim_campaign_for_sending(c_draft), false);
  PERFORM public.t_eq('email due scheduled is claimed',         public.claim_campaign_for_sending(c_due), true);
  PERFORM public.t_eq('email due scheduled is not claimed twice', public.claim_campaign_for_sending(c_due), false);
  PERFORM public.t_eq('email future scheduled is not claimed',  public.claim_campaign_for_sending(c_future), false);
  PERFORM public.t_eq('email already sending is not claimed',   public.claim_campaign_for_sending(c_sending), false);
  PERFORM public.t_eq('email sent is not claimed',              public.claim_campaign_for_sending(c_sent), false);
  PERFORM public.t_eq('email cancelled is not claimed',         public.claim_campaign_for_sending(c_cancelled), false);
  PERFORM public.t_eq('claimed due campaign is now sending, with a start time',
    (SELECT status || ':' || (started_at IS NOT NULL)::text FROM public.email_campaigns WHERE id = c_due), 'sending:true');
  PERFORM public.t_eq('future campaign is untouched', (SELECT status FROM public.email_campaigns WHERE id = c_future), 'scheduled');

  PERFORM public.t_eq('sms draft is claimed',                public.claim_message_campaign_for_sending(m_draft), true);
  PERFORM public.t_eq('sms due scheduled is claimed',        public.claim_message_campaign_for_sending(m_due), true);
  PERFORM public.t_eq('sms due scheduled not claimed twice', public.claim_message_campaign_for_sending(m_due), false);
  PERFORM public.t_eq('sms future scheduled is not claimed', public.claim_message_campaign_for_sending(m_future), false);
  PERFORM public.t_eq('sms already sending is not claimed',  public.claim_message_campaign_for_sending(m_sending), false);
  PERFORM public.t_eq('unknown campaign is not claimed',     public.claim_message_campaign_for_sending(gen_random_uuid()), false);

  -- only the edge functions (service role) may claim; a signed-in user must not be able to flip anyone's campaign
  PERFORM public.t_as('authenticated');
  PERFORM public.t_denied(format('SELECT public.claim_campaign_for_sending(%L)', c_future), 'authenticated claiming an email campaign');
  PERFORM public.t_denied(format('SELECT public.claim_message_campaign_for_sending(%L)', m_future), 'authenticated claiming an sms campaign');
  PERFORM public.t_as('anon');
  PERFORM public.t_denied(format('SELECT public.claim_campaign_for_sending(%L)', c_future), 'anon claiming an email campaign');
  PERFORM public.t_as(NULL);
  RAISE NOTICE 'PASS 1: campaign claims';
END $$;

-- ── 2. payment_batches.updated_at ──────────────────────────────────────────
DO $$
DECLARE v_id uuid := gen_random_uuid(); v_ins timestamptz; v_upd timestamptz; v_row public.payment_batches;
BEGIN
  PERFORM public.t_eq('updated_at exists and is NOT NULL',
    (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_batches' AND column_name = 'updated_at'), 'NO');
  PERFORM public.t_eq('the set_updated_at trigger is attached',
    (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.payment_batches'::regclass AND tgname = 'set_updated_at' AND NOT tgisinternal), 1::bigint);

  INSERT INTO public.payment_batches (id, name, payment_date, status, created_at) VALUES (v_id, 'T', current_date, 'processing', now() - interval '3 hours');
  SELECT updated_at INTO v_ins FROM public.payment_batches WHERE id = v_id;
  PERFORM public.t_eq('a new row starts with updated_at = now(), not created_at', v_ins > now() - interval '1 minute', true);

  -- the clock the BK01/BK02 rules read (20261412000000): to_jsonb(pb) ->> 'updated_at', else created_at
  SELECT * INTO v_row FROM public.payment_batches WHERE id = v_id;
  PERFORM public.t_eq('the rules read updated_at, not created_at',
    coalesce(nullif(to_jsonb(v_row) ->> 'updated_at', '')::timestamptz, v_row.created_at) > now() - interval '1 minute', true);

  -- an update that changes nothing but a note moves updated_at; status, amount and created_at do not move
  UPDATE public.payment_batches SET updated_at = now() - interval '2 hours' WHERE id = v_id;   -- trigger overrides this
  SELECT updated_at INTO v_upd FROM public.payment_batches WHERE id = v_id;
  PERFORM public.t_eq('the trigger sets updated_at on every update', v_upd > now() - interval '1 minute', true);
  PERFORM public.t_eq('status and created_at are untouched',
    (SELECT status || ':' || (created_at < now() - interval '2 hours')::text FROM public.payment_batches WHERE id = v_id), 'processing:true');
  RAISE NOTICE 'PASS 2: payment_batches.updated_at';
END $$;

-- ── 3. screenshot files are queued when their row goes ─────────────────────
DO $$
DECLARE
  e uuid := 'b0000000-0000-0000-0000-000000000001'; lg uuid := gen_random_uuid();
  p_keep text := 'b0000000-0000-0000-0000-000000000001/1000.jpg';
  p_direct text := 'b0000000-0000-0000-0000-000000000001/2000.jpg';
  p_cascade text := 'b0000000-0000-0000-0000-000000000001/3000.jpg';
BEGIN
  INSERT INTO public.time_activity_logs (id, employee_id) VALUES (lg, e);
  INSERT INTO public.time_screenshots (employee_id, activity_log_id, storage_path) VALUES
    (e, NULL, p_keep), (e, NULL, p_direct), (e, lg, p_cascade);
  PERFORM public.t_eq('nothing queued while the rows exist', (SELECT count(*) FROM public.storage_delete_queue), 0::bigint);

  DELETE FROM public.time_screenshots WHERE storage_path = p_direct;
  PERFORM public.t_eq('a deleted row queues its file',
    (SELECT bucket FROM public.storage_delete_queue WHERE path = p_direct), 'timetrack-screenshots');

  -- the retention path: purge_old_activity_logs deletes the log, the screenshot row cascades
  DELETE FROM public.time_activity_logs WHERE id = lg;
  PERFORM public.t_eq('the retention cascade queues the file', (SELECT count(*) FROM public.storage_delete_queue WHERE path = p_cascade), 1::bigint);
  PERFORM public.t_eq('a row that still exists is never queued', (SELECT count(*) FROM public.storage_delete_queue WHERE path = p_keep), 0::bigint);

  -- a second delete of the same path (re-uploaded and removed again) does not make a second queue row
  INSERT INTO public.time_screenshots (employee_id, activity_log_id, storage_path) VALUES (e, NULL, p_direct);
  DELETE FROM public.time_screenshots WHERE storage_path = p_direct;
  PERFORM public.t_eq('queue rows are unique per file', (SELECT count(*) FROM public.storage_delete_queue WHERE path = p_direct), 1::bigint);

  PERFORM public.t_as('authenticated');
  PERFORM public.t_denied('SELECT count(*) FROM public.storage_delete_queue', 'authenticated reading the queue');
  PERFORM public.t_as(NULL);
  RAISE NOTICE 'PASS 3: screenshot queue';
END $$;

-- ── 4. orphan listing ──────────────────────────────────────────────────────
DO $$
DECLARE
  e text := 'b0000000-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO public.time_screenshots (employee_id, activity_log_id, storage_path) VALUES ('b0000000-0000-0000-0000-000000000002', NULL, e || '/ref.jpg');
  INSERT INTO storage.objects (bucket_id, name, created_at) VALUES
    ('timetrack-screenshots', e || '/ref.jpg',    now() - interval '30 days'),   -- has a row
    ('timetrack-screenshots', e || '/orphan.jpg', now() - interval '30 days'),   -- no row
    ('timetrack-screenshots', e || '/new.jpg',    now() - interval '1 hour'),    -- no row yet, but just uploaded
    ('other-bucket',          e || '/other.jpg',  now() - interval '30 days');   -- not ours

  PERFORM public.t_as('service_role');
  PERFORM public.t_eq('only the old unreferenced file in our bucket is an orphan',
    (SELECT array_agg(name) FROM public.timetrack_orphan_screenshot_objects(1000, interval '2 days') WHERE name LIKE e || '/%'), ARRAY[e || '/orphan.jpg']);
  PERFORM public.t_eq('the limit is honoured', (SELECT count(*) FROM public.timetrack_orphan_screenshot_objects(0, interval '2 days')), 0::bigint);
  PERFORM public.t_as('authenticated');
  PERFORM public.t_denied('SELECT * FROM public.timetrack_orphan_screenshot_objects()', 'authenticated listing orphans');
  PERFORM public.t_as(NULL);
  RAISE NOTICE 'PASS 4: orphan listing';
END $$;

ROLLBACK;
SELECT 'ok' AS platform_s3_s4_s6;
