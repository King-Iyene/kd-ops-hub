import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, CalendarDays, Save, Loader2, Briefcase,
  FileText, Shield, Trash2, TrendingUp, TrendingDown, Plus, Download,
  ChevronDown, AlertTriangle, ExternalLink, Camera, History, CheckCircle2, XCircle,
  ClipboardList, Activity, Receipt,
} from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import OffboardingTab from '@/components/employee/OffboardingTab';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { roleBadgeClass, roleLabel } from '@/lib/roles';
import { formatDate, formatDateTime, formatNaira, maskAccountNumber } from '@/lib/format';
import { openPayslipPrintWindow, downloadPayslipPdfFromHtml } from '@/lib/payslip';
import { PageBreadcrumbs } from '@/components/ui-kit/PageBreadcrumbs';
import { WhatsAppButton } from '@/components/ui-kit/WhatsAppButton';
import { displayName, initialsOf } from '@/lib/name';
import { calculatePAYE } from '@/lib/tax';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getBankCode } from '@/lib/paystack';
import { PermissionsEditor, ROLE_DEFAULT_PERMISSIONS, type PermissionsMap } from '@/components/PermissionsEditor';
import { FilePreviewTrigger } from '@/components/FilePreview';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { notifyRoles } from '@/lib/notify';

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
  start_date: string | null;
  nin: string | null;
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
  state_of_residence: string | null;
}

