-- Extend payment_batches with batch type and extra metadata.
-- batch_type values: 'contractor' | 'employee_salary' | 'advance' | 'prize' | 'mixed'
ALTER TABLE payment_batches
  ADD COLUMN IF NOT EXISTS batch_type     text    DEFAULT 'contractor',
  ADD COLUMN IF NOT EXISTS advance_reason text,
  ADD COLUMN IF NOT EXISTS bonus_type     text;

-- Extend batch_items to track whether a line item is for an employee.
-- contractor_id stays for contractor items; employee_id for employee items.
ALTER TABLE batch_items
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_type   text DEFAULT 'contractor';

COMMENT ON COLUMN payment_batches.batch_type     IS 'contractor | employee_salary | advance | prize | mixed';
COMMENT ON COLUMN payment_batches.advance_reason IS 'Reason for advance payments';
COMMENT ON COLUMN payment_batches.bonus_type     IS 'Performance Bonus | 13th Month | Christmas Bonus | etc.';
COMMENT ON COLUMN batch_items.employee_id        IS 'Set when line item is an employee payment';
COMMENT ON COLUMN batch_items.item_type          IS 'contractor | employee | adhoc';
