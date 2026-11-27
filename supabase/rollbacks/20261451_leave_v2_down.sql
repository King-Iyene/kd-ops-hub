-- Rolls back 20261451000000_leave_v2.sql. The leave screens fall back to the
-- old direct-update behaviour only if the old build is deployed; the timeline,
-- balance history and the leave_* functions are removed. Leave requests and
-- balances themselves are untouched. The relaxed leave_type check is left relaxed.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_events') then
    alter publication supabase_realtime drop table public.leave_events;
  end if;
end $$;
drop trigger if exists leave_after_insert_trg on public.leave_requests;
drop trigger if exists leave_after_status_change_trg on public.leave_requests;
drop function if exists public.leave_after_insert();
drop function if exists public.leave_after_status_change();
drop function if exists public.leave_adjust_balance(uuid, integer, text, numeric, text);
drop function if exists public.leave_add_note(uuid, text);
drop function if exists public.leave_delete(uuid, text);
drop function if exists public.leave_record(uuid, text, date, date, boolean, text, text, boolean);
drop function if exists public.leave_revert(uuid, text);
drop function if exists public.leave_cancel(uuid, text);
drop function if exists public.leave_edit(uuid, text, date, date, boolean, text, text, boolean);
drop function if exists public.leave_review(uuid, text, text, boolean);
drop function if exists public.leave_submit(text, date, date, boolean, text);
drop function if exists public.leave_check_dates(date, date, boolean);
drop function if exists public.leave_assert_no_overlap(uuid, date, date, uuid);
drop function if exists public.leave_describe(uuid);
drop function if exists public.leave_notify_admins(text, text, uuid);
drop function if exists public.leave_notify(uuid, text, text, text);
drop function if exists public.leave_log_event(uuid, text, text, text, text, jsonb);
drop function if exists public.leave_move_balance(uuid, integer, text, numeric, numeric);
drop function if exists public.leave_annual_quota(uuid, integer);
drop function if exists public.leave_used_column(text);
drop function if exists public.leave_accrued_days(numeric, integer, date);
drop function if exists public.leave_working_days(date, date, boolean);
drop function if exists public.leave_whos_away(date, date);
delete from public.email_templates where key = 'leave.update';
drop function if exists public.leave_caller_is_admin();
drop table if exists public.leave_balance_adjustments;
drop table if exists public.leave_events;
-- extra columns on leave_requests are left in place (harmless, may hold data)
