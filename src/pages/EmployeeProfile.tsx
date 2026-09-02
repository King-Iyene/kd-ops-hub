import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { errorMessage } from '@/lib/db-errors';
import { Loader2, ChevronDown, Camera, History } from 'lucide-react';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import OffboardingTab from '@/components/employee/OffboardingTab';
import JobPayTab from '@/components/employee/JobPayTab';
import PersonalTab from '@/components/employee/PersonalTab';
import StatutoryTab from '@/components/employee/StatutoryTab';
import DocumentsTab from '@/components/employee/DocumentsTab';
import TasksTab from '@/components/employee/TasksTab';
import LogsTab from '@/components/employee/LogsTab';
import LeaveTab from '@/components/employee/LeaveTab';
import ExpensesTab from '@/components/employee/ExpensesTab';
import PayrollTab from '@/components/employee/PayrollTab';
import PlacementsTab from '@/components/employee/PlacementsTab';
import TotalCostTab from '@/components/employee/TotalCostTab';
import DeductionsTab from '@/components/employee/DeductionsTab';
import EarningsTab from '@/components/employee/EarningsTab';
import IncrementsTab from '@/components/employee/IncrementsTab';
import AdvancesTab from '@/components/employee/AdvancesTab';
import PermissionsTab from '@/components/employee/PermissionsTab';
import { supabase } from '@/lib/supabase';
import { useCompanySettings, useDepartments } from '@/queries';
import { compressImage } from '@/lib/image-compression';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { logAudit } from '@/lib/audit';
import { roleLabel } from '@/lib/roles';
import { formatDateTime, formatNaira } from '@/lib/format';
import { openPayslipPrintWindow, openStoredPayslipHtml, downloadStoredPayslipHtml } from '@/lib/payslip';
import { PageBreadcrumbs } from '@/components/ui-kit/PageBreadcrumbs';
import { WhatsAppButton } from '@/components/ui-kit/WhatsAppButton';
import { displayName, initialsOf } from '@/lib/name';
import { computePayslip, PENSION_EMPLOYER_RATE, PENSION_EMPLOYEE_RATE } from '@/lib/tax';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { startImpersonation } from '@/lib/impersonation';
import { cn } from '@/lib/utils';
import { getBankCode } from '@/lib/paystack';
import { type PermissionsMap } from '@/components/PermissionsEditor';
import { type BankAccountValue } from '@/components/BankAccountField';
import { notifyRoles } from '@/lib/notify';

