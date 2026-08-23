-- =============================================================================
-- Backfill columns dropped by migration-history drift
--
-- 20261028000000_pay_schedules_phase1_extended_cadences.sql is recorded as
-- applied in production's migration history, but its DDL never actually
-- landed: pay_schedules was missing schedule_kind, linked_schedule_id, and
-- allowance_context (confirmed directly against production via
-- information_schema — the frequency CHECK constraint was also still the
-- original 4-value version).
--
-- This is why the "Pay schedule" setup checklist showed unchecked despite a
-- schedule existing: PayrollSchedules.tsx's load() selects these columns,
-- so the query errored and schedules stayed empty, while NextPayrollBanner's
-- simpler select('id, name') query succeeded and found the schedule fine.
--
-- This migration backfills ONLY the missing columns. It deliberately does
-- NOT touch the frequency CHECK constraint or next_pay_dates()/
-- schedule_auto_draft(): production's versions of those functions have
-- evolved independently of the 20261028000000 migration file (see
-- 20261125000010's notes on migration/production drift) and only support
-- the original 4 cadences. Widening the constraint to accept the 5 extra
-- cadences the frontend UI already offers (bimonthly/quarterly/triannual/
-- biannual/annual) without matching next_pay_dates() support is a separate,
-- larger feature gap — tracked separately, not fixed here.
-- =============================================================================

ALTER TABLE pay_schedules
  ADD COLUMN IF NOT EXISTS schedule_kind text NOT NULL DEFAULT 'regular'
    CHECK (schedule_kind IN ('regular', 'off_cycle'));

ALTER TABLE pay_schedules
  ADD COLUMN IF NOT EXISTS linked_schedule_id uuid REFERENCES pay_schedules(id),
  ADD COLUMN IF NOT EXISTS allowance_context text;
