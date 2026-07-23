-- ─────────────────────────────────────────────────────────────────
-- Snapshot the operator's narration override so the batch-worker
-- edge function can honor it during automatic dispatch.
--
-- Previously the worker only received batch.name and hard-coded the
-- Paystack /transfer `reason` to "KDOps · {batch.name}" (batch-worker
-- line 171). The operator's typed "What recipients will see" input
-- was captured client-side (BatchDetail.tsx line 706) but never
-- reached the worker, so batches that fell through to worker dispatch
-- showed the batch name on the bank statement instead of the note.
--
-- Frontend now writes the operator's text into this column before
-- kicking off dispatch; the worker reads it and falls back to the
-- previous default only when null/blank.
--
-- Payment-flow impact: none. This column is only read to build the
-- display string on the recipient's bank statement — not for routing,
-- amounts, recipient resolution, retries, or state transitions.
--
-- Length capped at 100 chars to match the frontend + worker's
-- defensive slice(0, 100) and Paystack's practical limit.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS payment_narration_at_dispatch text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_batches_narration_length_chk'
  ) THEN
    ALTER TABLE public.payment_batches
      ADD CONSTRAINT payment_batches_narration_length_chk
      CHECK (
        payment_narration_at_dispatch IS NULL
        OR char_length(payment_narration_at_dispatch) <= 100
      );
  END IF;
END $$;

COMMENT ON COLUMN public.payment_batches.payment_narration_at_dispatch IS
  'Operator override for the Paystack transfer `reason` field. Written by BatchDetail.tsx right before dispatch; read by the batch-worker edge function. Null means fall back to "KDOps · {batch.name}". Max 100 chars.';
