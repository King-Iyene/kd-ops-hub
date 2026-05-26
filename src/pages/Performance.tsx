import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Star, ChevronDown, ChevronUp, CheckCircle2, Clock,
  AlertCircle, Users, BarChart3, Send, ThumbsUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, isPast, parseISO } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

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
  const [loading, setLoading] = useState(true);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);

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
    const [{ data: cData }, { data: rData }, { data: pData }] = await Promise.all([
      supabase.from('review_cycles').select('*').order('due_date', { ascending: false }).limit(50),
      supabase.from('performance_reviews').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('profiles').select('id, full_name').neq('is_anonymised', true).limit(200),
    ]);
    setCycles((cData as ReviewCycle[]) || []);
    setReviews((rData as Review[]) || []);
    setProfiles((pData as Profile[]) || []);
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

  const nameOf = (id: string) => profiles.find(p => p.id === id)?.full_name ?? 'Unknown';

  const activeCycles = cycles.filter(c => c.status === 'active').length;
  const totalReviews = reviews.length;
  const submitted = reviews.filter(r => r.status !== 'draft').length;
  const avgOverall = reviews.filter(r => r.overall_rating).length
    ? reviews.filter(r => r.overall_rating).reduce((s, r) => s + (r.overall_rating ?? 0), 0) / reviews.filter(r => r.overall_rating).length
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Performance Reviews"
        description="Manage review cycles, competency ratings, and development plans."
        actions={<Button onClick={openCycleDialog}><Plus className="h-4 w-4 mr-2" />New Cycle</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active cycles', value: activeCycles, icon: BarChart3, color: 'text-primary' },
          { label: 'Total reviews', value: totalReviews, icon: Users, color: 'text-muted-foreground' },
          { label: 'Submitted', value: submitted, icon: Send, color: 'text-green-600' },
          { label: 'Avg overall rating', value: avgOverall > 0 ? avgOverall.toFixed(1) + '/5' : '—', icon: Star, color: 'text-yellow-500' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
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
                          <div key={r.id} className="rounded-lg border p-3 space-y-2">
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
                                    <p className="font-semibold text-green-700 dark:text-green-400 mb-0.5">Strengths</p>
                                    <p className="text-muted-foreground leading-relaxed">{r.strengths}</p>
                                  </div>
                                )}
                                {r.areas_for_growth && (
                                  <div>
                                    <p className="font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Areas for growth</p>
                                    <p className="text-muted-foreground leading-relaxed">{r.areas_for_growth}</p>
                                  </div>
                                )}
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

      {/* New cycle dialog */}
      <Dialog open={cycleDialog} onOpenChange={setCycleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Review Cycle</DialogTitle>
            <DialogDescription>A cycle groups all reviews for a given period (e.g. Q2 2026).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Cycle name *</Label>
              <Input value={cycleForm.name} onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Q2 2026 Performance Review" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={cycleForm.cycle_type} onValueChange={v => setCycleForm(p => ({ ...p, cycle_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CYCLE_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period start *</Label>
                <Input type="date" value={cycleForm.period_start} onChange={e => setCycleForm(p => ({ ...p, period_start: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Period end *</Label>
                <Input type="date" value={cycleForm.period_end} onChange={e => setCycleForm(p => ({ ...p, period_end: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Submission due date *</Label>
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
                <Label>Employee *</Label>
                <Select value={reviewForm.employee_id} onValueChange={v => setReviewForm(p => ({ ...p, employee_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Review type</Label>
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
              <Label>Reviewer *</Label>
              <Select value={reviewForm.reviewer_id} onValueChange={v => setReviewForm(p => ({ ...p, reviewer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Competency ratings</Label>
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
              <Label>Strengths</Label>
              <Textarea rows={2} value={reviewForm.strengths} onChange={e => setReviewForm(p => ({ ...p, strengths: e.target.value }))} placeholder="What does this person do particularly well?" />
            </div>
            <div className="space-y-1.5">
              <Label>Areas for growth</Label>
              <Textarea rows={2} value={reviewForm.areas_for_growth} onChange={e => setReviewForm(p => ({ ...p, areas_for_growth: e.target.value }))} placeholder="Where can they improve?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(false)}>Cancel</Button>
            <Button onClick={saveReview} disabled={savingReview}>{savingReview ? 'Saving…' : editingReview ? 'Update' : 'Save review'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
