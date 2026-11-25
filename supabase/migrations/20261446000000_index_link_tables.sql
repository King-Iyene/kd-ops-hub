-- Every link between two records lives in a junction table (jn_*, or *_jn for links made inside KDOps), and every
-- lookup of a record's links filters that table by source_id or target_id. None of them had an index on either
-- column, so each lookup read the whole table (up to ~6,700 rows today, growing with the data).
--
-- Add the two indexes to every existing junction table. They are small tables, so each index builds in
-- milliseconds. New junction tables get the same indexes from the ddl-executor function when they are created.

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname like 'nc\_%'
      and n.nspname <> 'nc_meta'
      and (c.relname like 'jn\_%' or c.relname like '%\_jn')
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'source_id' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'target_id' and not a.attisdropped)
  loop
    execute format('create index if not exists %I on %I.%I (source_id)', left(r.table_name || '_source_id_idx', 63), r.schema_name, r.table_name);
    execute format('create index if not exists %I on %I.%I (target_id)', left(r.table_name || '_target_id_idx', 63), r.schema_name, r.table_name);
  end loop;
end $$;
