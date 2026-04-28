-- batch_items has a FK to payment_batches(id) but no index on the FK column.
-- Every batch detail page does: SELECT * FROM batch_items WHERE batch_id = $1
-- which becomes a full-table seq-scan without this index.
CREATE INDEX IF NOT EXISTS idx_batch_items_batch_id ON public.batch_items (batch_id);
