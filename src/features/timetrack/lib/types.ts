export interface TimeClient {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_archived: boolean;
  created_at: string;
}

export interface TimeProject {
  id: string;
  name: string;
  client_id: string | null;
  manager_id: string | null;
  is_billable: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface TimeTask {
  id: string;
  project_id: string;
  name: string;
  is_archived: boolean;
  created_at: string;
}

export interface TimeTag {
  id: string;
  name: string;
}

export interface TimeEntry {
  id: string;
  employee_id: string;
  task_id: string;
  project_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  is_billable: boolean;
  notes: string | null;
  entry_source: 'manual' | 'timer' | 'import';
  invoiced: boolean;
  created_at: string;
}

export interface TimeCustomField {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown';
  applies_to: 'project' | 'task' | 'entry';
  options: string[];
  is_archived: boolean;
}

export interface TimeBillingRate {
  id: string;
  employee_id: string;
  revenue_rate_per_hour: number;
  cost_rate_per_hour: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface TimeProjectBillingRate extends Omit<TimeBillingRate, 'employee_id'> {
  project_id: string;
  employee_id: string | null;
}

export interface TimeApproval {
  id: string;
  employee_id: string;
  week_start_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  approver_id: string | null;
  comment: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  locked_at: string | null;
  total_hours: number;
  billable_hours: number;
}

export interface TimeInvoice {
  id: string;
  client_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: 'draft' | 'sent' | 'paid';
  line_items: { description: string; hours: number; rate: number; amount: number }[];
  subtotal: number;
  total: number;
  created_at: string;
}

export interface TimePlannerAssignment {
  id: string;
  employee_id: string;
  project_id: string;
  scheduled_date: string;
  scheduled_hours: number;
}

export interface TimeLeaveType {
  id: string;
  name: string;
  requires_approval: boolean;
  is_paid: boolean;
  is_archived: boolean;
}

export interface TimeLeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approver_id: string | null;
  comment: string | null;
  requested_at: string;
  decided_at: string | null;
}

export interface TimeAttendanceEntry {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  source: 'web' | 'kiosk';
}

export interface TimeOvertimeRule {
  id: string;
  scope: 'global' | 'employee' | 'project';
  scope_id: string | null;
  daily_threshold_hours: number;
  weekly_threshold_hours: number;
  multiplier: number;
}

export interface TimeProjectBudget {
  project_id: string;
  budget_type: 'hours' | 'amount';
  budget_hours: number | null;
  budget_amount: number | null;
  alert_threshold_pct: number;
}

export interface TimeRole {
  role_key: string;
  label: string;
  capabilities: Record<string, boolean>;
}
