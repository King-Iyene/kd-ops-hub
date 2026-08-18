import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Star, ChevronDown, ChevronUp, CheckCircle2,
  AlertCircle, BarChart3, Send, ThumbsUp, Target,
  TrendingUp, Pencil, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, isPast, parseISO } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { confirm } from '@/hooks/use-confirm';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { StatCard } from '@/components/ui-kit/StatCard';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow, MobileCardFooter } from '@/components/ui-kit/MobileCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { chartTheme, axisTick, chartAnim, ChartGradients, GlassTooltip } from '@/components/ChartKit';

const COMPETENCIES = [
  { key: 'delivery',       label: 'Delivery & Results' },
  { key: 'communication',  label: 'Communication' },
  { key: 'teamwork',       label: 'Teamwork' },
  { key: 'initiative',     label: 'Initiative' },
  { key: 'leadership',     label: 'Leadership' },
] as const;

type CompetencyKey = typeof COMPETENCIES[number]['key'];

const CYCLE_TYPE_LABEL: Record<string, string> = {
  annual: 'Annual', mid_year: 'Mid-Year', quarterly: 'Quarterly', probation: 'Probation',
};

const STATUS_BADGE: Record<string, { label: string; variant: 'default'|'secondary'|'outline' }> = {
  draft:        { label: 'Draft',        variant: 'secondary' },
  submitted:    { label: 'Submitted',    variant: 'default' },
  acknowledged: { label: 'Acknowledged', variant: 'outline' },
};

const CYCLE_STATUS: Record<string, { label: string; variant: 'default'|'secondary' }> = {
  active: { label: 'Active', variant: 'default' },
  closed: { label: 'Closed', variant: 'secondary' },
};

const PLAN_CATEGORY_LABEL: Record<string, string> = {
  technical: 'Technical', leadership: 'Leadership', communication: 'Communication',
  domain: 'Domain', other: 'Other',
};

const PLAN_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
};

type PlanCategory = keyof typeof PLAN_CATEGORY_LABEL;
type PlanStatus = keyof typeof PLAN_STATUS_LABEL;

