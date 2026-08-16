-- =============================================================================
-- Employee Placement Management
--
-- Tracks employees deployed to client sites. Each placement records:
--   - which employee, which client, what dates
--   - commission split (e.g. 40% or 50%)
--   - payment direction: KD receives from client and pays the employee,
--     OR employee receives from client and remits KD's share
--   - placement category (security, cleaning, technical, etc.)
--
-- placement_payments tracks month-by-month payment records. When KD
-- controls the money (kd_receives), payments are auto-verified on
-- creation. When the employee receives and remits, payments require
-- manual verification by an admin.
--
-- An RPC generates the monthly payment rows for a placement's date
-- range, so the admin doesn't have to create them one by one.
-- =============================================================================

-- ── placements ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.placements (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid        NOT NULL REFERENCES public.profiles(id),
  client_id             uuid        NOT NULL REFERENCES public.clients(id),
  placement_type        text        NOT NULL DEFAULT 'kd_receives'
                          CHECK (placement_type IN ('kd_receives', 'employee_receives')),
  commission_pct        numeric     NOT NULL DEFAULT 40
                          CHECK (commission_pct > 0 AND commission_pct <= 100),
  placement_category    text        NOT NULL DEFAULT 'general'
                          CHECK (placement_category IN (
                            'security', 'cleaning', 'logistics', 'technical',
                            'administrative', 'hospitality', 'maintenance', 'general'
                          )),
  client_rate_ngn       numeric     NOT NULL CHECK (client_rate_ngn >= 0),
  employee_rate_ngn     numeric     GENERATED ALWAYS AS (
                          client_rate_ngn * (1 - commission_pct / 100)
                        ) STORED,
  commission_ngn        numeric     GENERATED ALWAYS AS (
                          client_rate_ngn * (commission_pct / 100)
                        ) STORED,
  start_date            date        NOT NULL,
  end_date              date,
  status                text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'completed', 'suspended', 'pending')),
  notes                 text,
  created_by            uuid        REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placements_employee   ON public.placements (employee_id);
CREATE INDEX IF NOT EXISTS idx_placements_client     ON public.placements (client_id);
CREATE INDEX IF NOT EXISTS idx_placements_status     ON public.placements (status);
CREATE INDEX IF NOT EXISTS idx_placements_category   ON public.placements (placement_category);

ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "placements_select" ON public.placements;
CREATE POLICY "placements_select"
  ON public.placements FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

DROP POLICY IF EXISTS "placements_insert" ON public.placements;
CREATE POLICY "placements_insert"
  ON public.placements FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "placements_update" ON public.placements;
CREATE POLICY "placements_update"
  ON public.placements FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "placements_delete" ON public.placements;
CREATE POLICY "placements_delete"
  ON public.placements FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.placements_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS placements_updated_at ON public.placements;
CREATE TRIGGER placements_updated_at
  BEFORE UPDATE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.placements_set_updated_at();


-- ── placement_payments ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.placement_payments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id      uuid        NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  month             date        NOT NULL,
  gross_amount_ngn  numeric     NOT NULL CHECK (gross_amount_ngn >= 0),
  commission_ngn    numeric     NOT NULL CHECK (commission_ngn >= 0),
  net_employee_ngn  numeric     NOT NULL CHECK (net_employee_ngn >= 0),
  status            text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'overdue', 'partial', 'waived')),
  auto_verified     boolean     NOT NULL DEFAULT false,
  paid_at           timestamptz,
  verified_by       uuid        REFERENCES public.profiles(id),
  verified_at       timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (placement_id, month)
);

CREATE INDEX IF NOT EXISTS idx_pp_placement ON public.placement_payments (placement_id);
CREATE INDEX IF NOT EXISTS idx_pp_month     ON public.placement_payments (month);
CREATE INDEX IF NOT EXISTS idx_pp_status    ON public.placement_payments (status);

ALTER TABLE public.placement_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_select" ON public.placement_payments;
CREATE POLICY "pp_select"
  ON public.placement_payments FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

DROP POLICY IF EXISTS "pp_insert" ON public.placement_payments;
CREATE POLICY "pp_insert"
  ON public.placement_payments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "pp_update" ON public.placement_payments;
CREATE POLICY "pp_update"
  ON public.placement_payments FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "pp_delete" ON public.placement_payments;
CREATE POLICY "pp_delete"
  ON public.placement_payments FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));


-- ── generate_placement_payments RPC ──────────────────────────────────────────
-- Given a placement_id, generates one payment row per month from start_date
-- to end_date (or current month if ongoing). Skips months that already exist.
-- When placement_type = 'kd_receives', auto-marks each new row as 'paid'
-- with auto_verified = true (KD controls the money flow).

CREATE OR REPLACE FUNCTION public.generate_placement_payments(p_placement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placement   record;
  v_month       date;
  v_end         date;
  v_count       integer := 0;
  v_status      text;
  v_auto        boolean;
BEGIN
  SELECT * INTO v_placement FROM public.placements WHERE id = p_placement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement not found: %', p_placement_id;
  END IF;

  v_end := COALESCE(v_placement.end_date, date_trunc('month', CURRENT_DATE)::date);
  v_month := date_trunc('month', v_placement.start_date)::date;

  IF v_placement.placement_type = 'kd_receives' THEN
    v_status := 'paid';
    v_auto   := true;
  ELSE
    v_status := 'pending';
    v_auto   := false;
  END IF;

  WHILE v_month <= v_end LOOP
    INSERT INTO public.placement_payments (
      placement_id, month, gross_amount_ngn, commission_ngn, net_employee_ngn,
      status, auto_verified, paid_at, verified_at
    )
    VALUES (
      p_placement_id,
      v_month,
      v_placement.client_rate_ngn,
      v_placement.client_rate_ngn * (v_placement.commission_pct / 100),
      v_placement.client_rate_ngn * (1 - v_placement.commission_pct / 100),
      v_status,
      v_auto,
      CASE WHEN v_auto THEN now() ELSE NULL END,
      CASE WHEN v_auto THEN now() ELSE NULL END
    )
    ON CONFLICT (placement_id, month) DO NOTHING;

    v_count := v_count + 1;
    v_month := v_month + interval '1 month';
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON TABLE public.placements IS
  'Employee placements at client sites. Tracks commission split, payment '
  'direction (KD receives or employee receives), category, and monthly rates. '
  'employee_rate_ngn and commission_ngn are computed columns derived from '
  'client_rate_ngn and commission_pct.';

COMMENT ON TABLE public.placement_payments IS
  'Month-by-month payment records for each placement. Auto-generated via '
  'generate_placement_payments(). When placement_type is kd_receives, rows '
  'are auto-verified on creation. When employee_receives, they start as '
  'pending and require manual verification by finance/admin.';

COMMENT ON FUNCTION public.generate_placement_payments IS
  'Generates monthly payment rows for a placement from start_date to end_date '
  '(or current month if ongoing). Idempotent — skips existing months. '
  'Auto-marks as paid when KD controls the money flow.';
