import { useEffect, useState, useCallback } from 'react';
import { useDepartments, useEmployeeDirectory } from '@/queries';
import {
  Plus, Shield, AlertTriangle, Users, CheckCircle2,
  Search, Eye, Pencil, Trash2, UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { confirm } from '@/hooks/use-confirm';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

const RISK_LABEL: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};

const RISK_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  low: 'outline',
  medium: 'default',
  high: 'secondary',
  critical: 'destructive',
};

const RISK_CLASS: Record<string, string> = {
  low: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  critical: '',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active', filled: 'Filled', archived: 'Archived',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default', filled: 'outline', archived: 'secondary',
};

const STATUS_CLASS: Record<string, string> = {
  active: '',
  filled: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
  archived: '',
};

const READINESS_LABEL: Record<string, string> = {
  ready_now: 'Ready Now', '6_months': '6 Months', '1_year': '1 Year', '2_years': '2 Years',
};

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type PlanStatus = 'active' | 'filled' | 'archived';
type Readiness = 'ready_now' | '6_months' | '1_year' | '2_years';

interface Profile { id: string; full_name: string; }
interface Department { id: string; name: string; }

interface SuccessionPlan {
  id: string;
  position_title: string;
  department_id: string | null;
  current_holder_id: string | null;
  risk_level: RiskLevel;
  readiness_timeline: Readiness | null;
  notes: string | null;
  status: PlanStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SuccessionCandidate {
  id: string;
  plan_id: string;
  candidate_id: string;
  readiness: Readiness;
  development_areas: string | null;
  rating: number | null;
  created_at: string;
}

export default function SuccessionPlanning() {
  usePageTitle('Succession Planning');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [plans, setPlans] = useState<SuccessionPlan[]>([]);
  const [candidates, setCandidates] = useState<SuccessionCandidate[]>([]);
  const { data: profiles = [] } = useEmployeeDirectory();
  const { data: departments = [] } = useDepartments();
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [planDialog, setPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SuccessionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    position_title: '',
    department_id: 'none',
    current_holder_id: 'none',
    risk_level: 'medium' as RiskLevel,
    readiness_timeline: 'none',
    notes: '',
  });
  const [savingPlan, setSavingPlan] = useState(false);

