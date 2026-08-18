import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText,
  Search,
  Download,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Check,
  XCircle,
  CreditCard,
  Receipt,
  Fuel,
  PiggyBank,
  UserPlus,
  MapPin,
  CalendarDays,
  Banknote,
  Eye,
  Lock,
  Unlock,
  AlertTriangle,
  ListTodo,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDateTime, toIsoDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { MobileFilterBar } from '@/components/ui-kit/MobileFilterBar';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardRow } from '@/components/ui-kit/MobileCard';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';

interface AuditRow {
  id: string;
  action_type: string;
  description: string;
  performed_by: string | null;
  performed_by_name: string | null;
  created_at: string | null;
}

// Map every action type to a module tag + colour for the filter pills.
const MODULE_OF: Record<string, string> = {
  batch_created: 'Payments',
  batch_submitted: 'Payments',
  batch_approved: 'Payments',
  batch_rejected: 'Payments',
  batch_funded: 'Payments',
  batch_processed: 'Payments',
  batch_scheduled: 'Payments',
  batch_item_retried: 'Payments',
  batch_receipt_downloaded: 'Payments',
  contractor_added: 'Contractors',
  contractor_edited: 'Contractors',
  contractor_deactivated: 'Contractors',
  fuel_request_submitted: 'Fleet',
  fuel_request_approved: 'Fleet',
  fuel_request_rejected: 'Fleet',
  trip_log_submitted: 'Fleet',
  expense_submitted: 'Expenses',
  expense_approved: 'Expenses',
  expense_rejected: 'Expenses',
  employee_added: 'Employees',
  employee_edited: 'Employees',
  employee_deactivated: 'Employees',
  employee_invite_resent: 'Employees',
  role_changed: 'Employees',
  subscription_added: 'Subscriptions',
  subscription_edited: 'Subscriptions',
  subscription_cancelled: 'Subscriptions',
  subscription_renewed: 'Subscriptions',
  budget_created: 'Budgets',
  budget_submitted: 'Budgets',
  budget_approved: 'Budgets',
  budget_rejected: 'Budgets',
  budget_edited: 'Budgets',
  budget_locked: 'Budgets',
  budget_unlocked: 'Budgets',
  document_uploaded: 'Documents',
  document_deleted: 'Documents',
  document_edited: 'Documents',
  bulk_approved: 'Approvals',
  approval_comment: 'Approvals',
  profile_updated: 'Profile',
  profile_password_changed: 'Profile',
  profile_viewed_as: 'Profile',
  leave_requested: 'Leave',
  leave_approved: 'Leave',
  leave_rejected: 'Leave',
  leave_cancelled: 'Leave',
  task_created: 'Tasks',
  task_updated: 'Tasks',
  task_completed: 'Tasks',
  task_commented: 'Tasks',
  compliance_filed: 'Compliance',
  compliance_marked_overdue: 'Compliance',
  payroll_created: 'Payroll',
  payroll_submitted: 'Payroll',
  payroll_approved: 'Payroll',
  payroll_paid: 'Payroll',
  announcement_posted: 'Announcements',
  announcement_removed: 'Announcements',
  invite_sent: 'Employees',
  invite_revoked: 'Employees',
  company_settings_updated: 'Settings',
  knowledge_article_created: 'Knowledge',
  knowledge_article_updated: 'Knowledge',
  knowledge_article_deleted: 'Knowledge',
  virtual_card_created: 'Cards',
  virtual_card_updated: 'Cards',
  virtual_card_deactivated: 'Cards',
  goal_created: 'Goals',
  goal_updated: 'Goals',
  goal_completed: 'Goals',
  notification_prefs_updated: 'Settings',
  audit_log_exported: 'Audit',
  profile_bank_account_set: 'Security',
  profile_bank_account_changed: 'Security',
  profile_bank_account_cleared: 'Security',
};

const MODULE_COLOR: Record<string, string> = {
  Payments: 'bg-primary/10 text-primary border border-primary/30',
  Contractors: 'bg-accent/15 text-accent-foreground border border-accent/40',
  Fleet: 'bg-purple-100 text-purple-700 border border-purple-200',
  Expenses: 'bg-info/10 text-info border border-info/30',
  Employees: 'bg-success/10 text-success border border-success/30',
  Subscriptions: 'bg-warning/10 text-warning border border-warning/30',
  Budgets: 'bg-success/10 text-success border border-success/30',
  Documents: 'bg-info/10 text-info border border-info/30',
  Approvals: 'bg-warning/10 text-warning border border-warning/30',
  Profile: 'bg-muted text-muted-foreground border border-border',
  Leave: 'bg-accent/15 text-accent-foreground border border-accent/40',
  Tasks: 'bg-info/10 text-info border border-info/30',
  Compliance: 'bg-destructive/10 text-destructive border border-destructive/30',
  Payroll: 'bg-primary/10 text-primary border border-primary/30',
  Announcements: 'bg-accent/15 text-accent-foreground border border-accent/40',
  Settings: 'bg-muted text-muted-foreground border border-border',
  Knowledge: 'bg-purple-100 text-purple-700 border border-purple-200',
  Cards: 'bg-primary/10 text-primary border border-primary/30',
  Goals: 'bg-success/10 text-success border border-success/30',
  Audit: 'bg-muted text-muted-foreground border border-border',
  Security: 'bg-red-50 text-red-700 border border-red-200',
  '—': 'bg-muted text-muted-foreground border border-border',
};

