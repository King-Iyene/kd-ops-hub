-- Undo 20261444_office_kudos: kudos messages are removed, then the old rules come back.
delete from public.office_messages where kind = 'kudos';
alter table public.office_messages drop constraint if exists office_messages_kudos_check;
alter table public.office_messages drop constraint if exists office_messages_kind_check;
alter table public.office_messages add constraint office_messages_kind_check check (kind in ('text', 'announcement'));
drop policy if exists office_messages_insert on public.office_messages;
create policy office_messages_insert on public.office_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (to_id is not null or exists (select 1 from public.office_member_ids() m(id) where m.id = auth.uid()))
    and (kind = 'text' or public.office_is_admin())
  );
