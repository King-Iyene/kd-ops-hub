import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Pencil, Trash2, ClipboardList, ChevronDown, ChevronUp,
  Search, Loader2, MessageSquare, BarChart3, CheckCircle2,
} from 'lucide-react';

interface Survey {
  id: string;
  title: string;
  description: string | null;
  survey_type: 'pulse' | 'engagement' | 'exit' | 'onboarding' | 'custom';
  status: 'draft' | 'active' | 'closed';
  is_anonymous: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
}

interface SurveyQuestion {
  id: string;
  survey_id: string;
  question_text: string;
  question_type: 'rating' | 'text' | 'choice' | 'enps';
  options: string[] | null;
  sort_order: number;
  is_required: boolean;
}

interface SurveyResponse {
  id: string;
  survey_id: string;
  question_id: string;
  respondent_id: string | null;
  answer_text: string | null;
  answer_rating: number | null;
  submitted_at: string;
}

const TYPE_BADGE: Record<Survey['survey_type'], { label: string; className: string }> = {
  pulse:       { label: 'Pulse',       className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800' },
  engagement:  { label: 'Engagement',  className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  exit:        { label: 'Exit',        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800' },
  onboarding:  { label: 'Onboarding',  className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800' },
  custom:      { label: 'Custom',      className: '' },
};

const STATUS_BADGE: Record<Survey['status'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft:  { label: 'Draft',  variant: 'secondary' },
  active: { label: 'Active', variant: 'default' },
  closed: { label: 'Closed', variant: 'outline' },
};

const SURVEY_TYPES: Survey['survey_type'][] = ['pulse', 'engagement', 'exit', 'onboarding', 'custom'];
const QUESTION_TYPES: SurveyQuestion['question_type'][] = ['rating', 'text', 'choice', 'enps'];

const EMPTY_SURVEY = {
  title: '', description: '', survey_type: 'pulse' as Survey['survey_type'],
  is_anonymous: true, starts_at: '', ends_at: '',
};

const EMPTY_QUESTION = {
  question_text: '', question_type: 'rating' as SurveyQuestion['question_type'],
  is_required: true, options: '' ,
};

const TAB_CLASS = "text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none";

export default function Surveys() {
  usePageTitle('Surveys');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [surveyForm, setSurveyForm] = useState({ ...EMPTY_SURVEY });
  const [saving, setSaving] = useState(false);

  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const [managingSurveyId, setManagingSurveyId] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState({ ...EMPTY_QUESTION });
  const [savingQuestion, setSavingQuestion] = useState(false);

  const [expandedSurveyId, setExpandedSurveyId] = useState<string | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, { text?: string; rating?: number }>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sData }, { data: qData }, { data: rData }] = await Promise.all([
      supabase.from('surveys').select('id, title, description, survey_type, status, is_anonymous, starts_at, ends_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('survey_questions').select('id, survey_id, question_text, question_type, options, sort_order, is_required').order('sort_order', { ascending: true }).limit(2000),
      supabase.from('survey_responses').select('id, survey_id, respondent_id').limit(5000),
    ]);
    setSurveys((sData as Survey[]) || []);
    setQuestions((qData as SurveyQuestion[]) || []);
    setResponses((rData as SurveyResponse[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const responseCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of responses) {
      const key = `${r.survey_id}:${r.respondent_id ?? r.id}`;
      if (!map[r.survey_id]) map[r.survey_id] = 0;
      if (!map[`_seen_${key}`]) {
        map[`_seen_${key}`] = 1;
      }
    }
    const counts: Record<string, number> = {};
    for (const s of surveys) {
      const respondents = new Set(
        responses.filter(r => r.survey_id === s.id).map(r => r.respondent_id ?? r.id)
      );
      counts[s.id] = respondents.size;
    }
    return counts;
  }, [surveys, responses]);

  const stats = useMemo(() => ({
    total: surveys.length,
    active: surveys.filter(s => s.status === 'active').length,
    closed: surveys.filter(s => s.status === 'closed').length,
    totalResponses: new Set(responses.map(r => `${r.survey_id}:${r.respondent_id ?? r.id}`)).size,
  }), [surveys, responses]);

  const filtered = useMemo(() => {
    if (!search) return surveys;
    const q = search.toLowerCase();
    return surveys.filter(s =>
      s.title.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
    );
  }, [surveys, search]);

  const activeSurveys = useMemo(() => surveys.filter(s => s.status === 'active'), [surveys]);

  const openCreateSurvey = () => {
    setEditingSurvey(null);
    setSurveyForm({ ...EMPTY_SURVEY });
    setSurveyDialogOpen(true);
  };

  const openEditSurvey = (s: Survey) => {
    setEditingSurvey(s);
    setSurveyForm({
      title: s.title,
      description: s.description ?? '',
      survey_type: s.survey_type,
      is_anonymous: s.is_anonymous,
      starts_at: s.starts_at ? format(parseISO(s.starts_at), "yyyy-MM-dd'T'HH:mm") : '',
      ends_at: s.ends_at ? format(parseISO(s.ends_at), "yyyy-MM-dd'T'HH:mm") : '',
    });
    setSurveyDialogOpen(true);
  };

  const saveSurvey = async () => {
    if (!surveyForm.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      title: surveyForm.title.trim(),
      description: surveyForm.description.trim() || null,
      survey_type: surveyForm.survey_type,
      is_anonymous: surveyForm.is_anonymous,
      starts_at: surveyForm.starts_at ? new Date(surveyForm.starts_at).toISOString() : null,
      ends_at: surveyForm.ends_at ? new Date(surveyForm.ends_at).toISOString() : null,
      created_by: profile?.id ?? null,
    };
    const { error } = editingSurvey
      ? await supabase.from('surveys').update(payload).eq('id', editingSurvey.id)
      : await supabase.from('surveys').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editingSurvey ? 'Survey updated' : 'Survey created' });
    setSurveyDialogOpen(false);
    load();
  };

  const deleteSurvey = async (id: string) => {
    const { error } = await supabase.from('surveys').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Survey deleted' });
    load();
  };

  const updateStatus = async (id: string, status: Survey['status']) => {
    const { error } = await supabase.from('surveys').update({ status }).eq('id', id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Survey ${status === 'active' ? 'activated' : status === 'closed' ? 'closed' : 'set to draft'}` });
    load();
  };

  const openManageQuestions = (surveyId: string) => {
    setManagingSurveyId(surveyId);
    setQuestionForm({ ...EMPTY_QUESTION });
    setQuestionsDialogOpen(true);
  };

  const addQuestion = async () => {
    if (!managingSurveyId || !questionForm.question_text.trim()) {
      toast({ title: 'Question text is required', variant: 'destructive' });
      return;
    }
    setSavingQuestion(true);
    const surveyQuestions = questions.filter(q => q.survey_id === managingSurveyId);
    const payload = {
      survey_id: managingSurveyId,
      question_text: questionForm.question_text.trim(),
      question_type: questionForm.question_type,
      is_required: questionForm.is_required,
      options: questionForm.question_type === 'choice' && questionForm.options.trim()
        ? questionForm.options.split(',').map(o => o.trim()).filter(Boolean)
        : null,
      sort_order: surveyQuestions.length,
    };
    const { error } = await supabase.from('survey_questions').insert(payload);
    setSavingQuestion(false);
    if (error) {
      toast({ title: 'Failed to add question', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Question added' });
    setQuestionForm({ ...EMPTY_QUESTION });
    load();
  };

  const deleteQuestion = async (id: string) => {
    const { error } = await supabase.from('survey_questions').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Question removed' });
    load();
  };

  const surveyQuestions = (surveyId: string) =>
    questions.filter(q => q.survey_id === surveyId).sort((a, b) => a.sort_order - b.sort_order);

  const setDraft = (questionId: string, field: 'text' | 'rating', value: string | number) => {
    setAnswerDrafts(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], [field]: value },
    }));
  };

  const submitResponses = async (surveyId: string) => {
    const qs = surveyQuestions(surveyId);
    const missing = qs.filter(q => q.is_required && !answerDrafts[q.id]?.text && answerDrafts[q.id]?.rating == null);
    if (missing.length > 0) {
      toast({ title: 'Please answer all required questions', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const rows = qs
      .filter(q => answerDrafts[q.id]?.text || answerDrafts[q.id]?.rating != null)
      .map(q => ({
        survey_id: surveyId,
        question_id: q.id,
        respondent_id: profile?.id ?? null,
        answer_text: answerDrafts[q.id]?.text ?? null,
        answer_rating: answerDrafts[q.id]?.rating ?? null,
      }));
    const { error } = await supabase.from('survey_responses').insert(rows);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Submission failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Responses submitted' });
    setAnswerDrafts({});
    setExpandedSurveyId(null);
    load();
  };

  const typeBadge = (type: Survey['survey_type']) => {
    const cfg = TYPE_BADGE[type];
    return type === 'custom'
      ? <Badge variant="secondary">{cfg.label}</Badge>
      : <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
  };

  const statusBadge = (status: Survey['status']) => {
    const cfg = STATUS_BADGE[status];
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Surveys"
        description="Employee pulse checks, engagement surveys, and feedback collection."
        icon={ClipboardList}
        actions={
          <Button size="sm" onClick={openCreateSurvey}>
            <Plus className="h-4 w-4 mr-2" />Create survey
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Surveys" value={stats.total} icon={ClipboardList} tone="primary" />
        <StatCard title="Active" value={stats.active} icon={CheckCircle2} tone="success" />
        <StatCard title="Closed" value={stats.closed} icon={BarChart3} tone="default" />
        <StatCard title="Total Responses" value={stats.totalResponses} icon={MessageSquare} tone="warning" />
      </div>

      <Tabs defaultValue="surveys">
        <TabsList className="bg-transparent border-b rounded-none w-full justify-start px-0">
          <TabsTrigger value="surveys" className={TAB_CLASS}>Surveys</TabsTrigger>
          <TabsTrigger value="respond" className={TAB_CLASS}>Respond</TabsTrigger>
        </TabsList>

        <TabsContent value="surveys" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search surveys..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No surveys found"
              description={search ? 'Try a different search term.' : 'Create your first survey to get started.'}
              action={!search && (
                <Button size="sm" onClick={openCreateSurvey}>
                  <Plus className="h-4 w-4 mr-2" />Create survey
                </Button>
              )}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Title</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Anonymous</th>
                    <th className="text-right p-3 font-medium">Responses</th>
                    <th className="text-left p-3 font-medium">Date Range</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{s.title}</td>
                      <td className="p-3">{typeBadge(s.survey_type)}</td>
                      <td className="p-3">{statusBadge(s.status)}</td>
                      <td className="p-3 text-muted-foreground">{s.is_anonymous ? 'Yes' : 'No'}</td>
                      <td className="p-3 text-right tabular-nums">{responseCounts[s.id] ?? 0}</td>
                      <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                        {s.starts_at ? format(parseISO(s.starts_at), 'dd MMM yyyy') : '—'}
                        {' — '}
                        {s.ends_at ? format(parseISO(s.ends_at), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openManageQuestions(s.id)}>
                            <ClipboardList className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSurvey(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {s.status === 'draft' && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => updateStatus(s.id, 'active')}>
                              Activate
                            </Button>
                          )}
                          {s.status === 'active' && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => updateStatus(s.id, 'closed')}>
                              Close
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSurvey(s.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="respond" className="space-y-4 mt-4">
          {loading ? (
            <TableSkeleton rows={3} cols={2} />
          ) : activeSurveys.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No active surveys"
              description="There are no surveys available for responses right now."
            />
          ) : (
            <div className="space-y-3">
              {activeSurveys.map(s => {
                const qs = surveyQuestions(s.id);
                const expanded = expandedSurveyId === s.id;
                return (
                  <Card key={s.id}>
                    <CardHeader
                      className="cursor-pointer"
                      onClick={() => setExpandedSurveyId(expanded ? null : s.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{s.title}</CardTitle>
                          {s.description && (
                            <p className="text-sm text-muted-foreground">{s.description}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            {typeBadge(s.survey_type)}
                            {s.is_anonymous && <Badge variant="outline" className="text-[10px]">Anonymous</Badge>}
                            <span className="text-xs text-muted-foreground">{qs.length} question{qs.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </CardHeader>
                    {expanded && (
                      <CardContent className="space-y-4 pt-0">
                        {qs.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No questions have been added to this survey yet.</p>
                        ) : (
                          <>
                            {qs.map((q, i) => (
                              <div key={q.id} className="space-y-2 p-3 rounded-lg border bg-muted/20">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium">
                                    {i + 1}. {q.question_text}
                                    {q.is_required && <span className="text-destructive ml-1">*</span>}
                                  </p>
                                  <Badge variant="outline" className="text-[10px] shrink-0">{q.question_type}</Badge>
                                </div>
                                {(q.question_type === 'rating' || q.question_type === 'enps') && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                      <input
                                        type="range"
                                        min={0}
                                        max={10}
                                        value={answerDrafts[q.id]?.rating ?? 5}
                                        onChange={e => setDraft(q.id, 'rating', Number(e.target.value))}
                                        className="flex-1 accent-primary"
                                      />
                                      <span className="text-sm font-semibold tabular-nums w-6 text-center">
                                        {answerDrafts[q.id]?.rating ?? 5}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                                      <span>0</span>
                                      <span>10</span>
                                    </div>
                                  </div>
                                )}
                                {q.question_type === 'text' && (
                                  <Textarea
                                    placeholder="Your answer..."
                                    value={answerDrafts[q.id]?.text ?? ''}
                                    onChange={e => setDraft(q.id, 'text', e.target.value)}
                                    rows={2}
                                  />
                                )}
                                {q.question_type === 'choice' && q.options && (
                                  <Select
                                    value={answerDrafts[q.id]?.text ?? ''}
                                    onValueChange={v => setDraft(q.id, 'text', v)}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Select an option" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(q.options as string[]).map(opt => (
                                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            ))}
                            <Button onClick={() => submitResponses(s.id)} disabled={submitting}>
                              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Submit responses
                            </Button>
                          </>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={surveyDialogOpen} onOpenChange={setSurveyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSurvey ? 'Edit Survey' : 'Create Survey'}</DialogTitle>
            <DialogDescription>
              {editingSurvey ? 'Update survey details.' : 'Set up a new survey for your team.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={surveyForm.title}
                onChange={e => setSurveyForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Q3 Pulse Check"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={surveyForm.description}
                onChange={e => setSurveyForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this survey..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={surveyForm.survey_type}
                  onValueChange={v => setSurveyForm(f => ({ ...f, survey_type: v as Survey['survey_type'] }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SURVEY_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{TYPE_BADGE[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Switch
                  id="anonymous"
                  checked={surveyForm.is_anonymous}
                  onCheckedChange={v => setSurveyForm(f => ({ ...f, is_anonymous: v }))}
                />
                <Label htmlFor="anonymous" className="text-sm">Anonymous</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Starts at</Label>
                <Input
                  type="datetime-local"
                  value={surveyForm.starts_at}
                  onChange={e => setSurveyForm(f => ({ ...f, starts_at: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ends at</Label>
                <Input
                  type="datetime-local"
                  value={surveyForm.ends_at}
                  onChange={e => setSurveyForm(f => ({ ...f, ends_at: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSurveyDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSurvey} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingSurvey ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={questionsDialogOpen} onOpenChange={setQuestionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Questions</DialogTitle>
            <DialogDescription>
              Add or remove questions for this survey.
            </DialogDescription>
          </DialogHeader>
          {managingSurveyId && (
            <div className="space-y-4">
              {surveyQuestions(managingSurveyId).length > 0 && (
                <div className="space-y-2">
                  {surveyQuestions(managingSurveyId).map((q, i) => (
                    <div key={q.id} className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {i + 1}. {q.question_text}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">{q.question_type}</Badge>
                          {q.is_required && <span className="text-[10px] text-destructive">Required</span>}
                          {q.options && (
                            <span className="text-[10px] text-muted-foreground">
                              {(q.options as string[]).length} options
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive shrink-0"
                        onClick={() => deleteQuestion(q.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Add question</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Question text</Label>
                    <Input
                      value={questionForm.question_text}
                      onChange={e => setQuestionForm(f => ({ ...f, question_text: e.target.value }))}
                      placeholder="How satisfied are you with..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Select
                        value={questionForm.question_type}
                        onValueChange={v => setQuestionForm(f => ({ ...f, question_type: v as SurveyQuestion['question_type'] }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUESTION_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2 pb-0.5">
                      <Switch
                        id="required"
                        checked={questionForm.is_required}
                        onCheckedChange={v => setQuestionForm(f => ({ ...f, is_required: v }))}
                      />
                      <Label htmlFor="required" className="text-sm">Required</Label>
                    </div>
                  </div>
                  {questionForm.question_type === 'choice' && (
                    <div className="space-y-1.5">
                      <Label>Options (comma-separated)</Label>
                      <Input
                        value={questionForm.options}
                        onChange={e => setQuestionForm(f => ({ ...f, options: e.target.value }))}
                        placeholder="Strongly agree, Agree, Neutral, Disagree"
                      />
                    </div>
                  )}
                  <Button size="sm" onClick={addQuestion} disabled={savingQuestion}>
                    {savingQuestion && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Plus className="h-4 w-4 mr-1.5" />Add question
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