const ICON_OF: Record<string, typeof FileText> = {
  batch_created: CreditCard,
  batch_approved: Check,
  batch_rejected: XCircle,
  batch_processed: Banknote,
  batch_receipt_downloaded: FileText,
  contractor_added: UserPlus,
  fuel_request_submitted: Fuel,
  fuel_request_approved: Check,
  fuel_request_rejected: XCircle,
  trip_log_submitted: MapPin,
  expense_submitted: Receipt,
  expense_approved: Check,
  expense_rejected: XCircle,
  employee_added: UserPlus,
  budget_created: PiggyBank,
  budget_locked: Lock,
  budget_unlocked: Unlock,
  document_uploaded: FileText,
  document_deleted: XCircle,
  leave_requested: CalendarDays,
  task_created: ListTodo,
  compliance_filed: ShieldCheck,
  payroll_created: Banknote,
  knowledge_article_created: BookOpen,
  virtual_card_created: CreditCard,
  profile_viewed_as: Eye,
};

const prettyType = (t: string) => t.replace(/_/g, ' ');

interface ChainBreak {
  seq: number;
  id: string;
  action_type: string;
  created_at: string;
  stored_hash: string | null;
  expected_hash: string;
  broken: boolean;
}

const AuditLog = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<'all' | string>('all');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [chainVerifying, setChainVerifying] = useState(false);
  const [chainResult, setChainResult] = useState<ChainBreak[] | null>(null);
  const [showChainDialog, setShowChainDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('id, action_type, description, performed_by_name, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    setRows((data as AuditRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const modules = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(MODULE_OF[r.action_type] || '—');
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = from ? new Date(from).getTime() : -Infinity;
    const toMs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
    return rows.filter((r) => {
      const mod = MODULE_OF[r.action_type] || '—';
      if (moduleFilter !== 'all' && mod !== moduleFilter) return false;
      const t = r.created_at ? new Date(r.created_at).getTime() : 0;
      if (t < fromMs || t > toMs) return false;
      if (!q) return true;
      return (
        prettyType(r.action_type).toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.performed_by_name || '').toLowerCase().includes(q) ||
        mod.toLowerCase().includes(q)
      );
    });
  }, [rows, search, moduleFilter, from, to]);

  const pagination = usePagination(filtered, 20);

  const clearFilters = () => {
    setSearch('');
    setModuleFilter('all');
    setFrom('');
    setTo('');
    pagination.reset();
  };
  const activeFilterCount = [moduleFilter !== 'all', !!from, !!to].filter(Boolean).length;

  const verifyChain = async () => {
    setChainVerifying(true);
    try {
      const { data, error } = await supabase.rpc('verify_audit_chain');
      if (error) throw error;
      setChainResult((data as ChainBreak[]) || []);
      setShowChainDialog(true);
    } catch (err: any) {
      toast({ title: 'Chain verification failed', description: err?.message, variant: 'destructive' });
    } finally {
      setChainVerifying(false);
    }
  };

  const exportCsv = async () => {
    const header = ['created_at', 'module', 'action_type', 'description', 'performed_by_name'];
    const data = filtered.map((r) => [
      r.created_at || '',
      MODULE_OF[r.action_type] || '—',
      r.action_type,
      r.description,
      r.performed_by_name || '',
    ]);
    downloadCsv(`kdops-audit-${toIsoDate(new Date())}.csv`, toCsv(header, data));
    await logAudit(
      'audit_log_exported',
      `Audit log exported (${filtered.length} entries)`,
      profile,
    );
    toast({ title: 'Audit log exported' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Every data-changing action is recorded here. Append-only — entries cannot be edited or deleted, even by Super Admin."
        actions={
          <div className="flex gap-2">
            {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
              <Button variant="outline" onClick={verifyChain} disabled={chainVerifying}>
                {chainVerifying
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <ShieldCheck className="mr-2 h-4 w-4" />}
                Verify Chain
              </Button>
            )}
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />

      <div className="kd-card-info flex items-start gap-2 text-xs">
        <ShieldCheck className="h-4 w-4 text-info mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-info">Immutable by design</p>
          <p className="text-muted-foreground">
            The database refuses any UPDATE or DELETE on audit_logs via a trigger.
            Historical entries are preserved for SOC2 / ISO27001 evidence.
          </p>
        </div>
      </div>

      <Card className="rounded-xl">
        <div className="p-3 sm:p-4 border-b border-border">
          <MobileFilterBar
            activeCount={activeFilterCount}
            onClear={clearFilters}
            search={
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-10 sm:h-9"
                  placeholder="Search description, actor, action type..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    pagination.reset();
                  }}
                />
              </div>
            }
            filters={
              <>
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger className="flex-1 sm:flex-initial sm:w-[180px] h-10 sm:h-9" data-mobile-filter-row>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modules</SelectItem>
                    {modules.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="flex-1 sm:flex-initial sm:w-[150px] h-10 sm:h-9"
                  data-mobile-filter-row
                />
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="flex-1 sm:flex-initial sm:w-[150px] h-10 sm:h-9"
                  data-mobile-filter-row
                />
              </>
            }
          />
        </div>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No matching entries"
              description="Relax the filters or widen the date range."
            />
          ) : (
            <>
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Performed by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((r) => {
                    const mod = MODULE_OF[r.action_type] || '—';
                    const Icon = ICON_OF[r.action_type] || AlertTriangle;
                    return (
                      <TableRow key={r.id} className="kd-transition">
                        <TableCell className="text-muted-foreground text-xs">
                          {r.created_at ? formatDateTime(r.created_at) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn('font-medium', MODULE_COLOR[mod] || MODULE_COLOR['—'])}
                          >
                            {mod}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 text-xs capitalize">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {prettyType(r.action_type)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm max-w-lg">
                          {r.description}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.performed_by_name || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>

              {/* Mobile audit feed */}
              <div className="md:hidden p-3 space-y-2">
                {pagination.slice.map((r) => {
                  const mod = MODULE_OF[r.action_type] || '—';
                  const Icon = ICON_OF[r.action_type] || AlertTriangle;
                  return (
                    <MobileCard key={r.id}>
                      <MobileCardHeader>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <Badge variant="secondary" className={cn('h-4 px-1.5 text-[9px] font-medium', MODULE_COLOR[mod] || MODULE_COLOR['—'])}>
                              {mod}
                            </Badge>
                            <span className="inline-flex items-center gap-1 text-[11px] capitalize text-muted-foreground">
                              <Icon className="h-3 w-3" />
                              {prettyType(r.action_type)}
                            </span>
                          </div>
                          <MobileCardTitle className="text-xs font-normal leading-snug whitespace-normal">
                            {r.description}
                          </MobileCardTitle>
                        </div>
                      </MobileCardHeader>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{r.performed_by_name || '—'}</span>
                        <span>{r.created_at ? formatDateTime(r.created_at) : '—'}</span>
                      </div>
                    </MobileCard>
                  );
                })}
              </div>

              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                pageSize={pagination.pageSize}
                onPrev={pagination.prev}
                onNext={pagination.next}
                hasPrev={pagination.hasPrev}
                hasNext={pagination.hasNext}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Chain integrity results dialog */}
      <Dialog open={showChainDialog} onOpenChange={setShowChainDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {chainResult?.length === 0
                ? <ShieldCheck className="h-5 w-5 text-success" />
                : <ShieldAlert className="h-5 w-5 text-destructive" />}
              Audit chain integrity
            </DialogTitle>
            <DialogDescription>
              SHA-256 hash chain verification across {rows.length} audit records.
            </DialogDescription>
          </DialogHeader>

          {chainResult?.length === 0 ? (
            <Alert className="border-success/40 bg-success/5">
              <ShieldCheck className="h-4 w-4 text-success" />
              <AlertDescription className="text-sm font-medium text-success">
                Chain intact — {rows.length} records verified. No tampering detected.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>{chainResult?.length} broken link{(chainResult?.length ?? 0) > 1 ? 's' : ''} detected.</strong>{' '}
                  One or more audit records may have been tampered with, deleted, or inserted out of order.
                  Contact your database administrator immediately.
                </AlertDescription>
              </Alert>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 hover:bg-background/60">
                      <TableHead className="text-xs">Seq</TableHead>
                      <TableHead className="text-xs">Action</TableHead>
                      <TableHead className="text-xs">Timestamp</TableHead>
                      <TableHead className="text-xs font-mono">Stored hash (first 12)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chainResult?.map((b) => (
                      <TableRow key={b.id} className="bg-destructive/5 border-l-4 border-l-destructive">
                        <TableCell className="text-xs">{b.seq}</TableCell>
                        <TableCell className="text-xs">{b.action_type}</TableCell>
                        <TableCell className="text-xs">{b.created_at ? formatDateTime(b.created_at) : '—'}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {b.stored_hash ? b.stored_hash.slice(0, 12) + '…' : '(null)'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLog;
