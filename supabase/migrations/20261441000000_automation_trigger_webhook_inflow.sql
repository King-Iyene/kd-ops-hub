-- The automation screen offers a "Webhook received" trigger (webhook_inflow) but the check on
-- nc_meta.automations.trigger_type does not list it, so saving such an automation is refused by the database.
-- Add it to the list. Existing rows are unaffected (every current value stays allowed).

alter table nc_meta.automations drop constraint if exists automations_trigger_type_check;

alter table nc_meta.automations
  add constraint automations_trigger_type_check
  check (trigger_type = any (array[
    'record_created',
    'record_updated',
    'record_deleted',
    'field_changed',
    'scheduled',
    'record_matches_conditions',
    'webhook_inflow'
  ]::text[]));
