import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import {
  GitBranch,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Settings2,
  CalendarDays,
  Banknote,
  Receipt,
  Wallet,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Activity,
  Layers,
} from 'lucide-react';

const AVAILABLE_ROLES = ['super_admin', 'admin', 'finance', 'operations'] as const;
type ApproverRole = (typeof AVAILABLE_ROLES)[number];

const ROLE_LABELS: Record<ApproverRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  finance: 'Finance',
  operations: 'Operations',
};

interface ApprovalStep {
  id: string;
  role: ApproverRole;
  is_required: boolean;
}

interface AutoApproveCondition {
  enabled: boolean;
  threshold: number;
  condition_type: 'less_than_days' | 'less_than_amount';
}

interface EscalationConfig {
  timeout_hours: number;
  escalate_to: ApproverRole;
}

interface NotificationSettings {
  notify_on_submit: boolean;
  notify_on_approve: boolean;
  notify_on_reject: boolean;
}

interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  steps: ApprovalStep[];
  auto_approve: AutoApproveCondition;
  escalation: EscalationConfig;
  notifications: NotificationSettings;
}

const WORKFLOW_ICONS: Record<string, React.ElementType> = {
  leave: CalendarDays,
  loans: Banknote,
  expenses: Receipt,
  payroll: Wallet,
  grievances: AlertTriangle,
  hr_letters: FileText,
};

const DEFAULT_WORKFLOWS: WorkflowConfig[] = [
  {
    id: 'leave',
    name: 'Leave Requests',
    description: 'Employee annual, sick, and casual leave applications',
    icon: 'leave',
    enabled: true,
    steps: [
      { id: crypto.randomUUID(), role: 'operations', is_required: true },
      { id: crypto.randomUUID(), role: 'admin', is_required: false },
    ],
    auto_approve: { enabled: true, threshold: 3, condition_type: 'less_than_days' },
    escalation: { timeout_hours: 48, escalate_to: 'super_admin' },
    notifications: { notify_on_submit: true, notify_on_approve: true, notify_on_reject: true },
  },
  {
    id: 'loans',
    name: 'Staff Loans',
    description: 'Salary advance and staff loan requests',
    icon: 'loans',
    enabled: true,
    steps: [
      { id: crypto.randomUUID(), role: 'finance', is_required: true },
      { id: crypto.randomUUID(), role: 'admin', is_required: true },
    ],
    auto_approve: { enabled: false, threshold: 0, condition_type: 'less_than_amount' },
    escalation: { timeout_hours: 72, escalate_to: 'super_admin' },
    notifications: { notify_on_submit: true, notify_on_approve: true, notify_on_reject: true },
  },
  {
    id: 'expenses',
    name: 'Expense Claims',
    description: 'Reimbursement and expense claim submissions',
    icon: 'expenses',
    enabled: true,
    steps: [
      { id: crypto.randomUUID(), role: 'operations', is_required: true },
      { id: crypto.randomUUID(), role: 'finance', is_required: true },
    ],
    auto_approve: { enabled: true, threshold: 5000, condition_type: 'less_than_amount' },
    escalation: { timeout_hours: 48, escalate_to: 'admin' },
    notifications: { notify_on_submit: true, notify_on_approve: true, notify_on_reject: false },
  },
  {
    id: 'payroll',
    name: 'Payroll Runs',
    description: 'Monthly payroll processing and disbursements',
    icon: 'payroll',
    enabled: false,
    steps: [
      { id: crypto.randomUUID(), role: 'finance', is_required: true },
      { id: crypto.randomUUID(), role: 'admin', is_required: true },
      { id: crypto.randomUUID(), role: 'super_admin', is_required: true },
    ],
    auto_approve: { enabled: false, threshold: 0, condition_type: 'less_than_amount' },
    escalation: { timeout_hours: 24, escalate_to: 'super_admin' },
    notifications: { notify_on_submit: true, notify_on_approve: true, notify_on_reject: true },
  },
  {
    id: 'grievances',
    name: 'Grievances',
    description: 'Employee grievance escalation and resolution',
    icon: 'grievances',
    enabled: false,
    steps: [
      { id: crypto.randomUUID(), role: 'operations', is_required: true },
      { id: crypto.randomUUID(), role: 'admin', is_required: true },
    ],
    auto_approve: { enabled: false, threshold: 0, condition_type: 'less_than_days' },
    escalation: { timeout_hours: 24, escalate_to: 'super_admin' },
    notifications: { notify_on_submit: true, notify_on_approve: true, notify_on_reject: true },
  },
  {
    id: 'hr_letters',
    name: 'HR Letters',
    description: 'Employment confirmation, reference, and official letters',
    icon: 'hr_letters',
    enabled: true,
    steps: [
      { id: crypto.randomUUID(), role: 'operations', is_required: true },
    ],
    auto_approve: { enabled: false, threshold: 0, condition_type: 'less_than_days' },
    escalation: { timeout_hours: 72, escalate_to: 'admin' },
    notifications: { notify_on_submit: true, notify_on_approve: true, notify_on_reject: false },
  },
];