interface DevelopmentPlan {
  id: string;
  employee_id: string;
  review_id: string | null;
  title: string;
  description: string | null;
  category: PlanCategory;
  target_date: string | null;
  status: PlanStatus;
  progress: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewCycle {
  id: string;
  name: string;
  cycle_type: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: 'active' | 'closed';
  created_at: string;
}

interface Review {
  id: string;
  cycle_id: string;
  employee_id: string;
  reviewer_id: string;
  review_type: 'manager' | 'self' | 'peer';
  ratings: Record<CompetencyKey, number>;
  overall_rating: number | null;
  strengths: string | null;
  areas_for_growth: string | null;
  development_plan: Array<{ id: string; goal: string; action: string; due_date: string; status: 'open'|'in_progress'|'done' }>;
  status: 'draft' | 'submitted' | 'acknowledged';
  submitted_at: string | null;
  acknowledged_at: string | null;
}

interface Profile { id: string; full_name: string; }

interface Goal {
  id: string;
  title: string;
  scope: 'company' | 'team' | 'individual';
  owner_id: string | null;
  quarter: string;
  status: 'open' | 'in_progress' | 'complete' | 'missed';
  progress_pct: number;
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)}
          className={`transition-colors ${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}>
          <Star className={`h-5 w-5 ${n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`} />
        </button>
      ))}
      {value > 0 && <span className="text-xs text-muted-foreground ml-1 self-center">{value}/5</span>}
    </div>
  );
}

const emptyRatings = (): Record<CompetencyKey, number> =>
  Object.fromEntries(COMPETENCIES.map(c => [c.key, 0])) as Record<CompetencyKey, number>;

const avgRating = (r: Record<CompetencyKey, number>): number => {
  const vals = Object.values(r).filter(v => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
};

export default function Performance() {
  usePageTitle('Performance Reviews');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [plans, setPlans] = useState<DevelopmentPlan[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);

  // Development plan filters
  const [planStatusFilter, setPlanStatusFilter] = useState<string>('all');
  const [planCategoryFilter, setPlanCategoryFilter] = useState<string>('all');

  // Development plan dialog
  const [planDialog, setPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DevelopmentPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    employee_id: '', title: '', description: '', category: 'other' as PlanCategory,
    target_date: '', status: 'not_started' as PlanStatus, progress: 0, review_id: 'none',
  });
  const [savingPlan, setSavingPlan] = useState(false);

  // Cycle dialog
  const [cycleDialog, setCycleDialog] = useState(false);
  const [cycleForm, setCycleForm] = useState({ name: '', cycle_type: 'quarterly', period_start: '', period_end: '', due_date: '' });
  const [savingCycle, setSavingCycle] = useState(false);

  // Review dialog
  const [reviewDialog, setReviewDialog] = useState(false);
  const [reviewCycleId, setReviewCycleId] = useState('');
  const [reviewForm, setReviewForm] = useState({
    employee_id: '', reviewer_id: '', review_type: 'manager' as 'manager'|'self'|'peer',
    ratings: emptyRatings(), strengths: '', areas_for_growth: '',
  });
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cData }, { data: rData }, { data: pData }, { data: dpData }, { data: gData }] = await Promise.all([
      supabase.from('review_cycles').select('id, name, cycle_type, period_start, period_end, due_date, status').order('due_date', { ascending: false }).limit(50),
      supabase.from('performance_reviews').select('id, cycle_id, employee_id, reviewer_id, review_type, ratings, overall_rating, strengths, areas_for_growth, status, submitted_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('profiles_directory').select('id, full_name').neq('is_anonymised', true).limit(200),
      supabase.from('development_plans').select('id, employee_id, review_id, title, description, category, target_date, status, progress').order('created_at', { ascending: false }).limit(500),
      supabase.from('goals').select('id, title, scope, owner_id, quarter, status, progress_pct').limit(500),
    ]);
    setCycles((cData as ReviewCycle[]) || []);
    setReviews((rData as Review[]) || []);
    setProfiles((pData as Profile[]) || []);
    setPlans((dpData as DevelopmentPlan[]) || []);
    setGoals((gData as Goal[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCycleDialog = () => {
    setCycleForm({ name: '', cycle_type: 'quarterly', period_start: '', period_end: '', due_date: '' });
    setCycleDialog(true);
  };

  const saveCycle = async () => {
    if (!cycleForm.name.trim() || !cycleForm.period_start || !cycleForm.period_end || !cycleForm.due_date) {
      toast({ title: 'All fields are required', variant: 'destructive' }); return;
    }
    setSavingCycle(true);
    const { error } = await supabase.from('review_cycles').insert({
      ...cycleForm, name: cycleForm.name.trim(), created_by: profile?.id,
    });
    setSavingCycle(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Review cycle created' });
    setCycleDialog(false);
    load();
  };

  const closeCycle = async (id: string) => {
    await supabase.from('review_cycles').update({ status: 'closed' }).eq('id', id);
    toast({ title: 'Cycle closed' });
    load();
  };

  const openReviewDialog = (cycleId: string, existing?: Review) => {
    setReviewCycleId(cycleId);
    setEditingReview(existing ?? null);
    if (existing) {
      setReviewForm({
        employee_id: existing.employee_id, reviewer_id: existing.reviewer_id,
        review_type: existing.review_type, ratings: { ...emptyRatings(), ...existing.ratings },
        strengths: existing.strengths ?? '', areas_for_growth: existing.areas_for_growth ?? '',
      });
    } else {
      setReviewForm({ employee_id: '', reviewer_id: profile?.id ?? '', review_type: 'manager', ratings: emptyRatings(), strengths: '', areas_for_growth: '' });
    }
    setReviewDialog(true);
  };

  const saveReview = async () => {
    if (!reviewForm.employee_id || !reviewForm.reviewer_id) {
      toast({ title: 'Employee and reviewer are required', variant: 'destructive' }); return;
    }
    const overall = avgRating(reviewForm.ratings);
    setSavingReview(true);
    const payload = {
      cycle_id: reviewCycleId, employee_id: reviewForm.employee_id,
      reviewer_id: reviewForm.reviewer_id, review_type: reviewForm.review_type,
      ratings: reviewForm.ratings,
      overall_rating: overall > 0 ? Math.round(overall * 10) / 10 : null,
      strengths: reviewForm.strengths.trim() || null,
      areas_for_growth: reviewForm.areas_for_growth.trim() || null,
    };
    const { error } = editingReview
      ? await supabase.from('performance_reviews').update(payload).eq('id', editingReview.id)
      : await supabase.from('performance_reviews').insert(payload);
    setSavingReview(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingReview ? 'Review updated' : 'Review created' });
    setReviewDialog(false);
    load();
  };

  const submitReview = async (r: Review) => {
    await supabase.from('performance_reviews').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', r.id);
    toast({ title: 'Review submitted' });
    load();
  };

  const acknowledgeReview = async (r: Review) => {
    await supabase.from('performance_reviews').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', r.id);
    toast({ title: 'Review acknowledged' });
    load();
  };

  const openPlanDialog = (existing?: DevelopmentPlan) => {
    setEditingPlan(existing ?? null);
    if (existing) {
      setPlanForm({
        employee_id: existing.employee_id, title: existing.title, description: existing.description ?? '',
        category: existing.category, target_date: existing.target_date ?? '', status: existing.status,
        progress: existing.progress, review_id: existing.review_id ?? 'none',
      });
    } else {
      setPlanForm({
        employee_id: profile?.id ?? '', title: '', description: '', category: 'other',
        target_date: '', status: 'not_started', progress: 0, review_id: 'none',
      });
    }
    setPlanDialog(true);
  };

  const savePlan = async () => {
    if (!planForm.employee_id || !planForm.title.trim()) {
      toast({ title: 'Employee and title are required', variant: 'destructive' }); return;
    }
    setSavingPlan(true);
    const payload = {
      employee_id: planForm.employee_id,
      review_id: planForm.review_id === 'none' ? null : planForm.review_id,
      title: planForm.title.trim(),
      description: planForm.description.trim() || null,
      category: planForm.category,
      target_date: planForm.target_date || null,
      status: planForm.status,
      progress: planForm.status === 'completed' ? 100 : planForm.progress,
      created_by: editingPlan ? undefined : profile?.id,
    };
    const { error } = editingPlan
      ? await supabase.from('development_plans').update(payload).eq('id', editingPlan.id)
      : await supabase.from('development_plans').insert(payload);
    setSavingPlan(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingPlan ? 'Plan updated' : 'Plan created' });
    setPlanDialog(false);
    load();
  };

  const deletePlan = async (id: string) => {
    const ok = await confirm({ title: 'Delete plan', description: 'This development plan will be permanently deleted. Continue?', variant: 'destructive', confirmLabel: 'Delete' });
    if (!ok) return;
    const { error } = await supabase.from('development_plans').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Plan deleted' });
    load();
  };

  const advancePlanStatus = async (planItem: DevelopmentPlan) => {
    const next: Record<PlanStatus, PlanStatus | null> = {
      not_started: 'in_progress', in_progress: 'completed', completed: null, cancelled: null,
    };
    const nextStatus = next[planItem.status];
    if (!nextStatus) return;
    const nextProgress = nextStatus === 'completed' ? 100 : Math.max(planItem.progress, 10);
    await supabase.from('development_plans')
      .update({ status: nextStatus, progress: nextProgress })
      .eq('id', planItem.id);
    toast({ title: `Marked as ${PLAN_STATUS_LABEL[nextStatus].toLowerCase()}` });
    load();
  };

  const nameOf = (id: string) => profiles.find(p => p.id === id)?.full_name ?? 'Unknown';

  const filteredPlans = plans.filter(p =>
    (planStatusFilter === 'all' || p.status === planStatusFilter) &&
    (planCategoryFilter === 'all' || p.category === planCategoryFilter),
  );

  const plansInProgress = plans.filter(p => p.status === 'in_progress').length;
  const overduePlans = plans.filter(p =>
    p.target_date && p.status !== 'completed' && p.status !== 'cancelled' && isPast(parseISO(p.target_date)),
  ).length;

  const trendData = useMemo(() => {
    return reviews
      .filter(r => r.overall_rating != null && r.submitted_at)
      .sort((a, b) => (a.submitted_at! < b.submitted_at! ? -1 : 1))
      .slice(-12)
      .map(r => ({
        date: format(parseISO(r.submitted_at!), 'd MMM'),
        rating: r.overall_rating,
      }));
  }, [reviews]);

  const activeCycles = cycles.filter(c => c.status === 'active').length;
  const totalReviews = reviews.length;
  const submitted = reviews.filter(r => r.status !== 'draft').length;
  const avgOverall = reviews.filter(r => r.overall_rating).length
    ? reviews.filter(r => r.overall_rating).reduce((s, r) => s + (r.overall_rating ?? 0), 0) / reviews.filter(r => r.overall_rating).length
    : 0;

  const competencyAvgs = useMemo(() => {
    const rated = reviews.filter(r => r.ratings && Object.values(r.ratings).some(v => v > 0));
    if (!rated.length) return null;
    return COMPETENCIES.map(c => {
      const vals = rated.map(r => r.ratings[c.key]).filter(v => v > 0);
      return { key: c.key, label: c.label, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
    });
  }, [reviews]);

  const reviewCompletionRate = totalReviews > 0 ? Math.round((submitted / totalReviews) * 100) : 0;
  const pipsActive = plans.filter(p => p.category === 'other' && p.status === 'in_progress' && p.title.toLowerCase().includes('pip')).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Performance Reviews"
        description="Manage review cycles, competency ratings, and development plans."
        actions={<Button onClick={openCycleDialog}><Plus className="h-4 w-4 mr-2" />New Cycle</Button>}
      />

      {/* Stats */}
      <div className="kd-stat-grid">
        {([
          { label: 'Active cycles', value: activeCycles, icon: BarChart3, tone: 'primary' },
          { label: 'Reviews completed', value: submitted, icon: Send, tone: 'success' },
          { label: 'Completion rate', value: `${reviewCompletionRate}%`, icon: CheckCircle2, tone: reviewCompletionRate >= 80 ? 'success' : 'warning' },
          { label: 'Avg overall rating', value: avgOverall > 0 ? avgOverall.toFixed(1) + '/5' : '—', icon: Star, tone: 'gold' },
          { label: 'Plans in progress', value: plansInProgress, icon: Target, tone: 'primary' },
          { label: 'Overdue plans', value: overduePlans, icon: AlertCircle, tone: overduePlans > 0 ? 'danger' : 'default' },
        ] as { label: string; value: string | number; icon: typeof BarChart3; tone: 'primary' | 'default' | 'success' | 'gold' | 'warning' | 'danger' }[]).map(s => (
          <StatCard
            key={s.label}
            title={s.label}
            value={s.value}
            icon={s.icon}
            tone={s.tone}
          />
        ))}
      </div>

      {trendData.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />Rating trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <ChartGradients />
                  <CartesianGrid vertical={false} stroke={chartTheme.gridLine} />
                  <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 5]} tick={axisTick} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<GlassTooltip />} />
                  <Area
                    type="monotone" dataKey="rating" name="Rating"
                    stroke={chartTheme.primary} fill="url(#kd-grad-primary)" strokeWidth={2}
                    {...chartAnim}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {competencyAvgs && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />Competency Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {competencyAvgs.map(c => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{c.label}</span>
                <Progress value={c.avg * 20} className="flex-1 h-2" />
                <span className="text-xs font-medium w-10 text-right">{c.avg > 0 ? c.avg.toFixed(1) : '—'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="cycles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cycles">Review cycles</TabsTrigger>
          <TabsTrigger value="plans">Development plans</TabsTrigger>
        </TabsList>

        <TabsContent value="cycles" className="space-y-4 mt-0">
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : cycles.length === 0 ? (
        <EmptyState compact icon={Star} title="No review cycles yet" description="Create your first cycle above to start tracking employee performance." />
      ) : (
        <div className="space-y-4">
          {cycles.map(cycle => {
            const cycleReviews = reviews.filter(r => r.cycle_id === cycle.id);
            const isExpanded = expandedCycle === cycle.id;
            const isOverdue = cycle.status === 'active' && isPast(parseISO(cycle.due_date));
            return (
              <Card key={cycle.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{cycle.name}</CardTitle>
                        <Badge variant={CYCLE_STATUS[cycle.status].variant} className="text-[10px]">
                          {CYCLE_STATUS[cycle.status].label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{CYCLE_TYPE_LABEL[cycle.cycle_type]}</Badge>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertCircle className="h-3 w-3 mr-1" />Overdue
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(cycle.period_start), 'd MMM yyyy')} – {format(parseISO(cycle.period_end), 'd MMM yyyy')}
                        {' · '}Due: {format(parseISO(cycle.due_date), 'd MMM yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cycle.status === 'active' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openReviewDialog(cycle.id)}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />Add review
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => closeCycle(cycle.id)}>Close cycle</Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setExpandedCycle(isExpanded ? null : cycle.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="ml-1 text-xs">{cycleReviews.length} review{cycleReviews.length !== 1 ? 's' : ''}</span>
                      </Button>
                    </div>
                  </div>

                  {/* Submission progress bar */}
                  {cycleReviews.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Submitted</span>
                        <span>{cycleReviews.filter(r => r.status !== 'draft').length} / {cycleReviews.length}</span>
                      </div>
                      <Progress value={(cycleReviews.filter(r => r.status !== 'draft').length / cycleReviews.length) * 100} className="h-1.5" />
                    </div>
                  )}
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    {cycleReviews.length === 0 ? (
                      <EmptyState compact icon={Star} title="No reviews yet" description="Reviews submitted under this cycle will appear here." />
                    ) : (
                      <div className="space-y-3">
                        {cycleReviews.map(r => (
                          <div key={r.id} className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <p className="text-sm font-medium">{nameOf(r.employee_id)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {r.review_type.charAt(0).toUpperCase() + r.review_type.slice(1)} review · by {nameOf(r.reviewer_id)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {r.overall_rating && (
                                  <div className="flex items-center gap-1">
                                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                                    <span className="text-sm font-semibold">{r.overall_rating.toFixed(1)}</span>
                                  </div>
                                )}
                                <Badge variant={STATUS_BADGE[r.status].variant} className="text-[10px]">
                                  {STATUS_BADGE[r.status].label}
                                </Badge>
                                {r.status === 'draft' && r.reviewer_id === profile?.id && (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => openReviewDialog(cycle.id, r)}>Edit</Button>
                                    <Button size="sm" variant="outline" onClick={() => submitReview(r)}>
                                      <Send className="h-3.5 w-3.5 mr-1.5" />Submit
                                    </Button>
                                  </>
                                )}
                                {r.status === 'submitted' && r.employee_id === profile?.id && (
                                  <Button size="sm" variant="outline" onClick={() => acknowledgeReview(r)}>
                                    <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />Acknowledge
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Competency breakdown */}
                            {Object.keys(r.ratings).length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
                                {COMPETENCIES.map(c => {
                                  const val = r.ratings[c.key] ?? 0;
                                  return (
                                    <div key={c.key} className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-muted-foreground w-36 shrink-0">{c.label}</span>
                                      <div className="flex-1">
                                        <Progress value={(val / 5) * 100} className="h-1.5" />
                                      </div>
                                      <span className="text-xs font-medium w-6 text-right">{val || '—'}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {(r.strengths || r.areas_for_growth) && (
                              <div className="grid sm:grid-cols-2 gap-3 pt-1 text-xs">
                                {r.strengths && (
                                  <div>
                                    <p className="font-semibold text-success mb-0.5">Strengths</p>
                                    <p className="text-muted-foreground leading-relaxed">{r.strengths}</p>
                                  </div>
                                )}
                                {r.areas_for_growth && (
                                  <div>
                                    <p className="font-semibold text-warning mb-0.5">Areas for growth</p>
                                    <p className="text-muted-foreground leading-relaxed">{r.areas_for_growth}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Read-only reference: this employee's active goals, for context */}
                            {goals.filter(g => g.owner_id === r.employee_id).length > 0 && (
                              <div className="pt-1">
                                <p className="text-[11px] font-semibold text-muted-foreground mb-1">Linked goals ({goals.filter(g => g.owner_id === r.employee_id).length})</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {goals.filter(g => g.owner_id === r.employee_id).map(g => (
                                    <Badge key={g.id} variant="outline" className="text-[10px] font-normal">
                                      {g.title} · {g.quarter} · {g.progress_pct}%
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
        </TabsContent>

        <TabsContent value="plans" className="space-y-4 mt-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={planStatusFilter} onValueChange={setPlanStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(PLAN_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={planCategoryFilter} onValueChange={setPlanCategoryFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {Object.entries(PLAN_CATEGORY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => openPlanDialog()}><Plus className="h-4 w-4 mr-2" />New plan</Button>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : filteredPlans.length === 0 ? (
            <EmptyState
              compact icon={Target}
              title={plans.length === 0 ? 'No development plans yet' : 'No plans match these filters'}
              description={plans.length === 0 ? 'Create a plan to track a growth goal, skill, or action item for an employee.' : 'Try a different status or category.'}
              action={plans.length === 0 ? <Button size="sm" onClick={() => openPlanDialog()}><Plus className="h-4 w-4 mr-2" />New plan</Button> : undefined}
            />
          ) : (
            <>
              {/* Desktop grid */}
              <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredPlans.map(p => {
                  const overdue = p.target_date && p.status !== 'completed' && p.status !== 'cancelled' && isPast(parseISO(p.target_date));
                  return (
                    <Card key={p.id} className="flex flex-col">
                      <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{p.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{nameOf(p.employee_id)}</p>
                          </div>
                          <StatusBadge status={p.status} size="sm" />
                        </div>
                        {p.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{p.description}</p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap text-[10px]">
                          <Badge variant="outline" className="text-[10px]">{PLAN_CATEGORY_LABEL[p.category]}</Badge>
                          {p.target_date && (
                            <Badge variant={overdue ? 'destructive' : 'outline'} className="text-[10px]">
                              {overdue && <AlertCircle className="h-3 w-3 mr-1" />}
                              Due {format(parseISO(p.target_date), 'd MMM yyyy')}
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1 mt-auto">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Progress</span><span>{p.progress}%</span>
                          </div>
                          <Progress value={p.progress} className="h-1.5" />
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          {(p.status === 'not_started' || p.status === 'in_progress') ? (
                            <Button size="sm" variant="outline" onClick={() => advancePlanStatus(p)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                              Mark {p.status === 'not_started' ? 'in progress' : 'complete'}
                            </Button>
                          ) : <span />}
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openPlanDialog(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePlan(p.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filteredPlans.map(p => {
                  const overdue = p.target_date && p.status !== 'completed' && p.status !== 'cancelled' && isPast(parseISO(p.target_date));
                  return (
                    <MobileCard key={p.id} onClick={() => openPlanDialog(p)}>
                      <MobileCardHeader>
                        <MobileCardTitle>{p.title}</MobileCardTitle>
                        <MobileCardMeta><StatusBadge status={p.status} size="sm" /></MobileCardMeta>
                      </MobileCardHeader>
                      <MobileCardRow label="Employee">{nameOf(p.employee_id)}</MobileCardRow>
                      <MobileCardRow label="Category">{PLAN_CATEGORY_LABEL[p.category]}</MobileCardRow>
                      <MobileCardRow label="Progress">{p.progress}%</MobileCardRow>
                      {p.target_date && (
                        <MobileCardRow label="Target date">
                          <span className={overdue ? 'text-destructive font-medium' : ''}>
                            {format(parseISO(p.target_date), 'd MMM yyyy')}
                          </span>
                        </MobileCardRow>
                      )}
                      <MobileCardFooter>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); deletePlan(p.id); }}>
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
                        </Button>
                        {(p.status === 'not_started' || p.status === 'in_progress') && (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); advancePlanStatus(p); }}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Advance
                          </Button>
                        )}
                      </MobileCardFooter>
                    </MobileCard>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* New cycle dialog */}
      <Dialog open={cycleDialog} onOpenChange={setCycleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Review Cycle</DialogTitle>
            <DialogDescription>A cycle groups all reviews for a given period (e.g. Q2 2026).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="kd-label">Cycle name *</Label>
              <Input value={cycleForm.name} onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Q2 2026 Performance Review" />
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Type</Label>
              <Select value={cycleForm.cycle_type} onValueChange={v => setCycleForm(p => ({ ...p, cycle_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CYCLE_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="kd-label">Period start *</Label>
                <Input type="date" value={cycleForm.period_start} onChange={e => setCycleForm(p => ({ ...p, period_start: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="kd-label">Period end *</Label>
                <Input type="date" value={cycleForm.period_end} onChange={e => setCycleForm(p => ({ ...p, period_end: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Submission due date *</Label>
              <Input type="date" value={cycleForm.due_date} onChange={e => setCycleForm(p => ({ ...p, due_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCycleDialog(false)}>Cancel</Button>
            <Button onClick={saveCycle} disabled={savingCycle}>{savingCycle ? 'Creating…' : 'Create cycle'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / edit review dialog */}
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReview ? 'Edit Review' : 'Add Review'}</DialogTitle>
            <DialogDescription>Rate the employee on each competency (1 = needs improvement, 5 = exceptional).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="kd-label">Employee *</Label>
                <Select value={reviewForm.employee_id || undefined} onValueChange={v => setReviewForm(p => ({ ...p, employee_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="kd-label">Review type</Label>
                <Select value={reviewForm.review_type} onValueChange={v => setReviewForm(p => ({ ...p, review_type: v as 'manager'|'self'|'peer' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager review</SelectItem>
                    <SelectItem value="self">Self-assessment</SelectItem>
                    <SelectItem value="peer">Peer review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Reviewer *</Label>
              <Select value={reviewForm.reviewer_id || undefined} onValueChange={v => setReviewForm(p => ({ ...p, reviewer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="kd-label">Competency ratings</Label>
              {COMPETENCIES.map(c => (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground w-40 shrink-0">{c.label}</span>
                  <StarRating value={reviewForm.ratings[c.key] ?? 0} onChange={v => setReviewForm(p => ({ ...p, ratings: { ...p.ratings, [c.key]: v } }))} />
                </div>
              ))}
              {avgRating(reviewForm.ratings) > 0 && (
                <p className="text-xs text-muted-foreground">Overall (average): <strong>{avgRating(reviewForm.ratings).toFixed(1)} / 5</strong></p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="kd-label">Strengths</Label>
              <Textarea rows={2} value={reviewForm.strengths} onChange={e => setReviewForm(p => ({ ...p, strengths: e.target.value }))} placeholder="What does this person do particularly well?" />
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Areas for growth</Label>
              <Textarea rows={2} value={reviewForm.areas_for_growth} onChange={e => setReviewForm(p => ({ ...p, areas_for_growth: e.target.value }))} placeholder="Where can they improve?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(false)}>Cancel</Button>
            <Button onClick={saveReview} disabled={savingReview}>{savingReview ? 'Saving…' : editingReview ? 'Update' : 'Save review'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New / edit development plan dialog */}
      <Dialog open={planDialog} onOpenChange={setPlanDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Development Plan' : 'New Development Plan'}</DialogTitle>
            <DialogDescription>Track a growth goal, skill, or action item for an employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="kd-label">Employee *</Label>
              <Select value={planForm.employee_id || undefined} onValueChange={v => setPlanForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Title *</Label>
              <Input value={planForm.title} onChange={e => setPlanForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Lead a client-facing project" />
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Description</Label>
              <Textarea rows={2} value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))} placeholder="What does success look like?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="kd-label">Category</Label>
                <Select value={planForm.category} onValueChange={v => setPlanForm(p => ({ ...p, category: v as PlanCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLAN_CATEGORY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="kd-label">Target date</Label>
                <Input type="date" value={planForm.target_date} onChange={e => setPlanForm(p => ({ ...p, target_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Link to review (optional)</Label>
              <Select value={planForm.review_id} onValueChange={v => setPlanForm(p => ({ ...p, review_id: v }))}>
                <SelectTrigger><SelectValue placeholder="No linked review" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked review</SelectItem>
                  {reviews.filter(r => r.employee_id === planForm.employee_id).map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {cycles.find(c => c.id === r.cycle_id)?.name ?? 'Review'} · {r.review_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Status</Label>
              <Select
                value={planForm.status}
                onValueChange={v => setPlanForm(p => ({
                  ...p, status: v as PlanStatus,
                  progress: v === 'completed' ? 100 : p.progress,
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAN_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="kd-label">Progress</Label>
                <span className="text-xs font-medium tabular-nums">{planForm.progress}%</span>
              </div>
              <Slider
                value={[planForm.progress]}
                max={100} step={5}
                disabled={planForm.status === 'completed'}
                onValueChange={([v]) => setPlanForm(p => ({ ...p, progress: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(false)}>Cancel</Button>
            <Button onClick={savePlan} disabled={savingPlan}>{savingPlan ? 'Saving…' : editingPlan ? 'Update plan' : 'Save plan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
