-- HR Features Expansion: Letters, Surveys, Grievances, Staff Loans,
-- Shifts, Succession, Handbook, Timesheets
-- All tables use RLS enabled with permissive policies for authenticated users.

-- 1. HR Letters (confirmation, promotion, employment verification, reference)
create table if not exists hr_letters (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id),
  letter_type text not null check (letter_type in (
    'confirmation', 'promotion', 'employment_verification', 'reference',
    'termination', 'salary_review', 'warning', 'custom'
  )),
  title text not null,
  body_html text not null,
  effective_date date,
  metadata jsonb default '{}',
  status text not null default 'draft' check (status in ('draft', 'issued', 'revoked')),
  issued_by uuid references profiles(id),
  issued_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table hr_letters enable row level security;
DO $$ BEGIN
  create policy "hr_letters_auth" on hr_letters for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Employee Surveys / Pulse Checks
create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  survey_type text not null default 'pulse' check (survey_type in ('pulse', 'engagement', 'exit', 'onboarding', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  is_anonymous boolean default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table surveys enable row level security;
DO $$ BEGIN
  create policy "surveys_auth" on surveys for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'rating' check (question_type in ('rating', 'text', 'choice', 'enps')),
  options jsonb,
  sort_order int default 0,
  is_required boolean default true
);
alter table survey_questions enable row level security;
DO $$ BEGIN
  create policy "survey_questions_auth" on survey_questions for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  question_id uuid not null references survey_questions(id) on delete cascade,
  respondent_id uuid references profiles(id),
  answer_text text,
  answer_rating int check (answer_rating between 0 and 10),
  submitted_at timestamptz default now()
);
alter table survey_responses enable row level security;
DO $$ BEGIN
  create policy "survey_responses_auth" on survey_responses for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Grievance / Whistleblowing
create table if not exists grievances (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  description text not null,
  category text not null default 'general' check (category in (
    'harassment', 'discrimination', 'safety', 'pay_dispute',
    'management', 'policy_violation', 'whistleblowing', 'general'
  )),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  is_anonymous boolean default false,
  reporter_id uuid references profiles(id),
  assigned_to uuid references profiles(id),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed', 'escalated')),
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table grievances enable row level security;
DO $$ BEGIN
  create policy "grievances_auth" on grievances for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Staff Loans
create table if not exists staff_loans (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id),
  loan_type text not null default 'salary_advance' check (loan_type in (
    'salary_advance', 'personal_loan', 'emergency', 'education', 'housing', 'other'
  )),
  principal_ngn bigint not null check (principal_ngn > 0),
  interest_rate_pct numeric(5,2) default 0,
  tenure_months int not null check (tenure_months > 0),
  monthly_deduction_ngn bigint not null,
  outstanding_ngn bigint not null,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'active', 'fully_paid', 'defaulted', 'written_off'
  )),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  disbursed_at timestamptz,
  purpose text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table staff_loans enable row level security;
DO $$ BEGIN
  create policy "staff_loans_auth" on staff_loans for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists staff_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references staff_loans(id) on delete cascade,
  amount_ngn bigint not null check (amount_ngn > 0),
  repayment_type text not null default 'payroll_deduction' check (repayment_type in ('payroll_deduction', 'manual', 'bank_transfer')),
  payroll_run_id uuid,
  period text,
  notes text,
  created_at timestamptz default now()
);
alter table staff_loan_repayments enable row level security;
DO $$ BEGIN
  create policy "staff_loan_repayments_auth" on staff_loan_repayments for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Shifts / Roster Scheduling
create table if not exists shift_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  break_minutes int default 60,
  color text default '#3b82f6',
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table shift_definitions enable row level security;
DO $$ BEGIN
  create policy "shift_definitions_auth" on shift_definitions for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id),
  shift_id uuid not null references shift_definitions(id),
  work_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'swap_requested', 'swapped', 'cancelled')),
  swap_with_id uuid references profiles(id),
  notes text,
  created_at timestamptz default now(),
  unique(employee_id, work_date)
);
alter table shift_assignments enable row level security;
DO $$ BEGIN
  create policy "shift_assignments_auth" on shift_assignments for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Succession Planning
create table if not exists succession_plans (
  id uuid primary key default gen_random_uuid(),
  position_title text not null,
  department_id uuid references departments(id),
  current_holder_id uuid references profiles(id),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'critical')),
  readiness_timeline text check (readiness_timeline in ('ready_now', '6_months', '1_year', '2_years')),
  notes text,
  status text not null default 'active' check (status in ('active', 'filled', 'archived')),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table succession_plans enable row level security;
DO $$ BEGIN
  create policy "succession_plans_auth" on succession_plans for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists succession_candidates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references succession_plans(id) on delete cascade,
  candidate_id uuid not null references profiles(id),
  readiness text not null default '1_year' check (readiness in ('ready_now', '6_months', '1_year', '2_years')),
  development_areas text,
  rating numeric(3,1) check (rating between 0 and 5),
  created_at timestamptz default now()
);
alter table succession_candidates enable row level security;
DO $$ BEGIN
  create policy "succession_candidates_auth" on succession_candidates for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Employee Handbook / Policy Acknowledgment
create table if not exists handbook_policies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'general' check (category in (
    'general', 'code_of_conduct', 'leave', 'it_security', 'health_safety',
    'anti_harassment', 'data_privacy', 'dress_code', 'remote_work', 'other'
  )),
  content_html text not null,
  version int not null default 1,
  is_active boolean default true,
  requires_acknowledgment boolean default true,
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table handbook_policies enable row level security;
DO $$ BEGIN
  create policy "handbook_policies_auth" on handbook_policies for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists policy_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references handbook_policies(id) on delete cascade,
  employee_id uuid not null references profiles(id),
  acknowledged_at timestamptz default now(),
  policy_version int not null default 1,
  unique(policy_id, employee_id, policy_version)
);
alter table policy_acknowledgments enable row level security;
DO $$ BEGIN
  create policy "policy_acknowledgments_auth" on policy_acknowledgments for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Timesheets
create table if not exists timesheets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id),
  week_start date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  total_hours numeric(6,2) default 0,
  billable_hours numeric(6,2) default 0,
  submitted_at timestamptz,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  unique(employee_id, week_start)
);
alter table timesheets enable row level security;
DO $$ BEGIN
  create policy "timesheets_auth" on timesheets for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references timesheets(id) on delete cascade,
  work_date date not null,
  project_id uuid,
  task_description text,
  hours numeric(4,2) not null check (hours >= 0 and hours <= 24),
  is_billable boolean default false,
  created_at timestamptz default now()
);
alter table timesheet_entries enable row level security;
DO $$ BEGIN
  create policy "timesheet_entries_auth" on timesheet_entries for all using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
