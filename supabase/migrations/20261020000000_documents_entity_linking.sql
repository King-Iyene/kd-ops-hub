-- Extend documents table with entity linking, folders, and versioning
-- so documents can be tagged to clients, employees, projects, vehicles, etc.

-- Entity linking columns
alter table documents add column if not exists entity_type text;
alter table documents add column if not exists entity_id uuid;
alter table documents add column if not exists folder text;
alter table documents add column if not exists is_template boolean default false;
alter table documents add column if not exists version integer default 1;
alter table documents add column if not exists parent_document_id uuid references documents(id);
alter table documents add column if not exists status text default 'active';
alter table documents add column if not exists last_accessed_at timestamptz;
alter table documents add column if not exists access_count integer default 0;

-- Index for fast entity lookups
create index if not exists idx_documents_entity on documents(entity_type, entity_id) where deleted_at is null;
create index if not exists idx_documents_folder on documents(folder) where deleted_at is null;
create index if not exists idx_documents_status on documents(status) where deleted_at is null;

-- Document folders table for organizing
create table if not exists document_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references document_folders(id),
  color text default '#6366f1',
  icon text default 'folder',
  description text,
  entity_type text,
  entity_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table document_folders enable row level security;

create policy "document_folders_select" on document_folders for select to authenticated using (true);
create policy "document_folders_insert" on document_folders for insert to authenticated
  with check (
    (select role from profiles where id = auth.uid()) in ('super_admin','admin','finance','operations')
  );
create policy "document_folders_update" on document_folders for update to authenticated
  using (
    (select role from profiles where id = auth.uid()) in ('super_admin','admin')
    or created_by = auth.uid()
  );
create policy "document_folders_delete" on document_folders for delete to authenticated
  using (
    (select role from profiles where id = auth.uid()) in ('super_admin','admin')
  );
