-- Office chat: kudos. A kudos is a public thank-you to one person, shown as a card in the everyone channel.
-- Anyone in the office can give one (announcements stay admin-only). Additive: existing messages are unchanged.
alter table public.office_messages drop constraint if exists office_messages_kind_check;
alter table public.office_messages add constraint office_messages_kind_check check (kind in ('text', 'announcement', 'kudos'));

-- a kudos goes to the everyone channel, names exactly one person, and says something
alter table public.office_messages drop constraint if exists office_messages_kudos_check;
alter table public.office_messages add constraint office_messages_kudos_check
  check (kind <> 'kudos' or (to_id is null and cardinality(mentions) = 1 and char_length(body) >= 3));

drop policy if exists office_messages_insert on public.office_messages;
create policy office_messages_insert on public.office_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (to_id is not null or exists (select 1 from public.office_member_ids() m(id) where m.id = auth.uid()))
    and (kind in ('text', 'kudos') or public.office_is_admin())
  );