const humanPeriod = (p: string) => {
  if (!p || !/^\d{4}-\d{1,2}$/.test(p)) return p || '—';
  const [y, m] = p.split('-');
  return new Date(+y, +m - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
};

interface EmployeeData {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  job_title: string | null;
  salary_ngn: number;
  created_at: string;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  pension_pin: string | null;
  annual_leave_days: number;
  department_id: string | null;
  tags: string[] | null;
  photo_url: string | null;
  departments: { name: string } | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  next_of_kin_email: string | null;
  employee_number: string | null;
  employment_type: string | null;
  employee_category: string | null;
  start_date: string | null;
  nin: string | null;
  nin_last4: string | null;
  nhf_number: string | null;
  nhis_number: string | null;
  tin: string | null;
  pension_enabled: boolean | null;
  nhf_enabled: boolean | null;
  nhis_enabled: boolean | null;
  paye_enabled: boolean | null;
  tax_id: string | null;
  // Sprint A — salary components
  use_salary_components: boolean | null;
  basic_ngn: number | null;
  housing_ngn: number | null;
  transport_ngn: number | null;
  other_allowances_ngn: number | null;
  // Sprint B — profile completeness
  reporting_manager_id: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  pfa_name: string | null;
  pfa_code: string | null;
  state_of_residence: string | null;
  pay_group_id: string | null;
  notice_period_days: number | null;
  voluntary_pension_pct: number | null;
}

const EmployeeProfile = () => {
  usePageTitle('Employee Profile');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile: currentUser } = useAuthStore();

  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<any>(null);
  const [confirmAnonymise, setConfirmAnonymise] = useState(false);
  const [anonymiseInput, setAnonymiseInput] = useState('');
  const [actioning, setActioning] = useState(false);
  const [form, setForm] = useState<Partial<EmployeeData>>({});
  const [bankDetails, setBankDetails] = useState<BankAccountValue>({
    bank_name: '', account_number: '', account_name: '', verified: false,
  });
  const { data: companySettingsData } = useCompanySettings();
  // Which provider BankAccountField should verify against — was previously
  // hardcoded to Paystack regardless of the active provider (see
  // BankAccountField.tsx's `provider` prop). Fine to be slightly stale since
  // this only affects VERIFY, not dispatch (Payroll re-resolves fresh at
  // actual disbursement time).
  const activeProvider: 'paystack' | 'flutterwave' = useMemo(
    () => ((companySettingsData as any)?.active_payment_provider === 'flutterwave' ? 'flutterwave' : 'paystack'),
    [companySettingsData],
  );
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [employeePayments, setEmployeePayments] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [increments, setIncrements] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [deductions, setDeductions] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [benefits, setBenefits] = useState<any[]>([]);
  const [assignedAssets, setAssignedAssets] = useState<any[]>([]);
  const [dependents, setDependents] = useState<any[]>([]);
  const [showDependentDialog, setShowDependentDialog] = useState(false);
  const [editingDependent, setEditingDependent] = useState<any | null>(null);
  const [savingDependent, setSavingDependent] = useState(false);
  const [deleteDependentTarget, setDeleteDependentTarget] = useState<any | null>(null);
  const [deletingDependent, setDeletingDependent] = useState(false);
  const emptyDependentForm = {
    full_name: '',
    relationship: 'child' as 'spouse' | 'child' | 'parent' | 'sibling' | 'other',
    date_of_birth: '',
    gender: '' as '' | 'male' | 'female',
    phone: '',
    is_beneficiary: false,
    is_hmo_enrolled: false,
    hmo_plan_id: '',
    notes: '',
  };
  const [dependentForm, setDependentForm] = useState(emptyDependentForm);
  const [empPlacements, setEmpPlacements] = useState<any[]>([]);
  const [empPlacementPayments, setEmpPlacementPayments] = useState<any[]>([]);
  const nsitfEnabled = useMemo(() => (companySettingsData as any)?.nsitf_enabled !== false, [companySettingsData]);
  const [showDeductionDialog, setShowDeductionDialog] = useState(false);
  const [savingDeduction, setSavingDeduction] = useState(false);
  const [deductionForm, setDeductionForm] = useState({
    description: '',
    amount_ngn: 0,
    frequency: 'monthly' as 'monthly' | 'per_payroll_run' | 'one_time',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    total_deductible_amount: '',
  });
  const [showEarningDialog, setShowEarningDialog] = useState(false);
  const [savingEarning, setSavingEarning] = useState(false);
  const [earningForm, setEarningForm] = useState({
    description: '',
    amount_ngn: 0,
    frequency: 'monthly' as 'monthly' | 'per_payroll_run' | 'one_time',
    earning_type: 'allowance' as 'allowance' | 'basic_component' | 'bonus' | 'overtime' | 'commission',
    is_taxable: true,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
  });
  const [showIncrementDialog, setShowIncrementDialog] = useState(false);
  const [savingIncrement, setSavingIncrement] = useState(false);
  const [incrementForm, setIncrementForm] = useState({
    new_salary: 0,
    reason: '',
    effective_date: new Date().toISOString().slice(0, 10),
  });
  const [activeTab, setActiveTab] = useState<'job_pay'|'personal'|'statutory'|'documents'|'tasks'|'logs'|'leave'|'expenses'|'payroll'|'increments'|'permissions'|'advances'|'deductions'|'offboarding'|'total_cost'|'placements'>('job_pay');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const loadedTabs = useRef(new Set<string>());
  const [tabLoading, setTabLoading] = useState(false);

  // Documents upload (admin uploads a contract/NDA/ID copy on the employee's behalf)
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docForm, setDocForm] = useState({
    title: '',
    category: 'contract',
    description: '',
    expires_at: '',
  });
  const [bankEditMode, setBankEditMode] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [showBankHistory, setShowBankHistory] = useState(false);
  const [bankHistory, setBankHistory] = useState<any[]>([]);
  // Bank change request workflow (non-admin employees)
  const [bankRequests, setBankRequests] = useState<any[]>([]);
  const [showBankRequestForm, setShowBankRequestForm] = useState(false);
  const [bankRequestDetails, setBankRequestDetails] = useState<BankAccountValue>({ bank_name: '', account_number: '', account_name: '', verified: false });
  const [bankRequestReason, setBankRequestReason] = useState('');
  const [submittingBankRequest, setSubmittingBankRequest] = useState(false);
  const [rejectingBankRequest, setRejectingBankRequest] = useState<string | null>(null);
  const [bankRejectReason, setBankRejectReason] = useState('');
  const [bankHistoryLoading, setBankHistoryLoading] = useState(false);
  const { data: departments = [] } = useDepartments();
  const [payGroups, setPayGroups] = useState<Array<{ id: string; name: string }>>([]);
  // Active employees (used as the Reports-to dropdown).
  const [managers, setManagers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string>('');
  const companySetting = useMemo(() => ({
    company_name: (companySettingsData as any)?.company_name || 'KD Squares Ltd',
    logo_url: (companySettingsData as any)?.logo_url || null,
  }), [companySettingsData]);

  type EditSection =
    | 'employment' | 'compensation' | 'basic' | 'kin' | 'address'
    | 'statutory' | 'identity';
  const [editingSection, setEditingSection] = useState<EditSection | null>(null);
  const [sectionSaving, setSectionSaving] = useState(false);

  const startEdit = (section: EditSection) => {
    if (employee) setForm(employee);
    setEditingSection(section);
  };
  const cancelEdit = () => {
    if (employee) setForm(employee);
    setEditingSection(null);
  };

  // Shared fallback data for payslips with no stored HTML (e.g. legacy
  // batch-item payslips) — rendered fresh client-side from the raw figures.
  const fallbackPayslipData = (slip: any) => ({
    company_name: companySetting.company_name,
    logo_url: companySetting.logo_url,
    employee_name: slip.employee_name || employee?.full_name || '',
    employee_email: employee?.email || slip.employee_email || null,
    employee_role: employee?.role || null,
    employee_number: employee?.employee_number || null,
    bank_name: employee?.bank_name || null,
    bank_account: employee?.bank_account_number || null,
    period: slip.period || '',
    gross_ngn: Number(slip.gross_ngn || 0),
    paye_ngn: Number(slip.paye_ngn || 0),
    pension_ngn: Number(slip.pension_ngn || 0),
    nhf_ngn: Number(slip.nhf_ngn || 0),
    net_ngn: Number(slip.net_ngn || 0),
    generated_by: currentUser?.full_name || currentUser?.email || null,
    payslip_ref: slip.id?.slice(0, 8).toUpperCase() || null,
  });

  const previewPayslip = async (slip: any) => {
    if (!slip.storage_path && !slip.file_url) {
      openPayslipPrintWindow(fallbackPayslipData(slip), { autoPrint: false });
      return;
    }
    // Real payroll-module payslips are stored as fully-rendered HTML —
    // open that exact document rather than re-rendering it from scratch,
    // so what you preview always matches what was actually generated.
    const path = slip.storage_path || slip.file_url;
    const { data, error } = await supabase.storage.from('payslips').download(path);
    if (error) { toast({ title: 'Could not open payslip', description: error.message, variant: 'destructive' }); return; }
    const html = await data.text();
    openStoredPayslipHtml(html);
  };

  const downloadPayslip = async (slip: any) => {
    // Batch-item payslips have no stored file — generate HTML client-side
    if (!slip.storage_path && !slip.file_url) {
      openPayslipPrintWindow(fallbackPayslipData(slip), { autoPrint: false });
      return;
    }
    // Payroll-module payslips are stored as HTML in Supabase Storage —
    // download that exact document (same path as the employee self-service view).
    const path = slip.storage_path || slip.file_url;
    const { data, error } = await supabase.storage.from('payslips').download(path);
    if (error) { toast({ title: 'Download failed', description: error.message, variant: 'destructive' }); return; }
    try {
      const html = await data.text();
      downloadStoredPayslipHtml(html, `payslip-${slip.period || path.split('/').pop()}`);
    } catch {
      // Fallback: hand back the raw stored file if reading it as text fails.
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${path.split('/').pop()}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const loadTabData = useCallback(async (tab: string, force = false) => {
    if (!id) return;
    if (!force && loadedTabs.current.has(tab)) return;
    const noQuery = ['job_pay', 'personal', 'statutory', 'permissions', 'offboarding'];
    if (noQuery.includes(tab)) { loadedTabs.current.add(tab); return; }
    setTabLoading(true);
    try {
      switch (tab) {
        case 'expenses': {
          const { data } = await supabase.from('expenses').select('id, created_at, description, category, amount, amount_ngn, status, date').eq('submitted_by', id).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(20);
          setExpenses(data || []);
          break;
        }
        case 'payroll': {
          const [payRes, batchRes] = await Promise.all([
            supabase.from('payslips').select('id, period, created_at, storage_path, file_url, employee_name, employee_email, gross_ngn, paye_ngn, pension_ngn, nhf_ngn, net_ngn, employer_pension_ngn').eq('employee_id', id)
              .order('period', { ascending: false }).limit(24),
            supabase.from('batch_items')
              .select('id, amount_ngn, status, created_at, processed_at, narration, payment_batches!inner(name, batch_type, payment_date, period)')
              .eq('employee_id', id).order('created_at', { ascending: false }).limit(50),
          ]);
          setPayslips(payRes.data || []);
          setEmployeePayments(batchRes.data || []);
          break;
        }
        case 'leave': {
          const { data } = await supabase.from('leave_requests').select('id, status, days_requested, days, leave_type, type, start_date, end_date').eq('employee_id', id).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(20);
          setLeaves(data || []);
          break;
        }
        case 'tasks': {
          const { data } = await supabase.from('tasks').select('id, title, due_date, status').eq('assignee_id', id)
            .order('created_at', { ascending: false }).limit(20);
          setTasks(data || []);
          break;
        }
        case 'documents': {
          const { data } = await supabase.from('documents').select('id, title, file_name, name, description, category, expires_at, created_at, storage_path')
            .or(`employee_id.eq.${id},uploaded_by.eq.${id}`)
            .is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(30);
          setDocuments(data || []);
          break;
        }
        case 'logs': {
          const { data } = await supabase.from('audit_logs')
            .select('id, action_type, description, created_at, performed_by, performed_by_name')
            .or(`entity_id.eq.${id},performed_by.eq.${id}`)
            .order('created_at', { ascending: false }).limit(50);
          setAuditLogs(data || []);
          break;
        }
        case 'increments': {
          const { data } = await supabase.from('salary_increments').select('id, effective_date, new_salary_ngn, old_salary_ngn, reason').eq('employee_id', id)
            .order('effective_date', { ascending: false }).limit(20);
          setIncrements(data || []);
          break;
        }
        case 'advances': {
          const { data } = await supabase.from('employee_advances').select('id, status, outstanding_ngn, deduction_per_month, created_at, start_period, amount_ngn, repayment_months').eq('employee_id', id)
            .order('created_at', { ascending: false }).limit(20);
          setAdvances(data || []);
          break;
        }
        case 'deductions': {
          const [dRes, eRes] = await Promise.all([
            supabase.from('employee_deductions').select('id, description, amount_ngn, frequency, start_date, end_date, amount_deducted_to_date, total_deductible_amount, status')
              .eq('entity_id', id).eq('entity_type', 'employee').order('created_at', { ascending: false }).limit(20),
            loadedTabs.current.has('earnings_data') ? Promise.resolve(null) : supabase.from('employee_earnings').select('id, status, description, amount_ngn, earning_type, frequency, is_taxable, start_date, end_date')
              .eq('entity_id', id).eq('entity_type', 'employee').order('created_at', { ascending: false }).limit(20),
          ]);
          setDeductions(dRes.data || []);
          if (eRes) { setEarnings(eRes.data || []); loadedTabs.current.add('earnings_data'); }
          break;
        }
        case 'earnings': {
          if (!loadedTabs.current.has('earnings_data')) {
            const { data } = await supabase.from('employee_earnings').select('id, status, description, amount_ngn, earning_type, frequency, is_taxable, start_date, end_date')
              .eq('entity_id', id).eq('entity_type', 'employee').order('created_at', { ascending: false }).limit(20);
            setEarnings(data || []);
            loadedTabs.current.add('earnings_data');
          }
          break;
        }
        case 'total_cost': {
          const queries: Promise<any>[] = [];
          const flags: string[] = [];
          if (!loadedTabs.current.has('payroll')) {
            queries.push(supabase.from('payslips').select('id, period, created_at, storage_path, file_url, employee_name, employee_email, gross_ngn, paye_ngn, pension_ngn, nhf_ngn, net_ngn, employer_pension_ngn').eq('employee_id', id).order('period', { ascending: false }).limit(24));
            flags.push('payslips');
          }
          if (!loadedTabs.current.has('earnings_data')) {
            queries.push(supabase.from('employee_earnings').select('id, status, description, amount_ngn, earning_type, frequency, is_taxable, start_date, end_date').eq('entity_id', id).eq('entity_type', 'employee').order('created_at', { ascending: false }).limit(20));
            flags.push('earnings');
          }
          queries.push(
            supabase.from('employee_benefits').select('benefit_type, premium_ngn, premium_frequency, status').eq('employee_id', id).eq('status', 'active'),
            supabase.from('assets').select('id, name, category, cost_ngn').eq('assigned_to', id).is('disposal_date', null).is('deleted_at', null),
            supabase.from('employee_dependents').select('id, full_name, relationship, date_of_birth, gender, phone, is_beneficiary, is_hmo_enrolled, hmo_plan_id, notes').eq('employee_id', id).order('created_at', { ascending: false }),
          );
          if (!loadedTabs.current.has('deductions')) {
            queries.push(supabase.from('employee_deductions').select('id, description, amount_ngn, frequency, start_date, end_date, amount_deducted_to_date, total_deductible_amount, status').eq('entity_id', id).eq('entity_type', 'employee').order('created_at', { ascending: false }).limit(20));
            flags.push('deductions');
          }
          const results = await Promise.all(queries);
          let idx = 0;
          if (flags.includes('payslips')) { setPayslips(results[idx].data || []); idx++; loadedTabs.current.add('payroll'); }
          if (flags.includes('earnings')) { setEarnings(results[idx].data || []); idx++; loadedTabs.current.add('earnings_data'); }
          setBenefits(results[idx].data || []); idx++;
          setAssignedAssets(results[idx].data || []); idx++;
          setDependents(results[idx].data || []); idx++;
          if (flags.includes('deductions')) { setDeductions(results[idx].data || []); idx++; loadedTabs.current.add('deductions'); }
          break;
        }
        case 'placements': {
          const { data: plData } = await supabase.from('placements')
            .select('id, client_id, status, employee_rate_ngn, commission_ngn, placement_category, placement_type, client_rate_ngn, commission_pct, start_date, end_date, clients(name)')
            .eq('employee_id', id).order('start_date', { ascending: false }).limit(50);
          const placements = (plData || []) as any[];
          setEmpPlacements(placements);
          if (placements.length > 0) {
            const ids = placements.map((p: any) => p.id);
            const { data: ppData } = await supabase.from('placement_payments')
              .select('id, placement_id, status, net_employee_ngn, month, gross_amount_ngn, commission_ngn')
              .in('placement_id', ids).order('month', { ascending: false }).limit(200);
            setEmpPlacementPayments(ppData || []);
          } else {
            setEmpPlacementPayments([]);
          }
          break;
        }
      }
      loadedTabs.current.add(tab);
    } finally {
      setTabLoading(false);
    }
  }, [id]);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    let { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, email, phone, role, status, job_title, salary_ngn, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, bank_name, bank_account_number, bank_account_name, pension_pin, annual_leave_days, department_id, photo_url, date_of_birth, gender, marital_status, address, next_of_kin_email, employee_number, employment_type, employee_category, start_date, nin, nin_last4, nhf_number, nhis_number, tin, pension_enabled, nhf_enabled, nhis_enabled, paye_enabled, tax_id, use_salary_components, basic_ngn, housing_ngn, transport_ngn, other_allowances_ngn, reporting_manager_id, contract_end_date, pfa_name, pfa_code, state_of_residence, pay_group_id, notice_period_days, voluntary_pension_pct, permissions, departments(name)')
      .eq('id', id)
      .single();
    if (error) {
      const fallback = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, phone, role, status, job_title, salary_ngn, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, bank_name, bank_account_number, bank_account_name, pension_pin, annual_leave_days, department_id, photo_url, date_of_birth, gender, marital_status, address, next_of_kin_email, employee_number, employment_type, employee_category, start_date, nin, nin_last4, nhf_number, nhis_number, tin, pension_enabled, nhf_enabled, nhis_enabled, paye_enabled, tax_id, use_salary_components, basic_ngn, housing_ngn, transport_ngn, other_allowances_ngn, reporting_manager_id, contract_end_date, pfa_name, pfa_code, state_of_residence, pay_group_id, notice_period_days, voluntary_pension_pct, permissions')
        .eq('id', id)
        .single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error || !data) {
      const msg = error?.message
        ?? (error as any)?.details
        ?? 'Could not load this employee. The connection may have dropped — try again.';
      setLoadError(msg);
      setLoading(false);
      return;
    }
    const emp = data as EmployeeData;
    setEmployee(emp);
    setForm(emp);
    setBankDetails({
      bank_name: emp.bank_name || '',
      account_number: emp.bank_account_number || '',
      account_name: emp.bank_account_name || '',
      verified: !!(emp.bank_name && emp.bank_account_number && emp.bank_account_name),
    });
    setPermissions((data as any).permissions || {});

    supabase.from('pay_groups').select('id, name').order('name').then(({ data }) => {
      setPayGroups((data as Array<{ id: string; name: string }>) || []);
    }).catch(() => {});

    supabase.from('profiles_directory')
      .select('id, full_name, email')
      .eq('status', 'active')
      .neq('id', id || '')
      .order('full_name')
      .then(({ data }) => setManagers((data as any[]) || []))
      .catch(() => {});

    setLoading(false);
  }, [id, navigate, toast]);

  const load = useCallback(async () => {
    loadedTabs.current.clear();
    await loadProfile();
    await loadTabData(activeTab, true);
  }, [loadProfile, loadTabData, activeTab]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => {
    if (!loading && employee) loadTabData(activeTab);
  }, [activeTab, loading, employee, loadTabData]);

  const loadBankHistory = async () => {
    if (!id) return;
    setBankHistoryLoading(true);
    try {
      // Try filtered query first; fall back to unfiltered if metadata column missing (400).
      let { data, error } = await supabase
        .from('audit_logs')
        .select('id, action_type, description, performed_by_name, metadata, created_at')
        .like('action_type', 'profile_bank_account_%')
        .filter('metadata->>subject_user_id', 'eq', id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error && (error as any).code === '42703') {
        // metadata column missing — do NOT fall back to an unfiltered query:
        // that would leak EVERY employee's bank-change history onto this one
        // profile. Show nothing instead (history unavailable).
        data = [];
        error = null;
      }
      setBankHistory(data || []);
    } finally {
      setBankHistoryLoading(false);
    }
  };

  const openBankHistory = () => {
    setShowBankHistory(true);
    loadBankHistory();
  };

  const loadBankRequests = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('bank_account_change_requests')
      .select('id, status, new_bank_name, new_account_number, new_account_name, reason')
      .eq('employee_id', id)
      .order('created_at', { ascending: false });
    setBankRequests(data || []);
  }, [id]);

  useEffect(() => { loadBankRequests(); }, [loadBankRequests]);

  const submitBankChangeRequest = async () => {
    if (!id || !bankRequestDetails.verified) return;
    setSubmittingBankRequest(true);
    try {
      const { error } = await supabase.from('bank_account_change_requests').insert({
        employee_id: id,
        new_bank_name: bankRequestDetails.bank_name,
        new_account_number: bankRequestDetails.account_number,
        new_account_name: bankRequestDetails.account_name,
        reason: bankRequestReason.trim() || null,
      });
      if (error) throw error;
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'bank_change_requested',
        module: 'employees',
        priority: 'high',
        title: 'Bank account change request',
        body: `${employee?.full_name || 'An employee'} has requested a bank account change.`,
      });
      toast({ title: 'Request submitted', description: 'An admin will review and approve it.' });
      setShowBankRequestForm(false);
      setBankRequestDetails({ bank_name: '', account_number: '', account_name: '', verified: false });
      setBankRequestReason('');
      loadBankRequests();
    } catch (e: unknown) {
      toast({ title: 'Submission failed', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setSubmittingBankRequest(false);
    }
  };

  const handleApproveBankRequest = async (reqId: string) => {
    try {
      await supabase.rpc('approve_bank_account_change_request', { p_request_id: reqId });
      toast({ title: 'Bank account change approved and applied.' });
      loadBankRequests();
      load();
    } catch (e: unknown) {
      toast({ title: 'Approval failed', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const handleRejectBankRequest = async () => {
    if (!rejectingBankRequest || !bankRejectReason.trim()) return;
    try {
      await supabase.rpc('reject_bank_account_change_request', {
        p_request_id: rejectingBankRequest,
        p_reason: bankRejectReason.trim(),
      });
      toast({ title: 'Bank account change rejected.' });
      setRejectingBankRequest(null);
      setBankRejectReason('');
      loadBankRequests();
    } catch (e: unknown) {
      toast({ title: 'Rejection failed', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const saveBank = async () => {
    if (!id) return;
    setBankSaving(true);
    const bankCode = getBankCode(bankDetails.bank_name);
    const { error } = await supabase.from('profiles').update({
      bank_name: bankDetails.bank_name,
      bank_code: bankCode || '',
      bank_account_number: bankDetails.account_number,
      bank_account_name: bankDetails.account_name,
    }).eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('employee_edited', `Bank details updated for "${employee?.full_name || id}"`, currentUser);
      toast({ title: 'Bank details saved' });
      setBankEditMode(false);
      load();
    }
    setBankSaving(false);
  };

  const saveSection = async (label: string, fields: Record<string, any>) => {
    if (!id) return;
    setSectionSaving(true);
    // full_name derived when first/last changes
    const payload: Record<string, any> = { ...fields };
    if (fields.first_name !== undefined || fields.last_name !== undefined) {
      payload.full_name = displayName(
        fields.first_name ?? employee?.first_name,
        fields.last_name ?? employee?.last_name,
        employee?.full_name,
      );
    }
    // Role-escalation guard: strip `role` from the payload if the caller is
    // not allowed to change it (self-edit, or admin trying to set admin/super_admin).
    if ('role' in payload) {
      const isSelf = currentUser?.id === id;
      const callerIsAdmin = currentUser?.role === 'admin';
      const targetRoleIsAdminOrAbove = ['admin', 'super_admin'].includes(payload.role as string);
      if (isSelf || (callerIsAdmin && targetRoleIsAdminOrAbove)) {
        delete payload.role;
        toast({ title: 'Role not changed', description: 'You do not have permission to set that role.', variant: 'destructive' });
        if (Object.keys(payload).length === 0) {
          setSectionSaving(false);
          return;
        }
      }
    }
    // .select() lets us tell a real save apart from an RLS-silent no-op —
    // PostgREST returns no error when a row is filtered out by policy, just
    // zero rows back, which would otherwise show a false "saved" toast.
    const { data, error } = await supabase.from('profiles').update(payload).eq('id', id).select('id');
    if (error) {
      toast({ title: `Save failed`, description: error.message, variant: 'destructive' });
      setSectionSaving(false);
      return;
    }
    if (!data?.length) {
      toast({ title: 'Save failed', description: "You don't have permission to change one or more of these fields.", variant: 'destructive' });
      setSectionSaving(false);
      return;
    }
    await logAudit('employee_edited', `${label} updated for "${employee?.full_name || id}"`, currentUser);
    toast({ title: `${label} saved` });
    setEditingSection(null);
    setSectionSaving(false);
    load();
  };

  const handleImpersonate = async () => {
    if (!id || !employee) return;
    try {
      await startImpersonation(id, employee.full_name || employee.email || 'this user');
      // startImpersonation reloads the page on success — nothing more to do.
    } catch (err) {
      toast({
        title: 'Could not log in as this user',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDeactivate = async () => {
    if (!id || !employee) return;
    setActioning(true);
    const next = employee.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('profiles').update({ status: next }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setActioning(false);
      return;
    }
    await logAudit(
      next === 'inactive' ? 'employee_deactivated' : 'employee_edited',
      `Employee "${employee.full_name}" ${next === 'inactive' ? 'deactivated' : 'reactivated'}`,
      currentUser,
    );
    toast({ title: `Employee ${next === 'inactive' ? 'deactivated' : 'reactivated'}` });
    setConfirmDeactivate(false);
    setActioning(false);
    load();
  };

  const handleAnonymise = async () => {
    if (!id || !employee) return;
    setActioning(true);
    const { error } = await supabase.rpc('soft_delete_employee', { user_id: id });
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      setActioning(false);
      return;
    }
    await logAudit('employee_deleted', `Employee "${employee.full_name}" permanently anonymised`, currentUser);
    navigate('/employees', { replace: true });
  };

  const uploadPhoto = async (file: File) => {
    if (!id) return;
    setUploadingPhoto(true);
    const compressed = await compressImage(file);
    const ext = compressed.name.split('.').pop() || 'jpg';
    // Path convention is `{target_user_id}/{timestamp}.{ext}`.
    //   • For self-upload the first folder is auth.uid() — passes the
    //     bucket's per-user RLS.
    //   • For admin editing another user's photo, the admin role
    //     bypasses the per-user check via the OR clause in the policy.
    // Timestamp suffix means we never overwrite the existing file in
    // place (avoids stale CDN edges showing the previous photo).
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, compressed, { upsert: true, cacheControl: '3600' });
    if (upErr) {
      toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' });
      setUploadingPhoto(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: saveErr } = await supabase
      .from('profiles')
      .update({ photo_url: publicUrl })
      .eq('id', id);
    if (saveErr) {
      toast({ title: 'Failed to save photo', description: saveErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'Photo updated' });
      load();
    }
    setUploadingPhoto(false);
  };

  const uploadEmployeeDocument = async () => {
    if (!id || !docFile) {
      toast({ title: 'Pick a file first', variant: 'destructive' });
      return;
    }
    if (!docForm.title.trim()) {
      toast({ title: 'Add a title for the document', variant: 'destructive' });
      return;
    }
    setDocUploading(true);
    try {
      const compressed = await compressImage(docFile);
      const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `employee-documents/${id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, compressed, {
          upsert: false,
          contentType: compressed.type || 'application/octet-stream',
        });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);

      const { error: insErr } = await supabase.from('documents').insert({
        title: docForm.title.trim(),
        category: docForm.category,
        description: docForm.description.trim() || null,
        expires_at: docForm.expires_at || null,
        storage_path: path,
        file_url: urlData.publicUrl,
        mime_type: compressed.type || null,
        file_size_bytes: compressed.size,
        employee_id: id,
        uploaded_by: currentUser?.id || null,
      });
      if (insErr) throw insErr;

      await logAudit(
        'document_uploaded',
        `Document "${docForm.title}" uploaded for ${employee?.full_name || id}`,
        currentUser,
      );
      toast({ title: 'Document uploaded' });
      setDocUploadOpen(false);
      setDocFile(null);
      setDocForm({ title: '', category: 'contract', description: '', expires_at: '' });
      load();
    } catch (err: unknown) {
      toast({
        title: 'Upload failed',
        description: errorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setDocUploading(false);
    }
  };

  const deleteEmployeeDocument = async (doc: any) => {
    setPendingDeleteDoc(null);
    try {
      if (doc.storage_path) {
        await supabase.storage.from('documents').remove([doc.storage_path]);
      }
      const { error } = await supabase
        .from('documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', doc.id);
      if (error) throw error;
      await logAudit(
        'document_deleted',
        `Document "${doc.title || doc.file_name}" deleted for ${employee?.full_name || id}`,
        currentUser,
      );
      toast({ title: 'Document deleted' });
      load();
    } catch (err: unknown) {
      toast({
        title: 'Delete failed',
        description: errorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const savePermissions = async () => {
    if (!id) return;
    setSavingPermissions(true);
    const { error } = await supabase
      .from('profiles')
      .update({ permissions })
      .eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('permissions_updated', `Permissions updated for "${employee?.full_name || id}"`, currentUser);
      // Realtime listener in useAuth subscribes to profile updates for the
      // logged-in user, so the change propagates to their session
      // automatically — they don't need to sign out. The toast just says
      // "Permissions saved" so admins don't get the misleading "ask the
      // user to log out and back in" message any more.
      toast({
        title: 'Permissions saved',
        description: `${employee?.full_name || 'User'}'s session updates within a few seconds — no sign-out needed.`,
      });
    }
    setSavingPermissions(false);
  };

  const recordIncrement = async () => {
    if (!id || !employee) return;
    if (incrementForm.new_salary <= 0) {
      toast({ title: 'New salary must be greater than zero', variant: 'destructive' });
      return;
    }
    setSavingIncrement(true);
    try {
      const { error: incrErr } = await supabase.from('salary_increments').insert({
        employee_id: id,
        old_salary_ngn: employee.salary_ngn,
        new_salary_ngn: incrementForm.new_salary,
        effective_date: incrementForm.effective_date,
        reason: incrementForm.reason || null,
        approved_by: currentUser?.id || null,
      });
      if (incrErr) throw incrErr;
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ salary_ngn: incrementForm.new_salary })
        .eq('id', id);
      if (profileErr) throw profileErr;
      await logAudit(
        'salary_increment',
        `Salary updated for "${employee.full_name}": ${formatNaira(employee.salary_ngn)} → ${formatNaira(incrementForm.new_salary)}`,
        currentUser,
      );
      toast({ title: 'Salary increment recorded' });
      setShowIncrementDialog(false);
      setIncrementForm({ new_salary: 0, reason: '', effective_date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err: unknown) {
      toast({ title: 'Failed to record increment', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSavingIncrement(false);
    }
  };

  const saveDeduction = async () => {
    if (!id || !deductionForm.description.trim() || !deductionForm.amount_ngn || !deductionForm.start_date) return;
    setSavingDeduction(true);
    try {
      const payload: Record<string, unknown> = {
        entity_id: id,
        entity_type: 'employee',
        description: deductionForm.description.trim(),
        amount_ngn: Number(deductionForm.amount_ngn),
        frequency: deductionForm.frequency,
        start_date: deductionForm.start_date,
        end_date: deductionForm.end_date || null,
        total_deductible_amount: deductionForm.total_deductible_amount
          ? Number(deductionForm.total_deductible_amount) : null,
        created_by: currentUser?.id || null,
      };
      const { error } = await supabase.from('employee_deductions').insert(payload);
      if (error) throw error;
      await logAudit('deduction_created', `Deduction "${deductionForm.description}" added for "${employee?.full_name}"`, currentUser);
      toast({ title: 'Deduction added' });
      setShowDeductionDialog(false);
      setDeductionForm({ description: '', amount_ngn: 0, frequency: 'monthly', start_date: new Date().toISOString().slice(0, 10), end_date: '', total_deductible_amount: '' });
      load();
    } catch (err: unknown) {
      toast({ title: 'Failed to add deduction', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSavingDeduction(false);
    }
  };

  const deactivateDeduction = async (deductionId: string) => {
    const { error } = await supabase.from('employee_deductions').update({ status: 'paused' }).eq('id', deductionId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Deduction paused' });
    load();
  };

  const saveEarning = async () => {
    if (!id || !earningForm.description.trim() || !earningForm.amount_ngn || !earningForm.start_date) return;
    setSavingEarning(true);
    try {
      const payload: Record<string, unknown> = {
        entity_id: id,
        entity_type: 'employee',
        description: earningForm.description.trim(),
        amount_ngn: Number(earningForm.amount_ngn),
        frequency: earningForm.frequency,
        earning_type: earningForm.earning_type,
        is_taxable: earningForm.is_taxable,
        start_date: earningForm.start_date,
        end_date: earningForm.end_date || null,
        created_by: currentUser?.id || null,
      };
      const { error } = await supabase.from('employee_earnings').insert(payload);
      if (error) throw error;
      await logAudit('earning_created', `Earning "${earningForm.description}" added for "${employee?.full_name}"`, currentUser);
      toast({ title: 'Earning added' });
      setShowEarningDialog(false);
      setEarningForm({ description: '', amount_ngn: 0, frequency: 'monthly', earning_type: 'allowance', is_taxable: true, start_date: new Date().toISOString().slice(0, 10), end_date: '' });
      load();
    } catch (err: unknown) {
      toast({ title: 'Failed to add earning', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSavingEarning(false);
    }
  };

  const deactivateEarning = async (earningId: string) => {
    const { error } = await supabase.from('employee_earnings').update({ status: 'paused' }).eq('id', earningId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Earning paused' });
    load();
  };

  const openAddDependent = () => {
    setEditingDependent(null);
    setDependentForm(emptyDependentForm);
    setShowDependentDialog(true);
  };

  const openEditDependent = (dep: any) => {
    setEditingDependent(dep);
    setDependentForm({
      full_name: dep.full_name || '',
      relationship: dep.relationship || 'child',
      date_of_birth: dep.date_of_birth || '',
      gender: dep.gender || '',
      phone: dep.phone || '',
      is_beneficiary: !!dep.is_beneficiary,
      is_hmo_enrolled: !!dep.is_hmo_enrolled,
      hmo_plan_id: dep.hmo_plan_id || '',
      notes: dep.notes || '',
    });
    setShowDependentDialog(true);
  };

  const saveDependent = async () => {
    if (!id || !dependentForm.full_name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSavingDependent(true);
    try {
      const payload: Record<string, unknown> = {
        employee_id: id,
        full_name: dependentForm.full_name.trim(),
        relationship: dependentForm.relationship,
        date_of_birth: dependentForm.date_of_birth || null,
        gender: dependentForm.gender || null,
        phone: dependentForm.phone.trim() || null,
        is_beneficiary: dependentForm.is_beneficiary,
        is_hmo_enrolled: dependentForm.is_hmo_enrolled,
        hmo_plan_id: dependentForm.hmo_plan_id.trim() || null,
        notes: dependentForm.notes.trim() || null,
      };
      if (editingDependent) {
        const { error } = await supabase.from('employee_dependents').update(payload).eq('id', editingDependent.id);
        if (error) throw error;
        await logAudit('dependent_updated', `Dependent "${dependentForm.full_name}" updated for "${employee?.full_name}"`, currentUser);
        toast({ title: 'Dependent updated' });
      } else {
        const { error } = await supabase.from('employee_dependents').insert(payload);
        if (error) throw error;
        await logAudit('dependent_added', `Dependent "${dependentForm.full_name}" added for "${employee?.full_name}"`, currentUser);
        toast({ title: 'Dependent added' });
      }
      setShowDependentDialog(false);
      setEditingDependent(null);
      setDependentForm(emptyDependentForm);
      load();
    } catch (err: unknown) {
      toast({ title: 'Failed to save dependent', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSavingDependent(false);
    }
  };

  const deleteDependent = async () => {
    if (!deleteDependentTarget) return;
    setDeletingDependent(true);
    try {
      const { error } = await supabase.from('employee_dependents').delete().eq('id', deleteDependentTarget.id);
      if (error) throw error;
      await logAudit('dependent_deleted', `Dependent "${deleteDependentTarget.full_name}" removed from "${employee?.full_name}"`, currentUser);
      toast({ title: 'Dependent removed' });
      setDeleteDependentTarget(null);
      load();
    } catch (err: unknown) {
      toast({ title: 'Delete failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setDeletingDependent(false);
    }
  };

  const toggleDependentFlag = async (dep: any, field: 'is_beneficiary' | 'is_hmo_enrolled') => {
    const { error } = await supabase.from('employee_dependents').update({ [field]: !dep[field] }).eq('id', dep.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    load();
  };

  const dependentAge = (dob: string | null): string => {
    if (!dob) return '—';
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return '—';
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
    return `${years}`;
  };

  const relationshipLabel = (rel: string) =>
    ({ spouse: 'Spouse', child: 'Child', parent: 'Parent', sibling: 'Sibling', other: 'Other' } as Record<string, string>)[rel] || rel;

  const yoyGrowth = useMemo(() => {
    if (increments.length === 0 || !employee?.salary_ngn) return null;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const past = increments.find((i) => new Date(i.effective_date) <= oneYearAgo);
    if (!past) return null;
    return ((employee.salary_ngn - past.new_salary_ngn) / past.new_salary_ngn) * 100;
  }, [increments, employee]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !employee) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-3 rounded-xl border bg-card p-6 shadow-sm">
          <p className="text-base font-semibold">Couldn't load this employee</p>
          <p className="text-sm text-muted-foreground break-words">
            {loadError || 'No data was returned for this profile.'}
          </p>
          <p className="text-xs text-muted-foreground">
            If this persists, check the Supabase status page — connection drops normally clear within a minute.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate('/employees')}>
              Back to list
            </Button>
            <Button onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const patch = (p: Partial<EmployeeData>) => setForm((prev) => ({ ...prev, ...p }));
  const empName = displayName(employee.first_name, employee.last_name, employee.full_name);
  const leaveTaken = leaves.filter((l: any) => l.status === 'approved').reduce((sum: number, l: any) => sum + Number(l.days_requested ?? l.days ?? 0), 0);

  // ── Compensation (derived from monthly gross) ────────────────────────────
  const hasSalary = !!employee.salary_ngn;
  const salary    = employee.salary_ngn || 0;
  // Each statutory deduction has a per-employee toggle. Defaults match
  // Nigerian regulatory baseline: PAYE + Pension on, NHF + NHIS off
  // (NHF and NHIS only become mandatory in specific cases).
  const payeOn    = employee.paye_enabled !== false;    // default true
  const pensionOn = employee.pension_enabled !== false; // default true
  const nhfOn     = employee.nhf_enabled === true;      // default false
  const nhisOn    = employee.nhis_enabled === true;     // default false

  const payslipBreakdown = hasSalary
    ? computePayslip({
        grossMonthlyNgn: salary,
        pensionEnabled: pensionOn,
        nhfEnabled: nhfOn,
        nhisEnabled: nhisOn,
        payeEnabled: payeOn,
        voluntaryPensionPct: Number(employee.voluntary_pension_pct || 0),
        useComponents: !!(employee as any).use_salary_components,
        basicMonthlyNgn: Number((employee as any).basic_ngn || 0),
        housingMonthlyNgn: Number((employee as any).housing_ngn || 0),
        transportMonthlyNgn: Number((employee as any).transport_ngn || 0),
        otherAllowancesMonthlyNgn: Number((employee as any).other_allowances_ngn || 0),
      })
    : null;
  const payeMonthly            = payslipBreakdown?.payeMonthlyNgn ?? 0;
  const pensionEmployeeMonthly = payslipBreakdown?.pensionEmployeeMonthlyNgn ?? 0;
  const pensionEmployerMonthly = payslipBreakdown?.pensionEmployerMonthlyNgn ?? 0;
  const nhfMonthly             = payslipBreakdown?.nhfMonthlyNgn ?? 0;
  const nhisMonthly            = payslipBreakdown?.nhisEmployeeMonthlyNgn ?? 0;
  const avcMonthly             = payslipBreakdown?.voluntaryPensionMonthlyNgn ?? 0;
  const statutoryDeductMonthly = pensionEmployeeMonthly + avcMonthly + nhfMonthly + nhisMonthly;
  const totalDeductMonthly     = payeMonthly + statutoryDeductMonthly;
  const employerContribMonthly = pensionEmployerMonthly;
  const netMonthly             = payslipBreakdown?.netMonthlyNgn ?? 0;

  const canManage    = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canFinance   = ['super_admin', 'admin', 'finance'].includes(currentUser?.role ?? '');

  // ── Total cost of employment (trailing 12 months) ────────────────────────
  // Payroll: employer pension is back-derived from the employee-side pension
  // actually withheld on each payslip (pension_ngn × EMPLOYER/EMPLOYEE rate), so it
  // reflects what was really withheld that period rather than re-estimating
  // from today's salary structure. NSITF has no employee-side figure to back
  // out of, so it's recomputed from gross at the current company toggle —
  // the one figure here that assumes today's setting applied throughout.
  // Loans and advances are deliberately excluded: they're repayable cash the
  // employee already owes back, not new cost to the company.
  const costCutoff = new Date();
  costCutoff.setMonth(costCutoff.getMonth() - 12);
  const payslipsInRange = payslips.filter((p: any) => p.created_at && new Date(p.created_at) >= costCutoff);
  const payrollGross          = payslipsInRange.reduce((s: number, p: any) => s + Number(p.gross_ngn || 0), 0);
  const payrollEmployerPension = payslipsInRange.reduce((s: number, p: any) => s + Number(p.employer_pension_ngn || 0) || Number(p.pension_ngn || 0) * PENSION_EMPLOYER_RATE / PENSION_EMPLOYEE_RATE, 0);
  const payrollEmployerNsitf   = nsitfEnabled ? Math.round(payrollGross * 0.01) : 0;
  const payrollTotal = payrollGross + payrollEmployerPension + payrollEmployerNsitf;

  const approvedExpenses = expenses.filter((e: any) => e.status === 'approved' && (!e.date || new Date(e.date) >= costCutoff));
  const expensesTotal = approvedExpenses.reduce((s: number, e: any) => s + Number(e.amount_ngn || 0), 0);

  // Benefits: only HMO / group life / other are real employer spend — pension_pfa
  // rows are excluded because employer pension cost is already counted above.
  const BENEFIT_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, annually: 12 };
  const costedBenefits = benefits.filter((b: any) => b.benefit_type !== 'pension_pfa');
  const benefitsMonthly = costedBenefits.reduce((s: number, b: any) => {
    const months = BENEFIT_MONTHS[b.premium_frequency] || 1;
    return s + Number(b.premium_ngn || 0) / months;
  }, 0);
  const benefitsAnnualized = benefitsMonthly * 12;

  const assetsBookValue = assignedAssets.reduce((s: number, a: any) => s + Number(a.cost_ngn || 0), 0);

  const totalCostOfEmployment = payrollTotal + expensesTotal + benefitsAnnualized;

  // Role-editing guards.
  const isSelf = currentUser?.id === id;
  const targetRoleIsAdminOrAbove = ['admin', 'super_admin'].includes(employee?.role ?? '');
  // Admins can only set roles strictly below admin; super_admins can set any role.
  // Neither can change their own role.
  const canEditRole = !isSelf && (isSuperAdmin || (canManage && !targetRoleIsAdminOrAbove));
  // Roles that the current user is allowed to assign.
  const assignableRoles = isSuperAdmin
    ? ['super_admin', 'admin', 'finance', 'operations', 'field_staff']
    : ['finance', 'operations', 'field_staff'];

  return (
    <div className="max-w-5xl mx-auto">
      <PageBreadcrumbs trail={[
        { label: 'Employees', href: '/employees' },
        { label: empName || 'Employee' },
      ]} />

      {/* ── Profile header card ── */}
      <div className="bg-card border rounded-xl px-6 py-4">
        <div className="flex items-center gap-4">

          {/* Avatar — click to upload. Camera badge stays visible (not
              hover-only) so the upload affordance is discoverable
              without needing to mouse-over first. Hover still shows the
              full overlay for the explicit "you can change this" cue. */}
          <button
            type="button"
            onClick={() => avatarFileRef.current?.click()}
            disabled={uploadingPhoto}
            title={employee.photo_url ? 'Change profile photo' : 'Upload profile photo'}
            className="relative h-16 w-16 rounded-full shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {employee.photo_url ? (
              <img
                src={employee.photo_url}
                alt={empName}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-background shadow"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center ring-2 ring-background shadow">
                <span className="text-xl font-bold text-primary-foreground">
                  {initialsOf(employee.first_name, employee.last_name, employee.full_name)}
                </span>
              </div>
            )}
            {/* Persistent camera badge at the bottom-right of the avatar.
                Brand-coloured ring matches the rest of the surface. */}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background shadow-md kd-transition group-hover:scale-110">
              {uploadingPhoto
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Camera className="h-3 w-3" />}
            </span>
            {/* Hover overlay — full-bleed dimmed prompt */}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                {employee.photo_url ? 'Change' : 'Upload'}
              </span>
            </div>
          </button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }}
          />

          {/* Name / role / email */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold leading-tight">{empName}</h1>
              <Badge
                className={
                  employee.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-100'
                }
              >
                {employee.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
              {/* WhatsApp deep-link in the profile header — most KD
                  Squares ops conversations happen on WhatsApp, so the
                  one-click "open chat" button removes the friction
                  of copy/paste from the phone field below. */}
              <WhatsAppButton
                phone={employee.phone}
                size="sm"
                variant="outline"
                label="WhatsApp"
              />
            </div>
            <p className="text-muted-foreground text-sm mt-0.5 truncate">
              {employee.job_title || roleLabel(employee.role)} &middot; {employee.email}
            </p>
          </div>

          {/* Manage dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="shrink-0">
                Manage <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManage && (
                <DropdownMenuItem onClick={() => { setActiveTab('job_pay'); startEdit('employment'); }}>
                  Edit Employment
                </DropdownMenuItem>
              )}
              {canManage && (
                <DropdownMenuItem onClick={() => { setActiveTab('personal'); startEdit('basic'); }}>
                  Edit Personal Info
                </DropdownMenuItem>
              )}
              {canManage && (
                <DropdownMenuItem onClick={() => { setActiveTab('statutory'); startEdit('statutory'); }}>
                  Edit Statutory
                </DropdownMenuItem>
              )}
              {canManage && currentUser?.id !== id && (
                <DropdownMenuItem onClick={() => setConfirmDeactivate(true)}>
                  Deactivate
                </DropdownMenuItem>
              )}
              {isSuperAdmin && currentUser?.id !== id && employee?.status === 'active' && (
                <DropdownMenuItem
                  onClick={() => {
                    if (window.confirm(`Log in as ${employee?.full_name || 'this user'}? You'll see and act on the app exactly as they do until you exit.`)) {
                      handleImpersonate();
                    }
                  }}
                >
                  Log in as this user
                </DropdownMenuItem>
              )}
              {isSuperAdmin && currentUser?.id !== id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => setConfirmAnonymise(true)}
                  >
                    Delete &amp; Anonymise
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div className="flex border-b mt-6 overflow-x-auto">
        {([
          { key: 'job_pay',   label: 'Job & Pay'                        },
          { key: 'personal',  label: 'Personal'                         },
          { key: 'statutory', label: 'Statutory'                        },
          { key: 'documents', label: 'Documents'                        },
          { key: 'tasks',     label: 'Tasks'                            },
          { key: 'logs',      label: 'Logs'                             },
          { key: 'leave',     label: `Leave (${leaves.length})`         },
          { key: 'expenses',  label: `Expenses (${expenses.length})`    },
          { key: 'payroll',   label: 'Payroll'                          },
          { key: 'placements', label: `Placements (${empPlacements.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        {canFinance && (
          <button
            onClick={() => setActiveTab('deductions')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === 'deductions'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {`Deductions (${deductions.length})`}
          </button>
        )}
        {canFinance && (
          <button
            onClick={() => setActiveTab('earnings')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === 'earnings'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {`Earnings (${earnings.filter((e: any) => e.status === 'active').length})`}
          </button>
        )}
        {increments.length > 0 && (
          <button
            onClick={() => setActiveTab('increments')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === 'increments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {`Increments (${increments.length})`}
          </button>
        )}
        {advances.filter((a) => a.status === 'active').length > 0 && (
          <button
            onClick={() => setActiveTab('advances')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === 'advances'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {`Advances (${advances.filter((a) => a.status === 'active').length})`}
          </button>
        )}
        {canFinance && (
          <button
            onClick={() => setActiveTab('total_cost')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === 'total_cost'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            Total Cost
          </button>
        )}
        {canManage && (
          <button
            onClick={() => setActiveTab('permissions')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === 'permissions'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            Permissions
          </button>
        )}
        {canManage && (
          <button
            onClick={() => setActiveTab('offboarding')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === 'offboarding'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            Offboarding
          </button>
        )}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'job_pay' && (
        <JobPayTab
          employee={employee}
          form={form}
          patch={patch}
          editingSection={editingSection}
          sectionSaving={sectionSaving}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveSection={saveSection}
          canManage={canManage}
          comp={{
            hasSalary, salary, payeMonthly, pensionOn, pensionEmployeeMonthly,
            avcMonthly, nhfOn, nhfMonthly, nhisOn, nhisMonthly,
            totalDeductMonthly, netMonthly, employerContribMonthly,
          }}
          onOpenIncrementDialog={() => setShowIncrementDialog(true)}
          departments={departments}
          payGroups={payGroups}
          managers={managers}
          canEditRole={canEditRole}
          isSelf={isSelf}
          assignableRoles={assignableRoles}
          bankEditMode={bankEditMode}
          setBankEditMode={setBankEditMode}
          bankDetails={bankDetails}
          setBankDetails={setBankDetails}
          activeProvider={activeProvider}
          bankSaving={bankSaving}
          saveBank={saveBank}
          openBankHistory={openBankHistory}
          bankRequests={bankRequests}
          showBankRequestForm={showBankRequestForm}
          setShowBankRequestForm={setShowBankRequestForm}
          bankRequestDetails={bankRequestDetails}
          setBankRequestDetails={setBankRequestDetails}
          bankRequestReason={bankRequestReason}
          setBankRequestReason={setBankRequestReason}
          submittingBankRequest={submittingBankRequest}
          submitBankChangeRequest={submitBankChangeRequest}
          handleApproveBankRequest={handleApproveBankRequest}
          setRejectingBankRequest={setRejectingBankRequest}
          setBankRejectReason={setBankRejectReason}
          payslips={payslips}
          selectedPayslipId={selectedPayslipId}
          setSelectedPayslipId={setSelectedPayslipId}
          previewPayslip={previewPayslip}
          downloadPayslip={downloadPayslip}
          humanPeriod={humanPeriod}
          setActiveTab={setActiveTab as (tab: string) => void}
        />
      )}


      {activeTab === 'personal' && (
        <PersonalTab
          employee={employee}
          form={form}
          patch={patch}
          editingSection={editingSection}
          sectionSaving={sectionSaving}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveSection={saveSection}
          canManage={canManage}
          dependents={dependents}
          openAddDependent={() => {
            setEditingDependent(null);
            setDependentForm(emptyDependentForm);
            setShowDependentDialog(true);
          }}
          openEditDependent={(dep) => {
            setEditingDependent(dep);
            setDependentForm({
              full_name: dep.full_name || '',
              relationship: dep.relationship || 'spouse',
              gender: dep.gender || null,
              date_of_birth: dep.date_of_birth || '',
              phone: dep.phone || '',
              is_beneficiary: !!dep.is_beneficiary,
              is_hmo_enrolled: !!dep.is_hmo_enrolled,
              hmo_plan_id: dep.hmo_plan_id || '',
              notes: dep.notes || '',
            });
            setShowDependentDialog(true);
          }}
          setDeleteDependentTarget={setDeleteDependentTarget}
          toggleDependentFlag={toggleDependentFlag}
          dependentAge={dependentAge}
          relationshipLabel={relationshipLabel}
        />
      )}

      {activeTab === 'statutory' && (
        <StatutoryTab
          employee={employee}
          form={form}
          patch={patch}
          editingSection={editingSection}
          sectionSaving={sectionSaving}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveSection={saveSection}
          canManage={canManage}
        />
      )}

      {activeTab === 'documents' && (
        <DocumentsTab
          employeeId={id}
          documents={documents}
          canManage={canManage}
          onOpenUploadDialog={() => setDocUploadOpen(true)}
          onDeleteDocument={setPendingDeleteDoc}
        />
      )}

      {/* ── Document upload dialog ────────────────────────────────────── */}
      <Dialog open={docUploadOpen} onOpenChange={setDocUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document for {employee?.first_name || 'employee'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="doc-file">File</Label>
              <Input
                id="doc-file"
                type="file"
                accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setDocFile(f);
                  if (f && !docForm.title) {
                    setDocForm((s) => ({ ...s, title: f.name.replace(/\.[^.]+$/, '') }));
                  }
                }}
              />
              {docFile && (
                <p className="text-xs text-muted-foreground">
                  {docFile.name} · {(docFile.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                value={docForm.title}
                onChange={(e) => setDocForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g. Employment Contract 2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="doc-category">Category</Label>
                <Select
                  value={docForm.category}
                  onValueChange={(v) => setDocForm((s) => ({ ...s, category: v }))}
                >
                  <SelectTrigger id="doc-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="nda">NDA</SelectItem>
                    <SelectItem value="id">ID / passport</SelectItem>
                    <SelectItem value="cv">CV / resume</SelectItem>
                    <SelectItem value="certificate">Certificate</SelectItem>
                    <SelectItem value="reference">Reference letter</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-expiry">Expiry (optional)</Label>
                <Input
                  id="doc-expiry"
                  type="date"
                  value={docForm.expires_at}
                  onChange={(e) => setDocForm((s) => ({ ...s, expires_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="doc-description">Description (optional)</Label>
              <Input
                id="doc-description"
                value={docForm.description}
                onChange={(e) => setDocForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Brief note about this document"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocUploadOpen(false)} disabled={docUploading}>
              Cancel
            </Button>
            <Button onClick={uploadEmployeeDocument} disabled={docUploading || !docFile}>
              {docUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeTab === 'tasks' && (
        <TasksTab tasks={tasks} />
      )}

      {activeTab === 'logs' && (
        <LogsTab auditLogs={auditLogs} />
      )}

      {activeTab === 'leave' && id && (
        <LeaveTab
          employeeId={id}
          employee={employee}
          leaves={leaves}
          leaveTaken={leaveTaken}
        />
      )}

      {activeTab === 'expenses' && (
        <ExpensesTab expenses={expenses} />
      )}

      {activeTab === 'payroll' && (
        <PayrollTab
          payslips={payslips}
          payments={employeePayments}
          humanPeriod={humanPeriod}
          previewPayslip={previewPayslip}
          downloadPayslip={downloadPayslip}
        />
      )}

      {activeTab === 'total_cost' && canFinance && (
        <TotalCostTab
          totalCostOfEmployment={totalCostOfEmployment}
          payrollTotal={payrollTotal}
          payrollGross={payrollGross}
          payrollEmployerPension={payrollEmployerPension}
          payrollEmployerNsitf={payrollEmployerNsitf}
          nsitfEnabled={nsitfEnabled}
          payslipsInRange={payslipsInRange}
          expensesTotal={expensesTotal}
          approvedExpenses={approvedExpenses}
          expensesCount={approvedExpenses.length}
          benefitsAnnualized={benefitsAnnualized}
          costedBenefits={costedBenefits}
          assignedAssets={assignedAssets}
          assetsBookValue={assetsBookValue}
        />
      )}

      {activeTab === 'deductions' && canFinance && (
        <DeductionsTab
          deductions={deductions}
          canFinance={canFinance}
          onShowDeductionDialog={() => setShowDeductionDialog(true)}
          onDeactivateDeduction={deactivateDeduction}
        />
      )}

      {activeTab === 'earnings' && canFinance && (
        <EarningsTab
          earnings={earnings}
          canFinance={canFinance}
          onShowEarningDialog={() => setShowEarningDialog(true)}
          onDeactivateEarning={deactivateEarning}
        />
      )}

      {activeTab === 'increments' && (
        <IncrementsTab
          increments={increments}
          canManage={canManage}
          onShowIncrementDialog={() => setShowIncrementDialog(true)}
        />
      )}

      {activeTab === 'advances' && (
        <AdvancesTab advances={advances} />
      )}

      {activeTab === 'permissions' && canManage && (
        <PermissionsTab
          employee={{ full_name: employee.full_name, role: employee.role }}
          permissions={permissions}
          onPermissionsChange={setPermissions}
          onSave={savePermissions}
          saving={savingPermissions}
        />
      )}

      {activeTab === 'offboarding' && canManage && employee && (
        <OffboardingTab
          employee={{
            id: employee.id,
            full_name: employee.full_name,
            salary_ngn: employee.salary_ngn,
            status: employee.status,
            start_date: employee.start_date,
            notice_period_days: employee.notice_period_days,
          }}
          onChanged={load}
        />
      )}

      {activeTab === 'placements' && (
        <PlacementsTab
          empPlacements={empPlacements}
          empPlacementPayments={empPlacementPayments}
        />
      )}


      {/* ── Deactivate dialog ── */}
      <Dialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {employee?.first_name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            They will lose platform access immediately.
            Their records remain visible and this can
            be reversed by an admin.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={actioning}>
              {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete & Anonymise dialog ── */}
      <Dialog open={confirmAnonymise} onOpenChange={(o) => { if (!o) { setConfirmAnonymise(false); setAnonymiseInput(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">
              Permanently delete {employee?.first_name}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Their account will be permanently closed</li>
              <li>Their name and contact details will be erased</li>
              <li>Payment records will show as "Former Employee"</li>
              <li className="text-red-600 font-medium">This CANNOT be undone.</li>
            </ul>
            <p className="text-sm font-medium">Type DELETE to confirm:</p>
            <Input
              value={anonymiseInput}
              onChange={(e) => setAnonymiseInput(e.target.value)}
              placeholder="Type DELETE"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmAnonymise(false); setAnonymiseInput(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={anonymiseInput !== 'DELETE' || actioning}
              onClick={handleAnonymise}
            >
              {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Legacy edit dialogs (Edit Profile / Basic / Kin / Address) removed —
          all of those sections now edit inline on their respective cards. */}

      {/* ── Add Salary Increment dialog ── */}
      <Dialog
        open={showIncrementDialog}
        onOpenChange={(v) => {
          if (!v) {
            setShowIncrementDialog(false);
            setIncrementForm({ new_salary: 0, reason: '', effective_date: new Date().toISOString().slice(0, 10) });
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Salary Increment</DialogTitle>
            <DialogDescription>
              Record a salary change for {empName}. Current salary:{' '}
              {formatNaira(employee?.salary_ngn || 0)}/month.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="increment-effective-date">Effective date</Label>
              <Input
                id="increment-effective-date"
                type="date"
                value={incrementForm.effective_date}
                onChange={(e) => setIncrementForm((p) => ({ ...p, effective_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="increment-new-salary">New monthly salary (₦)</Label>
              <Input
                id="increment-new-salary"
                type="number"
                min={0}
                value={incrementForm.new_salary || ''}
                onChange={(e) => setIncrementForm((p) => ({ ...p, new_salary: Number(e.target.value) }))}
                placeholder="Enter new salary…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="increment-reason">Reason</Label>
              <Textarea
                id="increment-reason"
                rows={3}
                value={incrementForm.reason}
                onChange={(e) => setIncrementForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="Performance review, promotion, cost of living adjustment…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowIncrementDialog(false);
                setIncrementForm({ new_salary: 0, reason: '', effective_date: new Date().toISOString().slice(0, 10) });
              }}
            >
              Cancel
            </Button>
            <Button onClick={recordIncrement} disabled={savingIncrement || incrementForm.new_salary <= 0}>
              {savingIncrement && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Increment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Dependent Dialog */}
      <Dialog
        open={showDependentDialog}
        onOpenChange={(v) => {
          if (!v) {
            setShowDependentDialog(false);
            setEditingDependent(null);
            setDependentForm(emptyDependentForm);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDependent ? 'Edit Dependent' : 'Add Dependent'}</DialogTitle>
            <DialogDescription>
              Family member details for {empName} — used for HMO enrollment and beneficiary records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="dependent-full-name">Full name</Label>
              <Input
                id="dependent-full-name"
                value={dependentForm.full_name}
                onChange={(e) => setDependentForm((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="e.g. Amaka Okafor"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dependent-relationship">Relationship</Label>
                <Select
                  value={dependentForm.relationship}
                  onValueChange={(v) => setDependentForm((p) => ({ ...p, relationship: v as typeof p.relationship }))}
                >
                  <SelectTrigger id="dependent-relationship"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spouse">Spouse</SelectItem>
                    <SelectItem value="child">Child</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="sibling">Sibling</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dependent-gender">Gender</Label>
                <Select
                  value={dependentForm.gender || undefined}
                  onValueChange={(v) => setDependentForm((p) => ({ ...p, gender: v as typeof p.gender }))}
                >
                  <SelectTrigger id="dependent-gender"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dependent-dob">Date of birth</Label>
                <Input
                  id="dependent-dob"
                  type="date"
                  value={dependentForm.date_of_birth}
                  onChange={(e) => setDependentForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dependent-phone">Phone</Label>
                <Input
                  id="dependent-phone"
                  value={dependentForm.phone}
                  onChange={(e) => setDependentForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Beneficiary</Label>
                <p className="text-xs text-muted-foreground">Nominated for group life / pension payout</p>
              </div>
              <Switch
                checked={dependentForm.is_beneficiary}
                onCheckedChange={(v) => setDependentForm((p) => ({ ...p, is_beneficiary: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">HMO enrolled</Label>
                <p className="text-xs text-muted-foreground">Covered under the employee's HMO plan</p>
              </div>
              <Switch
                checked={dependentForm.is_hmo_enrolled}
                onCheckedChange={(v) => setDependentForm((p) => ({ ...p, is_hmo_enrolled: v }))}
              />
            </div>
            {dependentForm.is_hmo_enrolled && (
              <div className="space-y-1.5">
                <Label htmlFor="dependent-hmo-plan">HMO plan / ID</Label>
                <Input
                  id="dependent-hmo-plan"
                  value={dependentForm.hmo_plan_id}
                  onChange={(e) => setDependentForm((p) => ({ ...p, hmo_plan_id: e.target.value }))}
                  placeholder="Plan reference or member ID"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="dependent-notes">Notes</Label>
              <Textarea
                id="dependent-notes"
                rows={2}
                value={dependentForm.notes}
                onChange={(e) => setDependentForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDependentDialog(false);
                setEditingDependent(null);
                setDependentForm(emptyDependentForm);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveDependent} disabled={savingDependent || !dependentForm.full_name.trim()}>
              {savingDependent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingDependent ? 'Save Changes' : 'Add Dependent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dependent confirmation */}
      <AlertDialog open={!!deleteDependentTarget} onOpenChange={(o) => { if (!o) setDeleteDependentTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteDependentTarget?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes this dependent record, including any beneficiary or HMO enrollment status. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDependent}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteDependent}
              disabled={deletingDependent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingDependent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Deduction Dialog */}
      <Dialog open={showDeductionDialog} onOpenChange={(o) => { if (!o) setShowDeductionDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Deduction</DialogTitle>
            <DialogDescription>Schedule a recurring or one-time deduction for this employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="deduction-description">Description <span className="text-destructive">*</span></Label>
              <Input
                id="deduction-description"
                className="mt-1"
                placeholder="e.g. Staff loan repayment"
                value={deductionForm.description}
                onChange={(e) => setDeductionForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="deduction-amount">Amount per period (₦) <span className="text-destructive">*</span></Label>
                <Input
                  id="deduction-amount"
                  className="mt-1"
                  type="number"
                  min={1}
                  placeholder="0"
                  value={deductionForm.amount_ngn || ''}
                  onChange={(e) => setDeductionForm((f) => ({ ...f, amount_ngn: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="deduction-frequency">Frequency</Label>
                <Select value={deductionForm.frequency} onValueChange={(v) => setDeductionForm((f) => ({ ...f, frequency: v as typeof f.frequency }))}>
                  <SelectTrigger id="deduction-frequency" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="per_payroll_run">Per Payroll Run</SelectItem>
                    <SelectItem value="one_time">One-Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="deduction-start-date">Start Date <span className="text-destructive">*</span></Label>
                <Input id="deduction-start-date" className="mt-1" type="date" value={deductionForm.start_date}
                  onChange={(e) => setDeductionForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="deduction-end-date">End Date (optional)</Label>
                <Input id="deduction-end-date" className="mt-1" type="date" value={deductionForm.end_date}
                  onChange={(e) => setDeductionForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="deduction-total-cap">Total deductible amount (₦, optional)</Label>
              <Input id="deduction-total-cap" className="mt-1" type="number" min={0} placeholder="Leave blank for no cap"
                value={deductionForm.total_deductible_amount}
                onChange={(e) => setDeductionForm((f) => ({ ...f, total_deductible_amount: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1">Deductions stop automatically when this total is reached.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeductionDialog(false)}>Cancel</Button>
            <Button
              onClick={saveDeduction}
              disabled={savingDeduction || !deductionForm.description.trim() || !deductionForm.amount_ngn || !deductionForm.start_date}
            >
              {savingDeduction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Deduction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEarningDialog} onOpenChange={(o) => { if (!o) setShowEarningDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Recurring Earning</DialogTitle>
            <DialogDescription>Add a recurring allowance or earning for this employee (e.g. meal, utility, phone).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="earning-description">Description <span className="text-destructive">*</span></Label>
              <Input
                id="earning-description"
                className="mt-1"
                placeholder="e.g. Meal allowance"
                value={earningForm.description}
                onChange={(e) => setEarningForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="earning-amount">Amount per period (₦) <span className="text-destructive">*</span></Label>
                <Input
                  id="earning-amount"
                  className="mt-1"
                  type="number"
                  min={1}
                  placeholder="0"
                  value={earningForm.amount_ngn || ''}
                  onChange={(e) => setEarningForm((f) => ({ ...f, amount_ngn: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="earning-frequency">Frequency</Label>
                <Select value={earningForm.frequency} onValueChange={(v) => setEarningForm((f) => ({ ...f, frequency: v as typeof f.frequency }))}>
                  <SelectTrigger id="earning-frequency" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="per_payroll_run">Per Payroll Run</SelectItem>
                    <SelectItem value="one_time">One-Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="earning-type">Earning type</Label>
                <Select value={earningForm.earning_type} onValueChange={(v) => setEarningForm((f) => ({ ...f, earning_type: v as typeof f.earning_type }))}>
                  <SelectTrigger id="earning-type" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allowance">Allowance</SelectItem>
                    <SelectItem value="bonus">Bonus</SelectItem>
                    <SelectItem value="overtime">Overtime</SelectItem>
                    <SelectItem value="commission">Commission</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <input
                  type="checkbox"
                  id="earning-taxable"
                  checked={earningForm.is_taxable}
                  onChange={(e) => setEarningForm((f) => ({ ...f, is_taxable: e.target.checked }))}
                  className="h-4 w-4"
                />
                <Label htmlFor="earning-taxable" className="text-sm">Taxable</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="earning-start-date">Start Date <span className="text-destructive">*</span></Label>
                <Input id="earning-start-date" className="mt-1" type="date" value={earningForm.start_date}
                  onChange={(e) => setEarningForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="earning-end-date">End Date (optional)</Label>
                <Input id="earning-end-date" className="mt-1" type="date" value={earningForm.end_date}
                  onChange={(e) => setEarningForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEarningDialog(false)}>Cancel</Button>
            <Button
              onClick={saveEarning}
              disabled={savingEarning || !earningForm.description.trim() || !earningForm.amount_ngn || !earningForm.start_date}
            >
              {savingEarning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Earning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDeleteDoc} onOpenChange={(v) => { if (!v) setPendingDeleteDoc(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDeleteDoc?.title || pendingDeleteDoc?.file_name || 'This document'}" will be permanently removed from this employee's record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDeleteDoc && deleteEmployeeDocument(pendingDeleteDoc)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bank account change history dialog */}
      <Dialog open={showBankHistory} onOpenChange={setShowBankHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Bank account change history
            </DialogTitle>
            <DialogDescription>
              Every change to {employee?.full_name || 'this employee'}'s bank account, oldest at the bottom.
            </DialogDescription>
          </DialogHeader>
          {bankHistoryLoading ? (
            <TableSkeleton rows={6} cols={4} />
          ) : bankHistory.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground text-center">
              No bank account changes recorded for this employee.
            </p>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {bankHistory.map((entry) => {
                const meta = entry.metadata || {};
                const kind = meta.kind || (entry.action_type.replace('profile_bank_account_', ''));
                const kindColor = kind === 'cleared' ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : kind === 'set' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200';
                return (
                  <div key={entry.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[11px] uppercase font-semibold px-2 py-0.5 rounded border ${kindColor}`}>
                        {kind}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.created_at ? formatDateTime(entry.created_at) : '—'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      by <span className="font-medium text-foreground">{entry.performed_by_name || 'system'}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5">Before</p>
                        <p className="font-mono">{meta.old_bank_name || '(none)'}</p>
                        <p className="font-mono text-muted-foreground">{meta.old_account_mask || '(none)'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5">After</p>
                        <p className="font-mono">{meta.new_bank_name || '(none)'}</p>
                        <p className="font-mono text-muted-foreground">{meta.new_account_mask || '(none)'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject bank change request dialog */}
      <Dialog open={!!rejectingBankRequest} onOpenChange={(v) => { if (!v) { setRejectingBankRequest(null); setBankRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject bank account change</DialogTitle>
            <DialogDescription>
              The employee will be notified. Give a reason so they can resubmit correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bank-reject-reason" className="text-xs">Reason for rejection</Label>
            <textarea
              id="bank-reject-reason"
              className="w-full text-sm rounded-md border bg-background px-3 py-2 min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. Account name does not match payroll records…"
              value={bankRejectReason}
              onChange={(e) => setBankRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingBankRequest(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRejectBankRequest} disabled={!bankRejectReason.trim()}>
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeProfile;
