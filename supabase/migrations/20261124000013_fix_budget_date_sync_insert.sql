-- Fix: sync_budget_date_aliases() referenced OLD on INSERT, which is
-- undefined in PL/pgSQL — causing an error on every budget creation.
-- On INSERT, always propagate between the two column pairs.
-- On UPDATE, only propagate when a value actually changed.

CREATE OR REPLACE FUNCTION public.sync_budget_date_aliases()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.start_date   := COALESCE(NEW.start_date,   NEW.period_start);
    NEW.period_start := COALESCE(NEW.period_start, NEW.start_date);
    NEW.end_date     := COALESCE(NEW.end_date,     NEW.period_end);
    NEW.period_end   := COALESCE(NEW.period_end,   NEW.end_date);
  ELSE
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
  END IF;
  RETURN NEW;
END;
$$;