const EmployeeProfile = () => {
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
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [increments, setIncrements] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [deductions, setDeductions] = useState<any[]>([]);
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
  const [showIncrementDialog, setShowIncrementDialog] = useState(false);
  const [savingIncrement, setSavingIncrement] = useState(false);
  const [incrementForm, setIncrementForm] = useState({
    new_salary: 0,
    reason: '',
    effective_date: new Date().toISOString().slice(0, 10),
  });
  const [activeTab, setActiveTab] = useState<'job_pay'|'personal'|'statutory'|'documents'|'tasks'|'logs'|'leave'|'expenses'|'payroll'|'increments'|'permissions'|'advances'|'deductions'|'offboarding'>('job_pay');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

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
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  // Active employees (used as the Reports-to dropdown).
  const [managers, setManagers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string>('');
  const [companySetting, setCompanySetting] = useState<{ company_name: string; logo_url: string | null }>({ company_name: 'KD Squares Ltd', logo_url: null });

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

  const downloadPayslip = async (slip: any) => {
    // Batch-item payslips have no stored file — generate HTML client-side
    if (!slip.storage_path && !slip.file_url) {
      openPayslipPrintWindow({
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
      return;
    }
    // Payroll-module payslips are stored as HTML in Supabase Storage — render
    // them to a real PDF download (same path as the employee self-service view).
    const path = slip.storage_path || slip.file_url;
    const { data, error } = await supabase.storage.from('payslips').download(path);
    if (error) { toast({ title: 'Download failed', description: error.message, variant: 'destructive' }); return; }
    try {
      const html = await data.text();
      await downloadPayslipPdfFromHtml(html, `payslip-${slip.period || path.split('/').pop()}`);
    } catch {
      // Fallback: hand back the raw stored file if PDF rendering fails.
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${path.split('/').pop()}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    // Try the joined query first. If the FK embed fails (typically when
    // the departments table or schema cache hasn't caught up yet), fall
    // back to a plain select so the page still loads — losing only the
    // department display, not the entire profile.
    let { data, error } = await supabase
      .from('profiles')
      .select('*, departments(name)')
      .eq('id', id)
      .single();
    if (error) {
      const fallback = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error || !data) {
      // Real network / RLS / not-found error — keep the user on the page
      // and show what went wrong so they can retry. Auto-navigating away
      // hid the underlying problem (auth.users.last_sign_in_at NULL,
      // Supabase pool exhausted, missing column, etc.) and made it
      // impossible to debug from the UI.
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

    // Departments for the inline Edit select.
    supabase.from('departments').select('id, name').order('name').then(({ data }) => {
      setDepartments((data as Array<{ id: string; name: string }>) || []);
    }).catch(() => { /* departments are non-critical; edit select degrades gracefully */ });

    // Active employees for the Reports-to dropdown. Excludes the employee
    // being viewed so they can't pick themselves. Read-only — managers can
    // be anyone, not just admins, so we don't filter by role.
    supabase.from('profiles')
      .select('id, full_name, email')
      .eq('status', 'active')
      .neq('id', id || '')
      .order('full_name')
      .then(({ data }) => setManagers((data as any[]) || []))
      .catch(() => { /* dropdown degrades to empty */ });

    // Company settings for payslip generation
    supabase.from('company_settings').select('company_name, logo_url')
      .eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle()
      .then(({ data: cs }) => {
        if (cs) setCompanySetting({ company_name: (cs as any).company_name || 'KD Squares Ltd', logo_url: (cs as any).logo_url || null });
      })
      .catch(() => { /* company name is cosmetic on the payslip */ });

    const [expRes, payRes, leaveRes, taskRes, docRes, auditRes, incrRes, advRes, deductRes] = await Promise.all([
      supabase.from('expenses').select('*').eq('submitted_by', id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(20),
      // Payslips: cap at most-recent 24 (= 2 years monthly) to keep this
      // page responsive even for long-tenured employees.
      supabase.from('payslips').select('*').eq('employee_id', id)
        .order('period', { ascending: false }).limit(24),
      supabase.from('leave_requests').select('*').eq('employee_id', id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('tasks').select('*').eq('assignee_id', id)
        .order('created_at', { ascending: false }).limit(20),
      // Documents tied to this employee. Prefer the employee_id link (set when an
      // admin uploads on behalf of the employee); fall back to uploaded_by for
      // legacy self-uploaded docs from before the employee_id column existed.
      supabase.from('documents').select('*')
        .or(`employee_id.eq.${id},uploaded_by.eq.${id}`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('audit_logs')
        .select('id, action_type, description, created_at, performed_by, performed_by_name')
        .or(`entity_id.eq.${id},performed_by.eq.${id}`)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('salary_increments').select('*').eq('employee_id', id)
        .order('effective_date', { ascending: false }).limit(20),
      supabase.from('employee_advances').select('*').eq('employee_id', id)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('employee_deductions').select('*')
        .eq('entity_id', id).eq('entity_type', 'employee')
        .order('created_at', { ascending: false }).limit(20),
    ]);
    setExpenses(expRes.data || []);
    setPayslips(payRes.data || []);
    setLeaves(leaveRes.data || []);
    setTasks(taskRes.data || []);
    setDocuments(docRes.data || []);
    setAuditLogs(auditRes.data || []);
    setIncrements(incrRes.data || []);
    setAdvances(advRes.data || []);
    setDeductions(deductRes.data || []);
    setLoading(false);
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

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
      .select('*')
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
    } catch (e: any) {
      toast({ title: 'Submission failed', description: e?.message, variant: 'destructive' });
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
    } catch (e: any) {
      toast({ title: 'Approval failed', description: e?.message, variant: 'destructive' });
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
    } catch (e: any) {
      toast({ title: 'Rejection failed', description: e?.message, variant: 'destructive' });
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
        setSectionSaving(false);
        return;
      }
    }
    const { error } = await supabase.from('profiles').update(payload).eq('id', id);
    if (error) {
      toast({ title: `Save failed`, description: error.message, variant: 'destructive' });
      setSectionSaving(false);
      return;
    }
    await logAudit('employee_edited', `${label} updated for "${employee?.full_name || id}"`, currentUser);
    toast({ title: `${label} saved` });
    setEditingSection(null);
    setSectionSaving(false);
    load();
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
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err?.message || 'Unknown error',
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
    } catch (err: any) {
      toast({
        title: 'Delete failed',
        description: err?.message,
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
    } catch (err: any) {
      toast({ title: 'Failed to record increment', description: err?.message, variant: 'destructive' });
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
    } catch (err: any) {
      toast({ title: 'Failed to add deduction', description: err?.message, variant: 'destructive' });
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

  const payeMonthly            = hasSalary && payeOn ? calculatePAYE(salary)       : 0;
  const pensionEmployeeMonthly = hasSalary && pensionOn ? Math.round(salary * 0.08) : 0;
  const pensionEmployerMonthly = hasSalary && pensionOn ? Math.round(salary * 0.10) : 0;
  const nhfMonthly             = hasSalary && nhfOn     ? Math.round(salary * 0.025) : 0;
  const nhisMonthly            = hasSalary && nhisOn    ? Math.round(salary * 0.0175) : 0;
  const statutoryDeductMonthly = pensionEmployeeMonthly + nhfMonthly + nhisMonthly;
  const totalDeductMonthly     = payeMonthly + statutoryDeductMonthly;
  const employerContribMonthly = pensionEmployerMonthly;
  const netMonthly             = hasSalary ? salary - totalDeductMonthly : 0;

  const canManage    = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canFinance   = ['super_admin', 'admin', 'finance'].includes(currentUser?.role ?? '');

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
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* ── LEFT column (60%) ─────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4">

            {/* Card 1 — Compensation Breakdown */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Compensation Breakdown
                </CardTitle>
                <div className="flex items-center gap-2">
                  {canManage && editingSection !== 'compensation' && (
                    <Button size="sm" variant="outline" onClick={() => startEdit('compensation')}>
                      Edit Salary
                    </Button>
                  )}
                  {editingSection === 'compensation' && (
                    <>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          // When components are on, gross = sum of components;
                          // we still persist salary_ngn so legacy queries keep working.
                          const useComps = !!form.use_salary_components;
                          const computedGross = useComps
                            ? (Number(form.basic_ngn || 0)
                              + Number(form.housing_ngn || 0)
                              + Number(form.transport_ngn || 0)
                              + Number(form.other_allowances_ngn || 0))
                            : Number(form.salary_ngn) || 0;
                          saveSection('Compensation', {
                            salary_ngn: computedGross,
                            use_salary_components: useComps,
                            basic_ngn: useComps ? (Number(form.basic_ngn || 0) || null) : null,
                            housing_ngn: useComps ? (Number(form.housing_ngn || 0) || null) : null,
                            transport_ngn: useComps ? (Number(form.transport_ngn || 0) || null) : null,
                            other_allowances_ngn: useComps ? (Number(form.other_allowances_ngn || 0) || null) : null,
                          });
                        }}
                        disabled={sectionSaving}
                      >
                        {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </>
                  )}
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setShowIncrementDialog(true)} title="Log salary change">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              {editingSection === 'compensation' && (
                <div className="px-4 pb-4 pt-1 space-y-3">
                  {/* Salary-components toggle. OFF (default) = legacy single-gross
                      behavior. ON = split into basic/housing/transport/other so
                      pension uses (basic+housing+transport) and NHF uses basic. */}
                  <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                    <Switch
                      checked={!!form.use_salary_components}
                      onCheckedChange={(v) => patch({ use_salary_components: v })}
                    />
                    <div className="flex-1">
                      <Label className="text-xs font-semibold">Use salary components (Nigerian compliance)</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        When ON, pension (8% / 10%) is calculated on Basic + Housing + Transport (PRA 2014),
                        and NHF (2.5%) on Basic only — instead of full gross. This is the legally correct base.
                        OFF preserves the current flat-gross behavior.
                      </p>
                    </div>
                  </div>

                  {!form.use_salary_components ? (
                    <div className="space-y-1.5 max-w-xs">
                      <Label className="text-xs">Monthly gross salary (₦)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.salary_ngn ?? ''}
                        onChange={(e) => patch({ salary_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use the + button to log this as a formal salary increment with history.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      <div className="space-y-1">
                        <Label className="text-xs">Basic (₦)</Label>
                        <Input
                          type="number" min={0}
                          value={form.basic_ngn ?? ''}
                          onChange={(e) => patch({ basic_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Housing (₦)</Label>
                        <Input
                          type="number" min={0}
                          value={form.housing_ngn ?? ''}
                          onChange={(e) => patch({ housing_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Transport (₦)</Label>
                        <Input
                          type="number" min={0}
                          value={form.transport_ngn ?? ''}
                          onChange={(e) => patch({ transport_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Other Allowances (₦)</Label>
                        <Input
                          type="number" min={0}
                          value={form.other_allowances_ngn ?? ''}
                          onChange={(e) => patch({ other_allowances_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-span-2 text-[11px] text-muted-foreground border-t pt-2">
                        Computed gross: <span className="font-semibold currency">
                          {formatNaira(
                            (Number(form.basic_ngn || 0) +
                              Number(form.housing_ngn || 0) +
                              Number(form.transport_ngn || 0) +
                              Number(form.other_allowances_ngn || 0))
                          )}
                        </span>
                        {' · Pension base: '}
                        <span className="font-medium currency">
                          {formatNaira(
                            (Number(form.basic_ngn || 0) +
                              Number(form.housing_ngn || 0) +
                              Number(form.transport_ngn || 0))
                          )}
                        </span>
                        {' · NHF base: '}
                        <span className="font-medium currency">{formatNaira(Number(form.basic_ngn || 0))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <CardContent className="p-0">
                {!hasSalary ? (
                  <div className="mx-4 my-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    No salary set — use Edit Profile to add salary
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="pl-4">Title</TableHead>
                        <TableHead className="text-right">Annually</TableHead>
                        <TableHead className="text-right pr-4">Monthly</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="font-medium">
                        <TableCell className="pl-4">Gross Pay</TableCell>
                        <TableCell className="text-right">{formatNaira(salary * 12)}</TableCell>
                        <TableCell className="text-right pr-4">{formatNaira(salary)}</TableCell>
                      </TableRow>
                      <TableRow className="text-muted-foreground">
                        <TableCell className="pl-4">PAYE Tax</TableCell>
                        <TableCell className="text-right">{formatNaira(payeMonthly * 12)}</TableCell>
                        <TableCell className="text-right pr-4">{formatNaira(payeMonthly)}</TableCell>
                      </TableRow>
                      {pensionOn && (
                        <TableRow className="text-muted-foreground">
                          <TableCell className="pl-4">Pension (employee) 8%</TableCell>
                          <TableCell className="text-right">{formatNaira(pensionEmployeeMonthly * 12)}</TableCell>
                          <TableCell className="text-right pr-4">{formatNaira(pensionEmployeeMonthly)}</TableCell>
                        </TableRow>
                      )}
                      {nhfOn && (
                        <TableRow className="text-muted-foreground">
                          <TableCell className="pl-4">NHF 2.5%</TableCell>
                          <TableCell className="text-right">{formatNaira(nhfMonthly * 12)}</TableCell>
                          <TableCell className="text-right pr-4">{formatNaira(nhfMonthly)}</TableCell>
                        </TableRow>
                      )}
                      {nhisOn && (
                        <TableRow className="text-muted-foreground">
                          <TableCell className="pl-4">NHIS 1.75%</TableCell>
                          <TableCell className="text-right">{formatNaira(nhisMonthly * 12)}</TableCell>
                          <TableCell className="text-right pr-4">{formatNaira(nhisMonthly)}</TableCell>
                        </TableRow>
                      )}
                      <TableRow className="text-muted-foreground border-t-2">
                        <TableCell className="pl-4">Total Deductions</TableCell>
                        <TableCell className="text-right">{formatNaira(totalDeductMonthly * 12)}</TableCell>
                        <TableCell className="text-right pr-4">{formatNaira(totalDeductMonthly)}</TableCell>
                      </TableRow>
                      <TableRow className="font-bold bg-emerald-50/60">
                        <TableCell className="pl-4 text-base">Net Pay</TableCell>
                        <TableCell className="text-right text-base">{formatNaira(netMonthly * 12)}</TableCell>
                        <TableCell className="text-right pr-4 text-base">{formatNaira(netMonthly)}</TableCell>
                      </TableRow>
                      {pensionOn && (
                        <TableRow className="text-xs text-muted-foreground bg-muted/10 border-t">
                          <TableCell className="pl-4">Employer Contribution — Pension 10%</TableCell>
                          <TableCell className="text-right">{formatNaira(employerContribMonthly * 12)}</TableCell>
                          <TableCell className="text-right pr-4">{formatNaira(employerContribMonthly)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Card 2 — Employment Details */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  Employment Details
                </CardTitle>
                {canManage && editingSection !== 'employment' && (
                  <Button size="sm" variant="outline" onClick={() => startEdit('employment')}>
                    Edit
                  </Button>
                )}
                {editingSection === 'employment' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => saveSection('Employment details', {
                        department_id: form.department_id || null,
                        role: form.role,
                        job_title: form.job_title || null,
                        employee_number: form.employee_number || null,
                        employment_type: form.employment_type || null,
                        start_date: form.start_date || null,
                        annual_leave_days: form.annual_leave_days ?? 20,
                        status: form.status,
                        // Sprint B additions
                        reporting_manager_id: form.reporting_manager_id || null,
                        contract_end_date: form.contract_end_date || null,
                        pfa_name: form.pfa_name || null,
                        state_of_residence: form.state_of_residence || null,
                      })}
                      disabled={sectionSaving}
                    >
                      {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Save
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {editingSection === 'employment' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Department</Label>
                        <Select
                          value={form.department_id || ''}
                          onValueChange={(v) => patch({ department_id: v || null })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {departments.map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Role
                          {!canEditRole && (
                            <span className="ml-1 text-muted-foreground font-normal">
                              {isSelf ? '(cannot change your own role)' : '(read-only)'}
                            </span>
                          )}
                        </Label>
                        <Select
                          value={form.role || ''}
                          onValueChange={(v) => patch({ role: v })}
                          disabled={!canEditRole}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {assignableRoles.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r === 'super_admin' ? 'Super Admin'
                                  : r === 'admin' ? 'Admin'
                                  : r === 'finance' ? 'Finance'
                                  : r === 'operations' ? 'Operations'
                                  : 'Field Staff'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Job title</Label>
                      <Input value={form.job_title || ''} onChange={(e) => patch({ job_title: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Employee number</Label>
                        <Input value={form.employee_number || ''} onChange={(e) => patch({ employee_number: e.target.value || null })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Employment type</Label>
                        <Select value={form.employment_type || ''} onValueChange={(v) => patch({ employment_type: v || null })}>
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Full-time">Full-time</SelectItem>
                            <SelectItem value="Part-time">Part-time</SelectItem>
                            <SelectItem value="Contract">Contract</SelectItem>
                            <SelectItem value="Intern">Intern</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Start date</Label>
                        <Input type="date" value={form.start_date || ''} onChange={(e) => patch({ start_date: e.target.value || null })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Annual leave days</Label>
                        <Input
                          type="number"
                          min={0}
                          value={form.annual_leave_days ?? ''}
                          onChange={(e) => patch({ annual_leave_days: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Status</Label>
                      <Select value={form.status || ''} onValueChange={(v) => patch({ status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="on_leave">On leave</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Sprint B — reporting manager + extras. Each field is
                        independently optional so legacy profiles keep working. */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Reports to (manager)</Label>
                        <Select
                          value={form.reporting_manager_id || '__none__'}
                          onValueChange={(v) => patch({ reporting_manager_id: v === '__none__' ? null : v })}
                        >
                          <SelectTrigger><SelectValue placeholder="No manager assigned" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— No manager —</SelectItem>
                            {managers.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.full_name || m.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Contract end date</Label>
                        <Input
                          type="date"
                          value={form.contract_end_date || ''}
                          onChange={(e) => patch({ contract_end_date: e.target.value || null })}
                          placeholder="dd/mm/yyyy"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          For Contract / Intern roles. Leave blank for permanent staff.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Pension Fund Administrator (PFA)</Label>
                        <Input
                          value={form.pfa_name || ''}
                          onChange={(e) => patch({ pfa_name: e.target.value || null })}
                          placeholder="e.g. ARM Pension, Stanbic IBTC"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">State of residence</Label>
                        <Select
                          value={form.state_of_residence || '__none__'}
                          onValueChange={(v) => patch({ state_of_residence: v === '__none__' ? null : v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select state…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Not set —</SelectItem>
                            {[
                              'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
                              'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe',
                              'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos',
                              'Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
                              'Taraba','Yobe','Zamfara',
                            ].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          PAYE is remitted to the State IRS of residence.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Department</dt>
                      <dd className="font-medium">{employee.departments?.name ?? '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Role</dt>
                      <dd><Badge variant="secondary" className={roleBadgeClass(employee.role)}>{roleLabel(employee.role)}</Badge></dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Job title</dt>
                      <dd className="font-medium">{employee.job_title ?? '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Employee number</dt>
                      <dd className="font-medium font-mono">{employee.employee_number || '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Employment type</dt>
                      <dd>
                        {employee.employment_type ? (
                          <Badge className={cn(
                            'text-xs',
                            employee.employment_type === 'Full-time'
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                              : employee.employment_type === 'Part-time'
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-100',
                          )}>
                            {employee.employment_type}
                          </Badge>
                        ) : <span className="font-medium">—</span>}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Start date</dt>
                      <dd className="font-medium">{employee.start_date ? formatDate(employee.start_date) : '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Annual leave</dt>
                      <dd className="font-medium">{employee.annual_leave_days ?? 20} days/yr</dd>
                    </div>

                    {/* Sprint B — read-only display of new optional fields.
                        Each row renders "—" when unset so the layout stays calm. */}
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Reports to</dt>
                      <dd className="font-medium">
                        {(() => {
                          if (!employee.reporting_manager_id) return '—';
                          const m = managers.find((x) => x.id === employee.reporting_manager_id);
                          return m ? (m.full_name || m.email) : '—';
                        })()}
                      </dd>
                    </div>
                    {employee.contract_end_date && (
                      <div className="flex items-center justify-between text-sm">
                        <dt className="text-muted-foreground">Contract ends</dt>
                        <dd className="font-medium">{formatDate(employee.contract_end_date)}</dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">PFA</dt>
                      <dd className="font-medium">{employee.pfa_name || '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">State of residence</dt>
                      <dd className="font-medium">{employee.state_of_residence || '—'}</dd>
                    </div>
                  </dl>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT column (40%) ────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Card 3 — Payment Method */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Payment Method</CardTitle>
                <div className="flex gap-1.5">
                  {canManage && !bankEditMode && (
                    <Button size="sm" variant="ghost" onClick={openBankHistory} title="View change history">
                      <History className="h-3.5 w-3.5 mr-1" /> History
                    </Button>
                  )}
                  {canManage && !bankEditMode && (
                    <Button size="sm" variant="outline" onClick={() => setBankEditMode(true)}>
                      Edit
                    </Button>
                  )}
                  {bankEditMode && (
                    <Button size="sm" variant="ghost" onClick={() => setBankEditMode(false)}>
                      Cancel
                    </Button>
                  )}
                  {isSelf && !canManage && !showBankRequestForm && !bankRequests.some(r => r.status === 'pending') && (
                    <Button size="sm" variant="outline" onClick={() => setShowBankRequestForm(true)}>
                      Request change
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Admin direct-edit mode */}
                {bankEditMode && (
                  <div className="space-y-4">
                    <BankAccountField value={bankDetails} onChange={setBankDetails} />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={saveBank} disabled={!bankDetails.verified || bankSaving}>
                        {bankSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        Save Bank Details
                      </Button>
                    </div>
                  </div>
                )}

                {/* Current bank details */}
                {!bankEditMode && (employee.bank_name && employee.bank_account_number ? (
                  <>
                    <dl className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <dt className="text-muted-foreground">Bank name</dt>
                        <dd className="font-medium">{employee.bank_name}</dd>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <dt className="text-muted-foreground">Account number</dt>
                        <dd className="font-medium font-mono">{employee.bank_account_number || '—'}</dd>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <dt className="text-muted-foreground">Account name</dt>
                        <dd className="font-medium">{employee.bank_account_name || '—'}</dd>
                      </div>
                    </dl>
                    <p className="text-xs text-muted-foreground pt-3 border-t">
                      Payouts will be made to this account
                    </p>
                  </>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">No payment method on file.</p>
                    {canManage && (
                      <button className="text-xs text-primary hover:underline" onClick={() => setBankEditMode(true)}>
                        Add bank account
                      </button>
                    )}
                  </div>
                ))}

                {/* Pending change requests (visible to admins reviewing this profile) */}
                {canManage && bankRequests.filter(r => r.status === 'pending').length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Pending bank change request</p>
                    {bankRequests.filter(r => r.status === 'pending').map((req) => (
                      <div key={req.id} className="space-y-2">
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{req.new_bank_name}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-mono text-xs">{req.new_account_number}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{req.new_account_name}</span></div>
                          {req.reason && <div className="flex justify-between"><span className="text-muted-foreground">Reason</span><span className="italic text-xs max-w-[60%] text-right">{req.reason}</span></div>}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/5" onClick={() => { setRejectingBankRequest(req.id); setBankRejectReason(''); }}>
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                          <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApproveBankRequest(req.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Employee's own request-change form */}
                {isSelf && !canManage && showBankRequestForm && (
                  <div className="rounded-md border p-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request account change</p>
                    <BankAccountField value={bankRequestDetails} onChange={setBankRequestDetails} />
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Reason (optional)</label>
                      <textarea
                        className="w-full text-xs rounded-md border bg-background px-3 py-2 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Why are you changing your bank account?"
                        value={bankRequestReason}
                        onChange={(e) => setBankRequestReason(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setShowBankRequestForm(false)} className="flex-1">Cancel</Button>
                      <Button size="sm" className="flex-1" onClick={submitBankChangeRequest} disabled={!bankRequestDetails.verified || submittingBankRequest}>
                        {submittingBankRequest && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                        Submit request
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">An admin will review and apply this change. Your current account stays active until then.</p>
                  </div>
                )}

                {/* Pending badge for self */}
                {isSelf && !canManage && bankRequests.some(r => r.status === 'pending') && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Your bank account change request is <strong>pending admin review</strong>.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card 4 — Payslips quick access */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Payslips
                </CardTitle>
                <button
                  onClick={() => setActiveTab('payroll')}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </CardHeader>
              <CardContent>
                {payslips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payslips yet.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Select payslip</Label>
                      <Select
                        value={selectedPayslipId || payslips[0]?.id}
                        onValueChange={setSelectedPayslipId}
                      >
                        <SelectTrigger><SelectValue placeholder="Choose period" /></SelectTrigger>
                        <SelectContent>
                          {payslips.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>{p.period || formatDate(p.created_at)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => {
                        const slip = payslips.find((p: any) => p.id === (selectedPayslipId || payslips[0]?.id));
                        if (slip) downloadPayslip(slip);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" /> Download Payslip
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      {activeTab === 'personal' && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Basic Details */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Basic Details</CardTitle>
                {canManage && editingSection !== 'basic' && (
                  <Button size="sm" variant="outline" onClick={() => startEdit('basic')}>
                    Edit
                  </Button>
                )}
                {editingSection === 'basic' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => saveSection('Basic details', {
                        first_name: form.first_name,
                        last_name: form.last_name,
                        phone: form.phone,
                        date_of_birth: form.date_of_birth || null,
                        gender: form.gender || null,
                        marital_status: form.marital_status || null,
                      })}
                      disabled={sectionSaving}
                    >
                      {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Save
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {editingSection === 'basic' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">First name</Label>
                        <Input value={form.first_name || ''} onChange={(e) => patch({ first_name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Last name</Label>
                        <Input value={form.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone</Label>
                      <Input value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Date of birth</Label>
                        <Input
                          type="date"
                          value={form.date_of_birth || ''}
                          onChange={(e) => patch({ date_of_birth: e.target.value || null })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Gender</Label>
                        <Select value={form.gender || ''} onValueChange={(v) => patch({ gender: v || null })}>
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Marital status</Label>
                      <Select value={form.marital_status || ''} onValueChange={(v) => patch({ marital_status: v || null })}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single</SelectItem>
                          <SelectItem value="married">Married</SelectItem>
                          <SelectItem value="divorced">Divorced</SelectItem>
                          <SelectItem value="widowed">Widowed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Email cannot be changed here — it is tied to login credentials.
                    </p>
                  </div>
                ) : (
                  <dl className="space-y-3 text-sm">
                    {([
                      ['Full name',      empName],
                      ['Date of birth',  employee.date_of_birth ? formatDate(employee.date_of_birth) : '—'],
                      ['Gender',         employee.gender || '—'],
                      ['Email',          employee.email],
                      ['Phone',          employee.phone || '—'],
                      ['Marital status', employee.marital_status || '—'],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label} className="flex items-start justify-between gap-4">
                        <dt className="text-muted-foreground shrink-0">{label}</dt>
                        <dd className="font-medium text-right">{val}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>

            {/* Next of Kin */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Next of Kin</CardTitle>
                {canManage && editingSection !== 'kin' && (
                  <Button size="sm" variant="outline" onClick={() => startEdit('kin')}>
                    Edit
                  </Button>
                )}
                {editingSection === 'kin' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => saveSection('Next of kin', {
                        next_of_kin_name: form.next_of_kin_name,
                        next_of_kin_relationship: form.next_of_kin_relationship,
                        next_of_kin_phone: form.next_of_kin_phone,
                        next_of_kin_email: form.next_of_kin_email,
                      })}
                      disabled={sectionSaving}
                    >
                      {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Save
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {editingSection === 'kin' ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Full name</Label>
                      <Input value={form.next_of_kin_name || ''} onChange={(e) => patch({ next_of_kin_name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Relationship</Label>
                      <Input value={form.next_of_kin_relationship || ''} onChange={(e) => patch({ next_of_kin_relationship: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone</Label>
                      <Input value={form.next_of_kin_phone || ''} onChange={(e) => patch({ next_of_kin_phone: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={form.next_of_kin_email || ''} onChange={(e) => patch({ next_of_kin_email: e.target.value })} />
                    </div>
                  </div>
                ) : employee.next_of_kin_name ? (
                  <dl className="space-y-3 text-sm">
                    {([
                      ['Name',         employee.next_of_kin_name],
                      ['Relationship', employee.next_of_kin_relationship || '—'],
                      ['Phone',        employee.next_of_kin_phone || '—'],
                      ['Email',        employee.next_of_kin_email || '—'],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label} className="flex items-start justify-between gap-4">
                        <dt className="text-muted-foreground shrink-0">{label}</dt>
                        <dd className="font-medium text-right">{val}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">No next of kin recorded.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Home Address */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Home Address</CardTitle>
              {canManage && editingSection !== 'address' && (
                <Button size="sm" variant="outline" onClick={() => startEdit('address')}>
                  Edit
                </Button>
              )}
              {editingSection === 'address' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={() => saveSection('Home address', { address: form.address })}
                    disabled={sectionSaving}
                  >
                    {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {editingSection === 'address' ? (
                <Textarea
                  rows={3}
                  value={form.address || ''}
                  onChange={(e) => patch({ address: e.target.value })}
                  placeholder="Enter full address…"
                />
              ) : employee.address ? (
                <p className="text-sm">{employee.address}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No address recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'statutory' && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-sm text-indigo-900 flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Nigerian statutory identity & benefits</p>
              <p className="text-xs text-indigo-800/80">
                These numbers are required for PAYE filing, pension remittance, NHF, and NHIS.
                Only admins see or edit this data. Toggle deduction flags per employee.
              </p>
            </div>
          </div>

          {/* Identity numbers */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Identity Numbers</CardTitle>
              {canManage && editingSection !== 'identity' && (
                <Button size="sm" variant="outline" onClick={() => startEdit('identity')}>Edit</Button>
              )}
              {editingSection === 'identity' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={() => saveSection('Identity numbers', {
                      nin: form.nin || null,
                      tin: form.tin || null,
                    })}
                    disabled={sectionSaving}
                  >
                    {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {editingSection === 'identity' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">NIN (National ID) — 11 digits</Label>
                    <Input
                      value={form.nin || ''}
                      onChange={(e) => patch({ nin: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                      placeholder="e.g. 12345678901"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">TIN (Tax ID)</Label>
                    <Input
                      value={form.tin || ''}
                      onChange={(e) => patch({ tin: e.target.value })}
                      placeholder="FIRS Tax Identification Number"
                    />
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">NIN</dt>
                    <dd className="font-mono">{employee.nin || <span className="text-muted-foreground">Not set</span>}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">TIN</dt>
                    <dd className="font-mono">{employee.tin || <span className="text-muted-foreground">Not set</span>}</dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          {/* Statutory benefits with toggles */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Statutory Benefits</CardTitle>
              {canManage && editingSection !== 'statutory' && (
                <Button size="sm" variant="outline" onClick={() => startEdit('statutory')}>Edit</Button>
              )}
              {editingSection === 'statutory' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={() => saveSection('Statutory benefits', {
                      pension_pin: form.pension_pin || null,
                      pension_enabled: form.pension_enabled ?? true,
                      nhf_number: form.nhf_number || null,
                      nhf_enabled: form.nhf_enabled ?? false,
                      nhis_number: form.nhis_number || null,
                      nhis_enabled: form.nhis_enabled ?? false,
                      paye_enabled: form.paye_enabled ?? true,
                      tax_id: form.tax_id || null,
                    })}
                    disabled={sectionSaving}
                  >
                    {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {([
                {
                  key: 'paye' as const,
                  label: 'PAYE Tax',
                  rate: 'FIRS progressive bands (7–24%)',
                  numberField: 'tax_id',
                  flagField: 'paye_enabled',
                  defaultFlag: true,
                  placeholder: 'Tax ID / TIN — e.g. 12345678-0001',
                },
                {
                  key: 'pension' as const,
                  label: 'Pension (RSA)',
                  rate: '8% employee · 10% employer',
                  numberField: 'pension_pin',
                  flagField: 'pension_enabled',
                  defaultFlag: true,
                  placeholder: 'RSA PIN — e.g. PEN100000000000',
                },
                {
                  key: 'nhf' as const,
                  label: 'NHF (Housing Fund)',
                  rate: '2.5% of basic',
                  numberField: 'nhf_number',
                  flagField: 'nhf_enabled',
                  defaultFlag: false,
                  placeholder: 'NHF contribution number',
                },
                {
                  key: 'nhis' as const,
                  label: 'NHIS / HMO',
                  rate: 'Mandatory for orgs 10+',
                  numberField: 'nhis_number',
                  flagField: 'nhis_enabled',
                  defaultFlag: false,
                  placeholder: 'NHIS enrollment number',
                },
              ]).map((row) => {
                const isOn = editingSection === 'statutory'
                  ? ((form as any)[row.flagField] ?? row.defaultFlag)
                  : ((employee as any)[row.flagField] ?? row.defaultFlag);
                const num = editingSection === 'statutory'
                  ? ((form as any)[row.numberField] || '')
                  : ((employee as any)[row.numberField] || '');
                return (
                  <div key={row.key} className="flex flex-col gap-2 pb-4 border-b last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-sm">{row.label}</p>
                        <p className="text-xs text-muted-foreground">{row.rate}</p>
                      </div>
                      <Badge className={cn(
                        'text-xs',
                        isOn
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-100',
                      )}>
                        {isOn ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {editingSection === 'statutory' ? (
                      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">Reference number</Label>
                          <Input
                            value={num}
                            onChange={(e) => patch({ [row.numberField]: e.target.value } as any)}
                            placeholder={row.placeholder}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={isOn ? 'default' : 'outline'}
                          onClick={() => patch({ [row.flagField]: !isOn } as any)}
                        >
                          {isOn ? 'Turn off' : 'Turn on'}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm font-mono text-muted-foreground">
                        {num || <span className="italic">No number on file</span>}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Documents</CardTitle>
              {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setDocUploadOpen(true)}
                >
                  <Plus className="h-4 w-4" /> Upload
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {documents.length === 0 ? (
                <EmptyState compact icon={FileText} title="No documents yet" description="Upload contracts, IDs, or HR docs above." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="pr-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc: any) => {
                      // Pass bucket + storage_path so FilePreview generates a
                      // fresh signed URL on open (the documents bucket is
                      // private; stored public URLs would 404).
                      return (
                        <TableRow key={doc.id}>
                          <TableCell className="pl-4 font-medium">
                            {doc.title || doc.file_name || doc.name || '—'}
                            {doc.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">
                                {doc.description}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">
                              {doc.category || 'general'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {doc.expires_at ? formatDate(doc.expires_at) : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(doc.created_at)}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {doc.storage_path && (
                                <FilePreviewTrigger
                                  bucket="documents"
                                  path={doc.storage_path}
                                  label="View"
                                  fileName={doc.title || doc.file_name}
                                />
                              )}
                              {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPendingDeleteDoc(doc)}
                                  title="Delete"
                                  aria-label={`Delete document ${doc.title || doc.file_name || ''}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Document upload dialog ────────────────────────────────────── */}
      <Dialog open={docUploadOpen} onOpenChange={setDocUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document for {employee?.first_name || 'employee'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>File</Label>
              <Input
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
              <Label>Title</Label>
              <Input
                value={docForm.title}
                onChange={(e) => setDocForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g. Employment Contract 2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={docForm.category}
                  onValueChange={(v) => setDocForm((s) => ({ ...s, category: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>Expiry (optional)</Label>
                <Input
                  type="date"
                  value={docForm.expires_at}
                  onChange={(e) => setDocForm((s) => ({ ...s, expires_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Input
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
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assigned Tasks</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tasks.length === 0 ? (
                <EmptyState compact icon={ClipboardList} title="No tasks assigned" description="Tasks assigned to this employee will appear here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Title</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="pr-4 w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task: any) => (
                      <TableRow key={task.id}>
                        <TableCell className="pl-4 font-medium">{task.title}</TableCell>
                        <TableCell>{task.due_date ? formatDate(task.due_date) : '—'}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              task.status === 'completed' || task.status === 'done'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                : task.status === 'in_progress'
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            }
                          >
                            {task.status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4">
                          <button
                            onClick={() => navigate('/tasks')}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Go to tasks"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Audit Logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {auditLogs.length === 0 ? (
                <EmptyState compact icon={Activity} title="No activity yet" description="Profile changes and audit events will appear here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Action</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="pr-4 whitespace-nowrap">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="pl-4 font-mono text-xs whitespace-nowrap">
                          {log.action_type || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{log.description || '—'}</TableCell>
                        <TableCell className="pr-4 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'leave' && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Leave taken</p>
                <p className="text-2xl font-bold">
                  {leaveTaken}{' '}
                  <span className="text-sm font-normal text-muted-foreground">days</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-2xl font-bold">
                  {Math.max(0, (employee.annual_leave_days || 20) - leaveTaken)}{' '}
                  <span className="text-sm font-normal text-muted-foreground">days</span>
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Leave Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {leaves.length === 0 ? (
                <EmptyState compact icon={CalendarDays} title="No leave requests" description="Leave requests submitted by this employee will appear here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Type</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead className="pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.map((leave: any) => (
                      <TableRow key={leave.id}>
                        <TableCell className="pl-4 font-medium">{leave.leave_type || leave.type || '—'}</TableCell>
                        <TableCell>{leave.start_date ? formatDate(leave.start_date) : '—'}</TableCell>
                        <TableCell>{leave.end_date ? formatDate(leave.end_date) : '—'}</TableCell>
                        <TableCell>{leave.days ?? '—'}</TableCell>
                        <TableCell className="pr-4">
                          <Badge
                            className={
                              leave.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                : leave.status === 'rejected' || leave.status === 'denied'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-100'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            }
                          >
                            {leave.status || 'pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Expenses</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {expenses.length === 0 ? (
                <EmptyState compact icon={Receipt} title="No expenses raised" description="Expense claims submitted by this employee will appear here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense: any) => (
                      <TableRow key={expense.id}>
                        <TableCell className="pl-4">{formatDate(expense.created_at)}</TableCell>
                        <TableCell className="font-medium">{expense.description || '—'}</TableCell>
                        <TableCell>{expense.category || '—'}</TableCell>
                        <TableCell className="text-right">{formatNaira(expense.amount || 0)}</TableCell>
                        <TableCell className="pr-4">
                          <Badge
                            className={
                              expense.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                : expense.status === 'rejected' || expense.status === 'denied'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-100'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            }
                          >
                            {expense.status || 'pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'payroll' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payroll</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {payslips.length === 0 ? (
                <EmptyState compact icon={FileText} title="No payslips yet" description="Finance generates payslips at the end of each month." />
              ) : (
                <div className="divide-y">
                  {payslips.map((slip: any) => (
                    <div key={slip.id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm font-medium">{slip.period || '—'}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => downloadPayslip(slip)}
                      >
                        <Download className="h-4 w-4" /> Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'deductions' && canFinance && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Deductions</CardTitle>
              {canFinance && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowDeductionDialog(true)}>
                  <Plus className="h-4 w-4" /> Add Deduction
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {deductions.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No deductions configured.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Description</TableHead>
                      <TableHead className="text-right">Amount (₦)</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead className="text-right">Deducted to Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deductions.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="pl-4 font-medium">{d.description}</TableCell>
                        <TableCell className="text-right">{formatNaira(d.amount_ngn)}</TableCell>
                        <TableCell className="capitalize">{d.frequency.replace(/_/g, ' ')}</TableCell>
                        <TableCell>{formatDate(d.start_date)}</TableCell>
                        <TableCell>{d.end_date ? formatDate(d.end_date) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {formatNaira(d.amount_deducted_to_date || 0)}
                          {d.total_deductible_amount ? (
                            <span className="text-xs text-muted-foreground"> / {formatNaira(d.total_deductible_amount)}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${d.status === 'active' ? 'bg-emerald-100 text-emerald-700' : d.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>
                            {d.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {d.status === 'active' && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                              onClick={() => deactivateDeduction(d.id)}>
                              Pause
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'increments' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Salary Increments</CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowIncrementDialog(true)}>
                  <Plus className="h-4 w-4" /> Add Increment
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {increments.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No salary increments recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead className="text-right">Previous Salary</TableHead>
                      <TableHead className="text-right">New Salary</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="pr-4">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {increments.map((inc: any) => {
                      const diff = (inc.new_salary_ngn || 0) - (inc.old_salary_ngn || 0);
                      return (
                        <TableRow key={inc.id}>
                          <TableCell className="pl-4">{formatDate(inc.effective_date)}</TableCell>
                          <TableCell className="text-right">{formatNaira(inc.old_salary_ngn || 0)}</TableCell>
                          <TableCell className="text-right">{formatNaira(inc.new_salary_ngn || 0)}</TableCell>
                          <TableCell className="text-right">
                            <span className={diff >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {diff >= 0 ? '+' : ''}{formatNaira(diff)}
                            </span>
                          </TableCell>
                          <TableCell className="pr-4 text-muted-foreground">{inc.reason || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* Phase 3 — Advances tab */}
      {activeTab === 'advances' && (
        <div className="mt-4 space-y-4">
          {advances.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No salary advances recorded.</CardContent></Card>
          ) : (
            <>
              {(() => {
                const active = advances.filter((a) => a.status === 'active');
                const totalOutstanding = active.reduce((s: number, a: any) => s + (a.outstanding_ngn || 0), 0);
                const totalDeduction = active.reduce((s: number, a: any) => s + (a.deduction_per_month || 0), 0);
                return active.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Outstanding</p>
                        <p className="text-2xl font-bold text-destructive">{formatNaira(totalOutstanding)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Monthly Deduction</p>
                        <p className="text-2xl font-bold">{formatNaira(totalDeduction)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Active Advances</p>
                        <p className="text-2xl font-bold">{active.length}</p>
                      </CardContent>
                    </Card>
                  </div>
                ) : null;
              })()}
              <Card>
                <CardHeader><CardTitle className="text-base">Advance History</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right">Monthly Deduction</TableHead>
                        <TableHead className="text-right">Months</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {advances.map((a: any) => {
                        const repaid = a.amount_ngn - a.outstanding_ngn;
                        const pct = a.amount_ngn > 0 ? Math.round((repaid / a.amount_ngn) * 100) : 0;
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="text-muted-foreground">{formatDate(a.created_at)}</TableCell>
                            <TableCell>{a.start_period || '—'}</TableCell>
                            <TableCell className="text-right currency">{formatNaira(a.amount_ngn)}</TableCell>
                            <TableCell className="text-right currency font-semibold">{formatNaira(a.outstanding_ngn)}</TableCell>
                            <TableCell className="text-right currency">{formatNaira(a.deduction_per_month)}</TableCell>
                            <TableCell className="text-right">{a.repayment_months}m</TableCell>
                            <TableCell>
                              <Badge variant={a.status === 'active' ? 'destructive' : a.status === 'settled' ? 'default' : 'secondary'}>
                                {a.status === 'active' ? `${pct}% repaid` : a.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
      {activeTab === 'permissions' && canManage && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
              <CardTitle className="text-base">Permissions</CardTitle>
              <div className="flex gap-2 items-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!confirm('Clear all explicit overrides and fall back to the role defaults?')) return;
                    // Empty object means: no explicit grants/denies. Every
                    // toggle goes back to whatever the role default says,
                    // which is the source of truth in PermissionsEditor's
                    // `roleDefaults` prop. Quick way to wipe a stale config.
                    setPermissions({});
                  }}
                  title="Clear every explicit grant/deny so the user falls back entirely to their role's default permissions"
                >
                  Reset to role defaults
                </Button>
                <Button size="sm" onClick={savePermissions} disabled={savingPermissions}>
                  {savingPermissions && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* The yellow banner explains how the toggle states map to
                  semantics — operators were unsure whether OFF meant "use
                  role default" or "explicitly denied". Three distinct
                  states are now spelled out here. */}
              <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 mb-4 text-xs text-foreground/80 space-y-1">
                <p>
                  <span className="font-semibold">ON (no badge)</span> — comes from this user's role default.
                </p>
                <p>
                  <span className="font-semibold">ON · GRANTED</span> — explicitly switched on, even though the role wouldn't normally allow it.
                </p>
                <p>
                  <span className="font-semibold">OFF · DENIED</span> — explicitly switched off, even though the role would normally allow it. Use sparingly — better to change the role.
                </p>
              </div>
              <PermissionsEditor
                value={permissions}
                onChange={setPermissions}
                roleDefaults={ROLE_DEFAULT_PERMISSIONS[employee?.role as string] || []}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'offboarding' && canManage && employee && (
        <OffboardingTab
          employee={{ id: employee.id, full_name: employee.full_name, salary_ngn: employee.salary_ngn, status: employee.status }}
          onChanged={load}
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
              <Label>Effective date</Label>
              <Input
                type="date"
                value={incrementForm.effective_date}
                onChange={(e) => setIncrementForm((p) => ({ ...p, effective_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>New monthly salary (₦)</Label>
              <Input
                type="number"
                min={0}
                value={incrementForm.new_salary || ''}
                onChange={(e) => setIncrementForm((p) => ({ ...p, new_salary: Number(e.target.value) }))}
                placeholder="Enter new salary…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
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

      {/* Add Deduction Dialog */}
      <Dialog open={showDeductionDialog} onOpenChange={(o) => { if (!o) setShowDeductionDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Deduction</DialogTitle>
            <DialogDescription>Schedule a recurring or one-time deduction for this employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Description <span className="text-destructive">*</span></Label>
              <Input
                className="mt-1"
                placeholder="e.g. Staff loan repayment"
                value={deductionForm.description}
                onChange={(e) => setDeductionForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount per period (₦) <span className="text-destructive">*</span></Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={1}
                  placeholder="0"
                  value={deductionForm.amount_ngn || ''}
                  onChange={(e) => setDeductionForm((f) => ({ ...f, amount_ngn: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={deductionForm.frequency} onValueChange={(v) => setDeductionForm((f) => ({ ...f, frequency: v as typeof f.frequency }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                <Label>Start Date <span className="text-destructive">*</span></Label>
                <Input className="mt-1" type="date" value={deductionForm.start_date}
                  onChange={(e) => setDeductionForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>End Date (optional)</Label>
                <Input className="mt-1" type="date" value={deductionForm.end_date}
                  onChange={(e) => setDeductionForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Total deductible amount (₦, optional)</Label>
              <Input className="mt-1" type="number" min={0} placeholder="Leave blank for no cap"
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
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
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
            <Label className="text-xs">Reason for rejection</Label>
            <textarea
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
