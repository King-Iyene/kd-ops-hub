-- Add 'record_matches_conditions' trigger type to automations
ALTER TABLE nc_meta.automations
  DROP CONSTRAINT IF EXISTS automations_trigger_type_check;

ALTER TABLE nc_meta.automations
  ADD CONSTRAINT automations_trigger_type_check
  CHECK (trigger_type IN (
    'record_created',
    'record_updated',
    'record_deleted',
    'field_changed',
    'scheduled',
    'record_matches_conditions'
  ));
