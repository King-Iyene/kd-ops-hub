-- Two industry-standard webhook patterns (Stripe, GitHub, Svix all do both;
-- see the research behind this pass) that the retry system from
-- 20261220500000 was missing:
--
-- 1. Idempotency key. Once a delivery can be attempted more than once (which
--    retries already do, and manual replay below adds a second way to),
--    receivers need a stable ID to dedupe on. Stripe's #1 webhook
--    integration bug report is "we double-processed an event" — their fix
--    is including event.id in every payload and telling receivers to key on
--    it. Ours had no equivalent: a receiver had no way to tell attempt 2 of
--    the same delivery apart from a genuinely new event.
--
-- 2. Manual replay. Every mature webhook platform lets an operator resend a
--    SPECIFIC past delivery on demand (e.g. after fixing a receiver bug) —
--    distinct from the automatic retry schedule, and shouldn't consume or
--    reset that schedule's attempt budget.

-- root_delivery_id: set once at first-attempt time and copied forward by
-- every retry row, so every attempt at delivering the SAME logical event
-- shares one stable id — that id is what's embedded as `id` in the JSON
-- payload actually sent to the receiver (see webhook-dispatcher /
-- webhook-retry-worker). Backfill existing rows to reference themselves —
-- each is currently the only row in its own "chain".
ALTER TABLE nc_meta.webhook_deliveries
  ADD COLUMN IF NOT EXISTS root_delivery_id UUID,
  ADD COLUMN IF NOT EXISTS is_replay BOOLEAN NOT NULL DEFAULT false;

UPDATE nc_meta.webhook_deliveries SET root_delivery_id = id WHERE root_delivery_id IS NULL;

ALTER TABLE nc_meta.webhook_deliveries ALTER COLUMN root_delivery_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_root ON nc_meta.webhook_deliveries (root_delivery_id);
