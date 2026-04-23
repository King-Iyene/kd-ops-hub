-- The live database has start_date / end_date columns on budgets (added via
-- Supabase Studio directly, not tracked in migrations). Add them idempotently
-- so the table definition matches what the app now sends.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date   date;

-- Backfill from existing period_start / period_end values.
UPDATE public.budgets
  SET start_date = period_start,
      end_date   = period_end
WHERE start_date IS NULL OR end_date IS NULL;

-- Keep them in sync going forward via a simple trigger so both column sets
-- always match (code can write to either pair).
CREATE OR REPLACE FUNCTION public.sync_budget_date_aliases()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Whichever pair is written, propagate to the other.
  IF NEW.period_start IS DISTINCT FROM OLD.period_start OR
     NEW.start_date   IS DISTINCT FROM OLD.start_date THEN
    NEW.start_date   := COALESCE(NEW.start_date,   NEW.period_start);
    NEW.period_start := COALESCE(NEW.period_start, NEW.start_date);
  END IF;
  IF NEW.period_end IS DISTINCT FROM OLD.period_end OR
     NEW.end_date   IS DISTINCT FROM OLD.end_date THEN
    NEW.end_date   := COALESCE(NEW.end_date,   NEW.period_end);
    NEW.period_end := COALESCE(NEW.period_end, NEW.end_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_budget_dates ON public.budgets;
CREATE TRIGGER trg_sync_budget_dates
  BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_budget_date_aliases();