export default function ApprovalWorkflows() {
  usePageTitle('Approval Workflows');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [workflows, setWorkflows] = useState<WorkflowConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbAvailable, setDbAvailable] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'approval_workflows')
        .maybeSingle();

      if (error) throw error;

      if (data?.value && Array.isArray(data.value)) {
        setWorkflows(data.value as WorkflowConfig[]);
      } else {
        setWorkflows(DEFAULT_WORKFLOWS);
      }
    } catch {
      setDbAvailable(false);
      setWorkflows(DEFAULT_WORKFLOWS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const saveWorkflows = useCallback(async (updated: WorkflowConfig[]) => {
    setSaving(true);
    try {
      if (dbAvailable) {
        const { error } = await supabase
          .from('app_settings')
          .upsert({ key: 'approval_workflows', value: updated as unknown as Record<string, unknown> }, { onConflict: 'key' });

        if (error) throw error;
        toast({ title: 'Saved', description: 'Workflow configuration updated.' });
      } else {
        toast({ title: 'Saved locally', description: 'Changes saved in session only — database is unavailable.' });
      }
    } catch {
      toast({ title: 'Save failed', description: 'Could not persist workflow config.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [dbAvailable, toast]);

  const toggleWorkflow = useCallback(async (id: string) => {
    const updated = workflows.map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w,
    );
    setWorkflows(updated);
    await saveWorkflows(updated);
  }, [workflows, saveWorkflows]);

  const openEdit = useCallback((wf: WorkflowConfig) => {
    setEditingWorkflow(structuredClone(wf));
    setDialogOpen(true);
  }, []);

  const handleSaveDialog = useCallback(async () => {
    if (!editingWorkflow) return;
    const updated = workflows.map((w) =>
      w.id === editingWorkflow.id ? editingWorkflow : w,
    );
    setWorkflows(updated);
    setDialogOpen(false);
    setEditingWorkflow(null);
    await saveWorkflows(updated);
  }, [editingWorkflow, workflows, saveWorkflows]);

  const addStep = useCallback(() => {
    if (!editingWorkflow) return;
    setEditingWorkflow({
      ...editingWorkflow,
      steps: [
        ...editingWorkflow.steps,
        { id: crypto.randomUUID(), role: 'operations', is_required: true },
      ],
    });
  }, [editingWorkflow]);

  const removeStep = useCallback((stepId: string) => {
    if (!editingWorkflow) return;
    setEditingWorkflow({
      ...editingWorkflow,
      steps: editingWorkflow.steps.filter((s) => s.id !== stepId),
    });
  }, [editingWorkflow]);

  const moveStep = useCallback((index: number, direction: 'up' | 'down') => {
    if (!editingWorkflow) return;
    const steps = [...editingWorkflow.steps];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setEditingWorkflow({ ...editingWorkflow, steps });
  }, [editingWorkflow]);

  const updateStep = useCallback((stepId: string, patch: Partial<ApprovalStep>) => {
    if (!editingWorkflow) return;
    setEditingWorkflow({
      ...editingWorkflow,
      steps: editingWorkflow.steps.map((s) =>
        s.id === stepId ? { ...s, ...patch } : s,
      ),
    });
  }, [editingWorkflow]);

  const activeCount = workflows.filter((w) => w.enabled).length;
  const multiStepCount = workflows.filter((w) => w.steps.length > 1).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approval Workflows" description="Configure approval chains for HR processes" icon={GitBranch} />
        <TableSkeleton rows={4} cols={3} />
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approval Workflows" description="Configure approval chains for HR processes" icon={GitBranch} />
        <EmptyState title="No workflows configured" description="Workflow templates will appear here once initialized." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Approval Workflows" description="Configure approval chains for HR processes" icon={GitBranch} />

      {!dbAvailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Database unavailable — changes are saved in this session only.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total Workflows" value={workflows.length} icon={Layers} tone="default" />
        <StatCard title="Active" value={activeCount} icon={CheckCircle2} tone="success" />
        <StatCard title="Requires Multi-step" value={multiStepCount} icon={Activity} tone="primary" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workflows.map((wf) => {
          const Icon = WORKFLOW_ICONS[wf.icon] ?? FileText;
          return (
            <Card key={wf.id} className={!wf.enabled ? 'opacity-60' : undefined}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 rounded-md bg-muted p-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">{wf.name}</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">{wf.description}</CardDescription>
                  </div>
                </div>
                <Switch checked={wf.enabled} onCheckedChange={() => toggleWorkflow(wf.id)} aria-label={`Toggle ${wf.name}`} />
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Approval chain</p>
                  <div className="flex flex-wrap gap-1">
                    {wf.steps.map((step, i) => (
                      <Badge key={step.id} variant={step.is_required ? 'default' : 'secondary'} className="text-xs">
                        {i + 1}. {ROLE_LABELS[step.role]}
                      </Badge>
                    ))}
                    {wf.steps.length === 0 && <span className="text-xs text-muted-foreground">No steps defined</span>}
                  </div>
                </div>

                {wf.auto_approve.enabled && (
                  <p className="text-xs text-muted-foreground">
                    Auto-approve:{' '}
                    {wf.auto_approve.condition_type === 'less_than_days'
                      ? `< ${wf.auto_approve.threshold} days`
                      : `< ${wf.auto_approve.threshold.toLocaleString()}`}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Escalation: {wf.escalation.timeout_hours}h to {ROLE_LABELS[wf.escalation.escalate_to]}
                </p>

                <Button variant="outline" size="sm" className="w-full" onClick={() => openEdit(wf)}>
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                  Configure
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {editingWorkflow && (
            <>
              <DialogHeader>
                <DialogTitle>Configure {editingWorkflow.name}</DialogTitle>
                <DialogDescription>Adjust approval steps, thresholds, and notifications.</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                <div className="flex items-center justify-between">
                  <Label>Enabled</Label>
                  <Switch
                    checked={editingWorkflow.enabled}
                    onCheckedChange={(checked) => setEditingWorkflow({ ...editingWorkflow, enabled: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Approval Steps</Label>
                    <Button variant="outline" size="sm" onClick={addStep}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Step
                    </Button>
                  </div>

                  {editingWorkflow.steps.length === 0 && (
                    <p className="text-sm text-muted-foreground">No approval steps. Add one above.</p>
                  )}

                  <div className="space-y-2">
                    {editingWorkflow.steps.map((step, idx) => (
                      <div key={step.id} className="flex items-center gap-2 rounded-md border p-2">
                        <span className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">{idx + 1}</span>

                        <Select
                          value={step.role}
                          onValueChange={(val) => updateStep(step.id, { role: val as ApproverRole })}
                        >
                          <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-1">
                          <Label htmlFor={`req-${step.id}`} className="text-xs whitespace-nowrap">Required</Label>
                          <Switch
                            id={`req-${step.id}`}
                            checked={step.is_required}
                            onCheckedChange={(v) => updateStep(step.id, { is_required: v })}
                          />
                        </div>

                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Move up" disabled={idx === 0} onClick={() => moveStep(idx, 'up')}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Move down" disabled={idx === editingWorkflow.steps.length - 1} onClick={() => moveStep(idx, 'down')}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Remove step" onClick={() => removeStep(step.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Auto-Approve Conditions</Label>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={editingWorkflow.auto_approve.enabled}
                      onCheckedChange={(v) =>
                        setEditingWorkflow({
                          ...editingWorkflow,
                          auto_approve: { ...editingWorkflow.auto_approve, enabled: v },
                        })
                      }
                    />
                    <span className="text-sm">Enable auto-approve</span>
                  </div>
                  {editingWorkflow.auto_approve.enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Condition type</Label>
                        <Select
                          value={editingWorkflow.auto_approve.condition_type}
                          onValueChange={(v) =>
                            setEditingWorkflow({
                              ...editingWorkflow,
                              auto_approve: { ...editingWorkflow.auto_approve, condition_type: v as AutoApproveCondition['condition_type'] },
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="less_than_days">Less than N days</SelectItem>
                            <SelectItem value="less_than_amount">Less than amount</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Threshold</Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-xs"
                          value={editingWorkflow.auto_approve.threshold}
                          onChange={(e) =>
                            setEditingWorkflow({
                              ...editingWorkflow,
                              auto_approve: { ...editingWorkflow.auto_approve, threshold: Number(e.target.value) },
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <Label>Escalation</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Timeout (hours)</Label>
                      <Input
                        type="number"
                        min={1}
                        className="h-8 text-xs"
                        value={editingWorkflow.escalation.timeout_hours}
                        onChange={(e) =>
                          setEditingWorkflow({
                            ...editingWorkflow,
                            escalation: { ...editingWorkflow.escalation, timeout_hours: Number(e.target.value) },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Escalate to</Label>
                      <Select
                        value={editingWorkflow.escalation.escalate_to}
                        onValueChange={(v) =>
                          setEditingWorkflow({
                            ...editingWorkflow,
                            escalation: { ...editingWorkflow.escalation, escalate_to: v as ApproverRole },
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Notifications</Label>
                  <div className="space-y-2">
                    {([
                      ['notify_on_submit', 'On submission'],
                      ['notify_on_approve', 'On approval'],
                      ['notify_on_reject', 'On rejection'],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm">{label}</span>
                        <Switch
                          checked={editingWorkflow.notifications[key]}
                          onCheckedChange={(v) =>
                            setEditingWorkflow({
                              ...editingWorkflow,
                              notifications: { ...editingWorkflow.notifications, [key]: v },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveDialog} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
