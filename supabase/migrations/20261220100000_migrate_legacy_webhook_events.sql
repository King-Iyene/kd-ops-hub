-- Migrate legacy webhook rows that have data in the scalar `event` column
-- but an empty/null `events` array. The webhook-dispatcher only queries the
-- `events` array column, so legacy rows were invisible.

UPDATE nc_meta.webhooks
SET events = ARRAY[event]
WHERE event IS NOT NULL
  AND event != ''
  AND (events IS NULL OR array_length(events, 1) IS NULL);
