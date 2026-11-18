-- Task Module v2 Phase 3: one helper RPC for editing a single table cell.
--
-- A plain client-side read-modify-write on tm_table_records.data (fetch the
-- row, merge in one key, write the whole jsonb object back) would let two
-- people editing different cells of the same record at the same time
-- silently clobber each other's edit — whichever write lands second wins
-- and the other's change is gone with no error. jsonb_set applied inside a
-- single UPDATE is atomic at the row level, so concurrent cell edits on
-- different fields of the same record never race.
--
-- No SECURITY DEFINER: runs as the calling (authenticated) role, so the
-- existing tm_table_records RLS policy still applies to the UPDATE inside.
CREATE OR REPLACE FUNCTION public.tm_set_record_cell(p_record_id uuid, p_field_id uuid, p_value jsonb)
RETURNS public.tm_table_records
LANGUAGE sql
AS $$
  UPDATE public.tm_table_records
  SET data = jsonb_set(data, ARRAY[p_field_id::text], p_value, true)
  WHERE id = p_record_id
  RETURNING *;
$$;
