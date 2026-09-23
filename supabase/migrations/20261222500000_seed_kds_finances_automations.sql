-- Phase 5: Seed the 4 KDS Finances automations from the Airtable originals.
-- Looks up tables and fields by name within the "KDS Finances" base.
-- Idempotent: skips if automations with these names already exist on the table.

DO $$
DECLARE
  v_base_id   uuid;
  v_income_id uuid;
  v_expense_id uuid;
  v_profit_id uuid;
  -- Income fields
  v_income_payment_status uuid;
  v_income_profit_link    uuid;
  -- Expense fields
  v_expense_paid_done     uuid;
  v_expense_profit_link   uuid;
  -- Profit fields (link columns that reference Income / Expenses)
  v_profit_income_link    uuid;
  v_profit_expense_link   uuid;
BEGIN
  -- ── 1. Resolve base ────────────────────────────────────────────────────────
  SELECT id INTO v_base_id
    FROM nc_meta.bases
   WHERE name = 'KDS Finances'
   LIMIT 1;

  IF v_base_id IS NULL THEN
    RAISE NOTICE 'seed_automations: KDS Finances base not found — skipping';
    RETURN;
  END IF;

  -- ── 2. Resolve tables ─────────────────────────────────────────────────────
  SELECT id INTO v_income_id
    FROM nc_meta.tables
   WHERE base_id = v_base_id AND name ILIKE '%Income%' AND name NOT ILIKE '%copy%' AND name NOT ILIKE '%WIP%'
   ORDER BY created_at ASC LIMIT 1;

  SELECT id INTO v_expense_id
    FROM nc_meta.tables
   WHERE base_id = v_base_id AND name ILIKE '%Expense%' AND name NOT ILIKE '%copy%' AND name NOT ILIKE '%WIP%' AND name NOT ILIKE '%Submission%'
   ORDER BY created_at ASC LIMIT 1;

  SELECT id INTO v_profit_id
    FROM nc_meta.tables
   WHERE base_id = v_base_id AND name ILIKE '%Profit%'
   ORDER BY created_at ASC LIMIT 1;

  IF v_income_id IS NULL OR v_expense_id IS NULL OR v_profit_id IS NULL THEN
    RAISE NOTICE 'seed_automations: one or more tables not found (income=%, expense=%, profit=%) — skipping',
      v_income_id, v_expense_id, v_profit_id;
    RETURN;
  END IF;

  -- ── 3. Resolve key fields ─────────────────────────────────────────────────
  -- Income → "Payment Status"
  SELECT id INTO v_income_payment_status
    FROM nc_meta.fields
   WHERE table_id = v_income_id AND name ILIKE '%Payment Status%'
   LIMIT 1;

  -- Income → link to Profit table ("[WIP] KDS Profit" or "Income-Profit Link")
  SELECT id INTO v_income_profit_link
    FROM nc_meta.fields
   WHERE table_id = v_income_id AND (name ILIKE '%Profit%' OR name ILIKE '%Income-Profit%')
   ORDER BY (CASE WHEN name ILIKE '%Income-Profit%' THEN 0 ELSE 1 END) ASC
   LIMIT 1;

  -- Expenses → "Paid/Done"
  SELECT id INTO v_expense_paid_done
    FROM nc_meta.fields
   WHERE table_id = v_expense_id AND name ILIKE '%Paid%'
   LIMIT 1;

  -- Expenses → link to Profit table
  SELECT id INTO v_expense_profit_link
    FROM nc_meta.fields
   WHERE table_id = v_expense_id AND name ILIKE '%Profit%'
   LIMIT 1;

  -- Profit → Income link
  SELECT id INTO v_profit_income_link
    FROM nc_meta.fields
   WHERE table_id = v_profit_id AND name ILIKE '%Income%'
   LIMIT 1;

  -- Profit → Expenses link
  SELECT id INTO v_profit_expense_link
    FROM nc_meta.fields
   WHERE table_id = v_profit_id AND name ILIKE '%Expense%'
   LIMIT 1;

  -- ── 4. Insert automations (skip if name already exists on the table) ──────

  -- ▸ Automation 1: Income → Profit  (ENABLED)
  --   Trigger: record_matches_conditions on Income where Payment Status = 'Paid'
  --   Action:  update_record on the master Profit record, linking this income row
  IF v_income_payment_status IS NOT NULL AND v_income_profit_link IS NOT NULL THEN
    INSERT INTO nc_meta.automations (base_id, table_id, name, enabled, trigger_type, trigger_config, actions)
    SELECT v_base_id, v_income_id,
           'Income → Profit Calculation',
           true,
           'record_matches_conditions',
           jsonb_build_object(
             'conditions', jsonb_build_array(
               jsonb_build_object('field_id', v_income_payment_status::text, 'operator', 'equals', 'value', 'Paid')
             ),
             'logic', 'AND'
           ),
           jsonb_build_array(
             jsonb_build_object(
               'id', gen_random_uuid()::text,
               'type', 'update_record',
               'config', jsonb_build_object(
                 'field_id', v_income_profit_link::text,
                 'value', '{{record.id}}'
               )
             )
           )
    WHERE NOT EXISTS (
      SELECT 1 FROM nc_meta.automations
       WHERE table_id = v_income_id AND name = 'Income → Profit Calculation'
    );
    RAISE NOTICE 'seed_automations: Income → Profit Calculation: done';
  END IF;

  -- ▸ Automation 2: Expense → Profit  (ENABLED)
  --   Trigger: record_matches_conditions on Expenses where Paid/Done is not empty
  --   Action:  update_record on the master Profit record, linking this expense row
  IF v_expense_paid_done IS NOT NULL AND v_expense_profit_link IS NOT NULL THEN
    INSERT INTO nc_meta.automations (base_id, table_id, name, enabled, trigger_type, trigger_config, actions)
    SELECT v_base_id, v_expense_id,
           'Expense → Profit Calculation',
           true,
           'record_matches_conditions',
           jsonb_build_object(
             'conditions', jsonb_build_array(
               jsonb_build_object('field_id', v_expense_paid_done::text, 'operator', 'is_not_empty', 'value', '')
             ),
             'logic', 'AND'
           ),
           jsonb_build_array(
             jsonb_build_object(
               'id', gen_random_uuid()::text,
               'type', 'update_record',
               'config', jsonb_build_object(
                 'field_id', v_expense_profit_link::text,
                 'value', '{{record.id}}'
               )
             )
           )
    WHERE NOT EXISTS (
      SELECT 1 FROM nc_meta.automations
       WHERE table_id = v_expense_id AND name = 'Expense → Profit Calculation'
    );
    RAISE NOTICE 'seed_automations: Expense → Profit Calculation: done';
  END IF;

  -- ▸ Automation 3: Journal Entry Script  (DISABLED — placeholder)
  --   In Airtable this was a scripting automation; stored here as a webhook stub
  DECLARE
    v_journal_id uuid;
  BEGIN
    SELECT id INTO v_journal_id
      FROM nc_meta.tables
     WHERE base_id = v_base_id AND name ILIKE '%Journal Entry%' AND name NOT ILIKE '%Sample%'
     LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      INSERT INTO nc_meta.automations (base_id, table_id, name, enabled, trigger_type, trigger_config, actions)
      SELECT v_base_id, v_journal_id,
             'Journal Entry Script',
             false,
             'record_created',
             '{}'::jsonb,
             jsonb_build_array(
               jsonb_build_object(
                 'id', gen_random_uuid()::text,
                 'type', 'send_notification',
                 'config', jsonb_build_object(
                   'message', 'New journal entry created — review for Zoho import'
                 )
               )
             )
      WHERE NOT EXISTS (
        SELECT 1 FROM nc_meta.automations
         WHERE table_id = v_journal_id AND name = 'Journal Entry Script'
      );
      RAISE NOTICE 'seed_automations: Journal Entry Script: done';
    END IF;
  END;

  -- ▸ Automation 4: Automation 1  (DISABLED — generic notification)
  --   In Airtable this was the first unnamed automation; stored as a notification stub
  INSERT INTO nc_meta.automations (base_id, table_id, name, enabled, trigger_type, trigger_config, actions)
  SELECT v_base_id, v_income_id,
         'Automation 1 (from Airtable)',
         false,
         'record_updated',
         '{}'::jsonb,
         jsonb_build_array(
           jsonb_build_object(
             'id', gen_random_uuid()::text,
             'type', 'send_notification',
             'config', jsonb_build_object(
               'message', 'Income record updated'
             )
           )
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM nc_meta.automations
     WHERE table_id = v_income_id AND name = 'Automation 1 (from Airtable)'
  );
  RAISE NOTICE 'seed_automations: Automation 1 (from Airtable): done';

END $$;
