export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRow {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  is_half_day: boolean | null;
  reason: string | null;
  status: LeaveStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  rejection_reason: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  edited_at: string | null;
  edited_by: string | null;
  source: 'employee' | 'admin' | null;
  created_by: string | null;
}

export interface LeaveEvent {
  id: string;
  leave_id: string;
  actor_id: string | null;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  photo_url: string | null;
  role: string | null;
  status: string | null;
  start_date: string | null;
  job_title: string | null;
}

export interface LeaveTypeInfo {
  code: string;
  name: string;
  color: string | null;
  default_days: number;
  accrual_type: string;
  paid: boolean;
  requires_medical_cert: boolean;
  gender: string | null;
  active: boolean;
}

export interface BalanceRow {
  employee_id: string;
  year: number;
  annual_quota: number;
  annual_used: number;
  sick_used: number;
  unpaid_used: number;
  maternity_used: number | null;
  paternity_used: number | null;
  compassionate_used: number | null;
  study_used: number | null;
  carryover_days: number | null;
}

export interface AwayRow {
  leave_id: string;
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  start_date: string;
  end_date: string;
  days: number;
  leave_type: string | null;
  status: LeaveStatus;
}

export interface BalanceAdjustment {
  id: string;
  employee_id: string;
  year: number;
  field: string;
  old_value: number | null;
  new_value: number;
  reason: string;
  actor_id: string | null;
  created_at: string;
}
