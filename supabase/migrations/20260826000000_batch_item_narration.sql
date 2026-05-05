-- Per-item narration column on batch_items
--
-- Why this exists:
--   Before today the receipt printed `batch.description || batch.notes` while
--   the narration actually sent to Paystack came from the operator-edited
--   text in PaymentSummaryModal. The two strings could (and did) diverge,
--   producing receipts that disagreed with what recipients saw on their
--   bank statements.
--
--   Worse, retries fell back to a per-item template (with the recipient name
--   appended) so half a batch could land with one narration and the other
--   half with another. Persisting the exact string sent per item makes the
--   receipt WYSIWYG and keeps retries consistent.

ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS narration text;

COMMENT ON COLUMN public.batch_items.narration IS
  'The narration string sent to Paystack as the transfer reason. Mirrored
   onto the receipt so the operator sees exactly what the recipient saw.';
