-- =============================================================================
-- New TimeCamp-equivalent Expenses module: schema (categories + expenses),
-- an employee submission flow, and an admin approval flow. Mirrors the
-- time_approvals (timesheet approval) and attendance-selfie storage patterns
-- already established in this codebase.
-- =============================================================================

CREATE TABLE public.time_expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.time_expense_categories (name) VALUES
  ('Travel'), ('Meals'), ('Office supplies'), ('Software'), ('Client entertainment'), ('Other');

CREATE TABLE public.time_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.time_projects(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.time_clients(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.time_expense_categories(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  expense_date date NOT NULL DEFAULT current_date,
  description text,
  is_billable boolean NOT NULL DEFAULT false,
  receipt_path text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_expenses_employee_idx ON public.time_expenses(employee_id, expense_date);
CREATE INDEX time_expenses_status_idx ON public.time_expenses(status);

CREATE OR REPLACE FUNCTION public.time_expenses_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_time_expenses_update ON public.time_expenses;
CREATE TRIGGER on_time_expenses_update
  BEFORE UPDATE ON public.time_expenses
  FOR EACH ROW EXECUTE FUNCTION public.time_expenses_set_updated_at();

-- Notify admins when an expense is submitted, same trigger-notify pattern
-- used for blocked-activity-capture alerts (20261257000000).
CREATE OR REPLACE FUNCTION public.notify_expense_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name text;
BEGIN
  SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = NEW.employee_id;

  INSERT INTO public.notifications (user_id, type, module, priority, title, body)
  SELECT p.id,
         'expense_submitted',
         'timetrack',
         'normal',
         'New expense submitted',
         format('%s submitted a %s %s expense for review.', COALESCE(v_employee_name, 'An employee'), NEW.currency, NEW.amount::text)
    FROM public.profiles p
   WHERE p.role IN ('admin', 'super_admin')
     AND p.status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_expense_submitted ON public.time_expenses;
CREATE TRIGGER on_expense_submitted
  AFTER INSERT ON public.time_expenses
  FOR EACH ROW EXECUTE FUNCTION public.notify_expense_submitted();

-- Notify the employee when their expense is decided.
CREATE OR REPLACE FUNCTION public.notify_expense_decided()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, module, priority, title, body)
  VALUES (
    NEW.employee_id,
    'expense_decided',
    'timetrack',
    'normal',
    CASE WHEN NEW.status = 'approved' THEN 'Expense approved' ELSE 'Expense rejected' END,
    format('Your %s %s expense was %s%s.', NEW.currency, NEW.amount::text, NEW.status,
           CASE WHEN NEW.review_note IS NOT NULL AND NEW.review_note <> '' THEN format(' — "%s"', NEW.review_note) ELSE '' END)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_expense_decided ON public.time_expenses;
CREATE TRIGGER on_expense_decided
  AFTER UPDATE ON public.time_expenses
  FOR EACH ROW EXECUTE FUNCTION public.notify_expense_decided();

-- ---------------------------------------------------------------------------
-- Storage bucket for receipts — private, path prefixed with employee id,
-- same access shape as timetrack-screenshots / attendance-selfies.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('timetrack-receipts', 'timetrack-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "timetrack_receipts_own_insert" ON storage.objects;
CREATE POLICY "timetrack_receipts_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'timetrack-receipts' AND auth.uid()::text = split_part(name, '/', 1));

DROP POLICY IF EXISTS "timetrack_receipts_read" ON storage.objects;
CREATE POLICY "timetrack_receipts_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'timetrack-receipts'
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.current_user_role() IN ('super_admin', 'admin'))
  );

-- ---------------------------------------------------------------------------
-- RLS: employees see/manage only their own (while still submitted); admins
-- see and decide on everyone's — same shape as time_activity_logs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.time_expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_expense_categories_read" ON public.time_expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_expense_categories_write" ON public.time_expense_categories
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

ALTER TABLE public.time_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_expenses_read" ON public.time_expenses
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "time_expenses_insert" ON public.time_expenses
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- Employees may edit/withdraw their own expense only while still submitted
-- (no quietly editing after a decision); admins can update any row (to
-- decide, i.e. set status/reviewed_by/reviewed_at/review_note). One policy,
-- not two permissive ones, so USING/WITH CHECK aren't OR'd in a way that
-- would let an employee's own-row condition leak into the admin path.
CREATE POLICY "time_expenses_update" ON public.time_expenses
  FOR UPDATE TO authenticated
  USING (
    (employee_id = auth.uid() AND status = 'submitted')
    OR public.current_user_role() IN ('super_admin', 'admin')
  )
  WITH CHECK (
    (employee_id = auth.uid() AND status = 'submitted')
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

CREATE POLICY "time_expenses_delete_own" ON public.time_expenses
  FOR DELETE TO authenticated
  USING (employee_id = auth.uid() AND status = 'submitted');

NOTIFY pgrst, 'reload schema';