  const [detailDialog, setDetailDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SuccessionPlan | null>(null);

  const [candidateDialog, setCandidateDialog] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    candidate_id: '',
    readiness: '1_year' as Readiness,
    development_areas: '',
    rating: '',
  });
  const [savingCandidate, setSavingCandidate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: pData }, { data: cData }] = await Promise.all([
      supabase.from('succession_plans').select('id, position_title, department_id, current_holder_id, risk_level, readiness_timeline, notes, status, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('succession_candidates').select('id, plan_id, candidate_id, readiness, development_areas, rating').order('created_at', { ascending: false }).limit(1000),
    ]);
    setPlans((pData as SuccessionPlan[]) || []);
    setCandidates((cData as SuccessionCandidate[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id: string | null) => {
    if (!id) return '—';
    return profiles.find(p => p.id === id)?.full_name ?? 'Unknown';
  };

  const deptOf = (id: string | null) => {
    if (!id) return '—';
    return departments.find(d => d.id === id)?.name ?? 'Unknown';
  };

  const candidatesFor = (planId: string) => candidates.filter(c => c.plan_id === planId);

  const filteredPlans = plans.filter(p => {
    if (riskFilter !== 'all' && p.risk_level !== riskFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const holderName = nameOf(p.current_holder_id).toLowerCase();
      const deptName = deptOf(p.department_id).toLowerCase();
      if (
        !p.position_title.toLowerCase().includes(q) &&
        !holderName.includes(q) &&
        !deptName.includes(q)
      ) return false;
    }
    return true;
  });

  const totalPlans = plans.length;
  const criticalRisk = plans.filter(p => p.risk_level === 'critical' && p.status === 'active').length;
  const highRisk = plans.filter(p => p.risk_level === 'high' && p.status === 'active').length;
  const readyNowCount = candidates.filter(c => c.readiness === 'ready_now').length;

  const openPlanDialog = (existing?: SuccessionPlan) => {
    setEditingPlan(existing ?? null);
    if (existing) {
      setPlanForm({
        position_title: existing.position_title,
        department_id: existing.department_id ?? 'none',
        current_holder_id: existing.current_holder_id ?? 'none',
        risk_level: existing.risk_level,
        readiness_timeline: existing.readiness_timeline ?? 'none',
        notes: existing.notes ?? '',
      });
    } else {
      setPlanForm({
        position_title: '', department_id: 'none', current_holder_id: 'none',
        risk_level: 'medium', readiness_timeline: 'none', notes: '',
      });
    }
    setPlanDialog(true);
  };

  const savePlan = async () => {
    if (!planForm.position_title.trim()) {
      toast({ title: 'Position title is required', variant: 'destructive' });
      return;
    }
    setSavingPlan(true);
    const payload = {
      position_title: planForm.position_title.trim(),
      department_id: planForm.department_id === 'none' ? null : planForm.department_id,
      current_holder_id: planForm.current_holder_id === 'none' ? null : planForm.current_holder_id,
      risk_level: planForm.risk_level,
      readiness_timeline: planForm.readiness_timeline === 'none' ? null : planForm.readiness_timeline,
      notes: planForm.notes.trim() || null,
      ...(editingPlan ? {} : { created_by: profile?.id }),
    };
    const { error } = editingPlan
      ? await supabase.from('succession_plans').update(payload).eq('id', editingPlan.id)
      : await supabase.from('succession_plans').insert(payload);
    setSavingPlan(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingPlan ? 'Plan updated' : 'Plan created' });
    setPlanDialog(false);
    load();
  };

  const deletePlan = async (id: string) => {
    const ok = await confirm({
      title: 'Delete succession plan',
      description: 'This plan and all its candidates will be permanently deleted. Continue?',
      variant: 'destructive',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    const { error } = await supabase.from('succession_plans').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Plan deleted' });
    if (selectedPlan?.id === id) setDetailDialog(false);
    load();
  };

  const openDetail = (plan: SuccessionPlan) => {
    setSelectedPlan(plan);
    setDetailDialog(true);
  };

  const openCandidateDialog = () => {
    setCandidateForm({ candidate_id: '', readiness: '1_year', development_areas: '', rating: '' });
    setCandidateDialog(true);
  };

  const saveCandidate = async () => {
    if (!candidateForm.candidate_id || !selectedPlan) {
      toast({ title: 'Candidate is required', variant: 'destructive' });
      return;
    }
    const ratingVal = candidateForm.rating ? parseFloat(candidateForm.rating) : null;
    if (ratingVal !== null && (ratingVal < 0 || ratingVal > 5)) {
      toast({ title: 'Rating must be between 0 and 5', variant: 'destructive' });
      return;
    }
    setSavingCandidate(true);
    const { error } = await supabase.from('succession_candidates').insert({
      plan_id: selectedPlan.id,
      candidate_id: candidateForm.candidate_id,
      readiness: candidateForm.readiness,
      development_areas: candidateForm.development_areas.trim() || null,
      rating: ratingVal,
    });
    setSavingCandidate(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Candidate added' });
    setCandidateDialog(false);
    load();
  };

  const deleteCandidate = async (id: string) => {
    const ok = await confirm({
      title: 'Remove candidate',
      description: 'This candidate will be removed from the succession plan. Continue?',
      variant: 'destructive',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    const { error } = await supabase.from('succession_candidates').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Candidate removed' });
    load();
  };

  const RiskBadge = ({ level }: { level: string }) => (
    <Badge
      variant={RISK_VARIANT[level] ?? 'default'}
      className={`text-[10px] ${RISK_CLASS[level] ?? ''}`}
    >
      {RISK_LABEL[level] ?? level}
    </Badge>
  );

  const StatusBadge = ({ status }: { status: string }) => (
    <Badge
      variant={STATUS_VARIANT[status] ?? 'default'}
      className={`text-[10px] ${STATUS_CLASS[status] ?? ''}`}
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Succession Planning"
        description="Identify critical roles, assess risk, and develop talent pipelines."
        actions={<Button onClick={() => openPlanDialog()}><Plus className="h-4 w-4 mr-2" />New Plan</Button>}
      />

      <div className="kd-stat-grid">
        {([
          { label: 'Total Plans', value: totalPlans, icon: Shield, tone: 'primary' },
          { label: 'Critical Risk', value: criticalRisk, icon: AlertTriangle, tone: criticalRisk > 0 ? 'danger' : 'default' },
          { label: 'High Risk', value: highRisk, icon: AlertTriangle, tone: highRisk > 0 ? 'warning' : 'default' },
          { label: 'Ready Now', value: readyNowCount, icon: CheckCircle2, tone: readyNowCount > 0 ? 'success' : 'default' },
        ] as { label: string; value: number; icon: typeof Shield; tone: 'primary' | 'default' | 'success' | 'warning' | 'danger' }[]).map(s => (
          <StatCard key={s.label} title={s.label} value={s.value} icon={s.icon} tone={s.tone} />
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by position, holder, or department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Risk level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risks</SelectItem>
            {Object.entries(RISK_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : filteredPlans.length === 0 ? (
        <EmptyState
          compact
          icon={Shield}
          title={plans.length === 0 ? 'No succession plans yet' : 'No plans match these filters'}
          description={plans.length === 0
            ? 'Create your first plan to start mapping critical roles and talent pipelines.'
            : 'Try adjusting your search or filters.'}
          action={plans.length === 0
            ? <Button size="sm" onClick={() => openPlanDialog()}><Plus className="h-4 w-4 mr-2" />New Plan</Button>
            : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground text-xs">
                <th className="pb-2 pr-3 font-medium">Position</th>
                <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Current Holder</th>
                <th className="pb-2 pr-3 font-medium">Risk</th>
                <th className="pb-2 pr-3 font-medium hidden md:table-cell">Candidates</th>
                <th className="pb-2 pr-3 font-medium hidden md:table-cell">Readiness</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.map(plan => {
                const planCandidates = candidatesFor(plan.id);
                return (
                  <tr key={plan.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{plan.position_title}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{nameOf(plan.current_holder_id)}</p>
                    </td>
                    <td className="py-3 pr-3 hidden sm:table-cell text-muted-foreground">
                      {nameOf(plan.current_holder_id)}
                    </td>
                    <td className="py-3 pr-3"><RiskBadge level={plan.risk_level} /></td>
                    <td className="py-3 pr-3 hidden md:table-cell">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />{planCandidates.length}
                      </span>
                    </td>
                    <td className="py-3 pr-3 hidden md:table-cell text-muted-foreground">
                      {plan.readiness_timeline ? READINESS_LABEL[plan.readiness_timeline] : '—'}
                    </td>
                    <td className="py-3 pr-3"><StatusBadge status={plan.status} /></td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="View" onClick={() => openDetail(plan)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit" onClick={() => openPlanDialog(plan)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Delete" onClick={() => deletePlan(plan.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit plan dialog */}
      <Dialog open={planDialog} onOpenChange={setPlanDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Succession Plan' : 'New Succession Plan'}</DialogTitle>
            <DialogDescription>Define a critical role and assess its succession risk.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="kd-label">Position title *</Label>
              <Input
                value={planForm.position_title}
                onChange={e => setPlanForm(p => ({ ...p, position_title: e.target.value }))}
                placeholder="e.g. Chief Operating Officer"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Department</Label>
              <Select value={planForm.department_id} onValueChange={v => setPlanForm(p => ({ ...p, department_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Current holder</Label>
              <Select value={planForm.current_holder_id} onValueChange={v => setPlanForm(p => ({ ...p, current_holder_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="kd-label">Risk level *</Label>
                <Select value={planForm.risk_level} onValueChange={v => setPlanForm(p => ({ ...p, risk_level: v as RiskLevel }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RISK_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="kd-label">Readiness timeline</Label>
                <Select value={planForm.readiness_timeline} onValueChange={v => setPlanForm(p => ({ ...p, readiness_timeline: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {Object.entries(READINESS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Notes</Label>
              <Textarea
                rows={3}
                value={planForm.notes}
                onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Context on the role, risks, or transition considerations..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(false)}>Cancel</Button>
            <Button onClick={savePlan} disabled={savingPlan}>
              {savingPlan ? 'Saving...' : editingPlan ? 'Update plan' : 'Create plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan detail dialog */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedPlan && (() => {
            const planCandidates = candidatesFor(selectedPlan.id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{selectedPlan.position_title}</DialogTitle>
                  <DialogDescription>Succession plan details and candidate pipeline.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Department</p>
                      <p className="font-medium">{deptOf(selectedPlan.department_id)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Current Holder</p>
                      <p className="font-medium">{nameOf(selectedPlan.current_holder_id)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Risk Level</p>
                      <RiskBadge level={selectedPlan.risk_level} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Readiness Timeline</p>
                      <p className="font-medium">
                        {selectedPlan.readiness_timeline
                          ? READINESS_LABEL[selectedPlan.readiness_timeline]
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <StatusBadge status={selectedPlan.status} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="font-medium">{format(parseISO(selectedPlan.created_at), 'd MMM yyyy')}</p>
                    </div>
                  </div>
                  {selectedPlan.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{selectedPlan.notes}</p>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold">Candidates ({planCandidates.length})</h4>
                      <Button size="sm" variant="outline" onClick={openCandidateDialog}>
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />Add Candidate
                      </Button>
                    </div>
                    {planCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No candidates added yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {planCandidates.map(c => (
                          <Card key={c.id}>
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">{nameOf(c.candidate_id)}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <Badge variant="outline" className="text-[10px]">
                                      {READINESS_LABEL[c.readiness]}
                                    </Badge>
                                    {c.rating !== null && (
                                      <span className="text-xs text-muted-foreground">
                                        Rating: {c.rating}/5
                                      </span>
                                    )}
                                  </div>
                                  {c.rating !== null && (
                                    <Progress value={(c.rating / 5) * 100} className="h-1.5 mt-2 max-w-[120px]" />
                                  )}
                                  {c.development_areas && (
                                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                      {c.development_areas}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-7 w-7 text-destructive shrink-0"
                                  aria-label="Remove candidate"
                                  onClick={() => deleteCandidate(c.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add candidate dialog */}
      <Dialog open={candidateDialog} onOpenChange={setCandidateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Candidate</DialogTitle>
            <DialogDescription>Add a successor candidate to this plan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="kd-label">Candidate *</Label>
              <Select value={candidateForm.candidate_id || undefined} onValueChange={v => setCandidateForm(p => ({ ...p, candidate_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Readiness</Label>
              <Select value={candidateForm.readiness} onValueChange={v => setCandidateForm(p => ({ ...p, readiness: v as Readiness }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(READINESS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Development areas</Label>
              <Textarea
                rows={3}
                value={candidateForm.development_areas}
                onChange={e => setCandidateForm(p => ({ ...p, development_areas: e.target.value }))}
                placeholder="Skills or experiences needed before they're ready..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Rating (0-5)</Label>
              <Input
                type="number"
                min={0} max={5} step={0.1}
                value={candidateForm.rating}
                onChange={e => setCandidateForm(p => ({ ...p, rating: e.target.value }))}
                placeholder="e.g. 3.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCandidateDialog(false)}>Cancel</Button>
            <Button onClick={saveCandidate} disabled={savingCandidate}>
              {savingCandidate ? 'Adding...' : 'Add candidate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
