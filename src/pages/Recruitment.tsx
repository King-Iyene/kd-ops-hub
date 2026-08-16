import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, UserPlus2,
  Briefcase, Users, ChevronDown, ChevronUp, Calendar,
  CheckCircle2, XCircle, ArrowRight, Sparkles, Link2,
} from 'lucide-react';
import HireApplicantDialog from '@/components/hr/HireApplicantDialog';
import OfferLetterDialog from '@/components/hr/OfferLetterDialog';
import { FileSignature } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';

type EmpType = 'full_time' | 'part_time' | 'contract' | 'intern';
type OpeningStatus = 'draft' | 'published' | 'closed' | 'filled';
type ApplicantStage = 'new' | 'screening' | 'interview_1' | 'interview_2' | 'offer' | 'hired' | 'rejected';
type ApplicantSource = 'job_board' | 'referral' | 'walk_in' | 'internal' | 'linkedin' | 'other';

const EMP_TYPE_LABEL: Record<EmpType, string> = {
  full_time: 'Full-Time', part_time: 'Part-Time', contract: 'Contract', intern: 'Intern',
};

const OPENING_STATUS_BADGE: Record<OpeningStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft:     { label: 'Draft',     variant: 'secondary' },
  published: { label: 'Published', variant: 'default' },
  closed:    { label: 'Closed',    variant: 'outline' },
  filled:    { label: 'Filled',    variant: 'outline' },
};

const STAGE_ORDER: ApplicantStage[] = ['new', 'screening', 'interview_1', 'interview_2', 'offer', 'hired', 'rejected'];

const STAGE_LABEL: Record<ApplicantStage, string> = {
  new: 'New', screening: 'Screening', interview_1: 'Interview 1',
  interview_2: 'Interview 2', offer: 'Offer', hired: 'Hired', rejected: 'Rejected',
};

const STAGE_BADGE: Record<ApplicantStage, { variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  new:         { variant: 'secondary' },
  screening:   { variant: 'outline' },
  interview_1: { variant: 'outline' },
  interview_2: { variant: 'outline' },
  offer:       { variant: 'default' },
  hired:       { variant: 'default' },
  rejected:    { variant: 'destructive' },
};

const SOURCE_LABEL: Record<ApplicantSource, string> = {
  job_board: 'Job Board', referral: 'Referral', walk_in: 'Walk-In',
  internal: 'Internal', linkedin: 'LinkedIn', other: 'Other',
};

interface JobOpening {
  id: string;
  title: string;
  department_id: string | null;
  description: string | null;
  requirements: string | null;
  employment_type: EmpType;
  location: string | null;
  salary_min_ngn: number | null;
  salary_max_ngn: number | null;
  opening_count: number;
  closing_date: string | null;
  status: OpeningStatus;
  notes: string | null;
  created_at: string;
}

interface JobApplicant {
  id: string;
  opening_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cv_url: string | null;
  cover_letter: string | null;
  source: ApplicantSource;
  stage: ApplicantStage;
  stage_notes: string | null;
  assigned_to: string | null;
  interview_date: string | null;
  offer_amount_ngn: number | null;
  offered_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface Department { id: string; name: string; }
interface Profile { id: string; full_name: string; }

const EMPTY_OPENING_FORM = {
  title: '',
  department_id: '__none__',
  description: '',
  requirements: '',
  employment_type: 'full_time' as EmpType,
  location: '',
  salary_min_ngn: '',
  salary_max_ngn: '',
  opening_count: '1',
  closing_date: '',
  status: 'draft' as OpeningStatus,
  notes: '',
};

const EMPTY_APPLICANT_FORM = {
  full_name: '',
  email: '',
  phone: '',
  cv_url: '',
  cover_letter: '',
  source: 'job_board' as ApplicantSource,
  stage: 'new' as ApplicantStage,
  stage_notes: '',
  assigned_to: '__none__',
  interview_date: '',
  offer_amount_ngn: '',
  rejection_reason: '',
};

export default function Recruitment() {
  usePageTitle('Recruitment');
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [applicants, setApplicants] = useState<JobApplicant[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OpeningStatus | 'all'>('all');
  const [expandedOpening, setExpandedOpening] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<ApplicantStage | 'all'>('all');

  // Opening dialog
  const [openingDialog, setOpeningDialog] = useState(false);
  const [editingOpening, setEditingOpening] = useState<JobOpening | null>(null);
  const [openingForm, setOpeningForm] = useState({ ...EMPTY_OPENING_FORM });
  const [savingOpening, setSavingOpening] = useState(false);
  const [deleteOpening, setDeleteOpening] = useState<JobOpening | null>(null);

  // Applicant dialog
  const [applicantDialog, setApplicantDialog] = useState(false);
  const [editingApplicant, setEditingApplicant] = useState<JobApplicant | null>(null);
  const [activeOpeningId, setActiveOpeningId] = useState<string | null>(null);
  const [applicantForm, setApplicantForm] = useState({ ...EMPTY_APPLICANT_FORM });
  const [savingApplicant, setSavingApplicant] = useState(false);
  const [deleteApplicant, setDeleteApplicant] = useState<JobApplicant | null>(null);

  // Hire flow
  const [hiring, setHiring] = useState<{ applicant: JobApplicant; opening: JobOpening } | null>(null);
  const [issuingOffer, setIssuingOffer] = useState<{ applicant: JobApplicant; opening: JobOpening } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: oData }, { data: aData }, { data: dData }, { data: pData }] = await Promise.all([
      supabase.from('job_openings').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('job_applicants').select('*').order('created_at', { ascending: false }),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('profiles_directory').select('id, full_name').order('full_name'),
    ]);
    setOpenings(oData ?? []);
    setApplicants(aData ?? []);
    setDepartments(dData ?? []);
    setProfiles(pData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Opening CRUD ────────────────────────────────────────────────────────────

  function openCreateOpening() {
    setEditingOpening(null);
    setOpeningForm({ ...EMPTY_OPENING_FORM });
    setOpeningDialog(true);
  }

  function openEditOpening(o: JobOpening) {
    setEditingOpening(o);
    setOpeningForm({
      title: o.title,
      department_id: o.department_id ?? '__none__',
      description: o.description ?? '',
      requirements: o.requirements ?? '',
      employment_type: o.employment_type,
      location: o.location ?? '',
      salary_min_ngn: o.salary_min_ngn != null ? String(o.salary_min_ngn) : '',
      salary_max_ngn: o.salary_max_ngn != null ? String(o.salary_max_ngn) : '',
      opening_count: String(o.opening_count),
      closing_date: o.closing_date ?? '',
      status: o.status,
      notes: o.notes ?? '',
    });
    setOpeningDialog(true);
  }

  async function handleSaveOpening() {
    if (!openingForm.title.trim()) {
      toast({ title: 'Job title is required', variant: 'destructive' }); return;
    }
    setSavingOpening(true);
    const payload = {
      title: openingForm.title.trim(),
      department_id: openingForm.department_id !== '__none__' ? openingForm.department_id : null,
      description: openingForm.description.trim() || null,
      requirements: openingForm.requirements.trim() || null,
      employment_type: openingForm.employment_type,
      location: openingForm.location.trim() || null,
      salary_min_ngn: openingForm.salary_min_ngn !== '' ? parseFloat(openingForm.salary_min_ngn) : null,
      salary_max_ngn: openingForm.salary_max_ngn !== '' ? parseFloat(openingForm.salary_max_ngn) : null,
      opening_count: parseInt(openingForm.opening_count) || 1,
      closing_date: openingForm.closing_date || null,
      status: openingForm.status,
      notes: openingForm.notes.trim() || null,
      created_by: user?.id,
    };
    const { error } = editingOpening
      ? await supabase.from('job_openings').update(payload).eq('id', editingOpening.id)
      : await supabase.from('job_openings').insert(payload);
    setSavingOpening(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingOpening ? 'Opening updated' : 'Job opening created' });
    setOpeningDialog(false);
    load();
  }

  async function handleDeleteOpening() {
    if (!deleteOpening) return;
    const { error } = await supabase.from('job_openings')
      .update({ deleted_at: new Date().toISOString() }).eq('id', deleteOpening.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Opening removed' }); load(); }
    setDeleteOpening(null);
  }

  // ── Applicant CRUD ──────────────────────────────────────────────────────────

  function openAddApplicant(openingId: string) {
    setEditingApplicant(null);
    setActiveOpeningId(openingId);
    setApplicantForm({ ...EMPTY_APPLICANT_FORM });
    setApplicantDialog(true);
  }

  function openEditApplicant(a: JobApplicant) {
    setEditingApplicant(a);
    setActiveOpeningId(a.opening_id);
    setApplicantForm({
      full_name: a.full_name,
      email: a.email ?? '',
      phone: a.phone ?? '',
      cv_url: a.cv_url ?? '',
      cover_letter: a.cover_letter ?? '',
      source: a.source,
      stage: a.stage,
      stage_notes: a.stage_notes ?? '',
      assigned_to: a.assigned_to ?? '__none__',
      interview_date: a.interview_date ? a.interview_date.slice(0, 16) : '',
      offer_amount_ngn: a.offer_amount_ngn != null ? String(a.offer_amount_ngn) : '',
      rejection_reason: a.rejection_reason ?? '',
    });
    setApplicantDialog(true);
  }

  async function handleSaveApplicant() {
    if (!applicantForm.full_name.trim()) {
      toast({ title: 'Applicant name is required', variant: 'destructive' }); return;
    }
    if (!activeOpeningId) return;
    setSavingApplicant(true);
    const payload = {
      opening_id: activeOpeningId,
      full_name: applicantForm.full_name.trim(),
      email: applicantForm.email.trim() || null,
      phone: applicantForm.phone.trim() || null,
      cv_url: applicantForm.cv_url.trim() || null,
      cover_letter: applicantForm.cover_letter.trim() || null,
      source: applicantForm.source,
      stage: applicantForm.stage,
      stage_notes: applicantForm.stage_notes.trim() || null,
      assigned_to: applicantForm.assigned_to !== '__none__' ? applicantForm.assigned_to : null,
      interview_date: applicantForm.interview_date || null,
      offer_amount_ngn: applicantForm.offer_amount_ngn !== '' ? parseFloat(applicantForm.offer_amount_ngn) : null,
      offered_at: applicantForm.stage === 'offer' || applicantForm.stage === 'hired' ? (editingApplicant?.offered_at ?? new Date().toISOString()) : null,
      rejection_reason: applicantForm.rejection_reason.trim() || null,
      created_by: user?.id,
    };
    const { error } = editingApplicant
      ? await supabase.from('job_applicants').update(payload).eq('id', editingApplicant.id)
      : await supabase.from('job_applicants').insert(payload);
    setSavingApplicant(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingApplicant ? 'Applicant updated' : 'Applicant added' });
    setApplicantDialog(false);
    load();
  }

  async function handleDeleteApplicant() {
    if (!deleteApplicant) return;
    const { error } = await supabase.from('job_applicants').delete().eq('id', deleteApplicant.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Applicant removed' }); load(); }
    setDeleteApplicant(null);
  }

  const filteredOpenings = openings.filter(o => {
    const term = search.toLowerCase();
    const matchSearch = !term || o.title.toLowerCase().includes(term) || (o.location ?? '').toLowerCase().includes(term);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  function exportCSV() {
    const rows: string[] = [];
    for (const o of filteredOpenings) {
      const dept = departments.find(d => d.id === o.department_id);
      const oApps = applicants.filter(a => a.opening_id === o.id);
      rows.push([
        o.title, dept?.name ?? '', EMP_TYPE_LABEL[o.employment_type],
        o.status, o.opening_count, oApps.length,
        oApps.filter(a => a.stage === 'hired').length,
        o.closing_date ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }
    const csv = ['Title,Department,Type,Status,Openings,Applicants,Hired,Closing Date', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'recruitment.csv'; a.click();
  }

  const deptName = (id: string | null) => departments.find(d => d.id === id)?.name ?? '—';
  const profileName = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '—') : '—';

  const totalPublished = openings.filter(o => o.status === 'published').length;
  const totalApplicants = applicants.length;
  const totalHired = applicants.filter(a => a.stage === 'hired').length;
  const totalOffers = applicants.filter(a => a.stage === 'offer').length;

  const avgTimeToHire = (() => {
    const hired = applicants.filter(a => a.stage === 'hired' && (a as any).updated_at);
    if (hired.length === 0) return null;
    const totalDays = hired.reduce((s, a) => {
      const created = new Date(a.created_at).getTime();
      const updated = new Date((a as any).updated_at).getTime();
      return s + Math.max(0, (updated - created) / 86400000);
    }, 0);
    return Math.round(totalDays / hired.length);
  })();

  const pipelineFunnel = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STAGE_ORDER) counts[s] = 0;
    for (const a of applicants) counts[a.stage] = (counts[a.stage] || 0) + 1;
    return STAGE_ORDER.filter(s => s !== 'rejected').map(s => ({
      stage: STAGE_LABEL[s],
      count: counts[s] || 0,
    }));
  }, [applicants]);

  const sourceBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of applicants) {
      const src = (a as any).source || 'other';
      counts[src] = (counts[src] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([src, count]) => ({ source: SOURCE_LABEL[src as ApplicantSource] || src, count }))
      .sort((a, b) => b.count - a.count);
  }, [applicants]);

  const rejectionRate = totalApplicants > 0
    ? Math.round((applicants.filter(a => a.stage === 'rejected').length / totalApplicants) * 100)
    : 0;
  const conversionRate = totalApplicants > 0
    ? Math.round((totalHired / totalApplicants) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment"
        description="Manage job openings, applicants, and hiring pipeline"
        actions={
          <Button onClick={openCreateOpening} className="gap-2">
            <Plus className="h-4 w-4" /> New Opening
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="kd-stat-grid">
        {([
          { label: 'Active Openings', value: totalPublished, icon: Briefcase, tone: 'primary' },
          { label: 'Total Applicants', value: totalApplicants, icon: Users, tone: 'default' },
          { label: 'Offers Out', value: totalOffers, icon: ArrowRight, tone: 'warning' },
          { label: 'Hired', value: totalHired, icon: CheckCircle2, tone: 'success' },
        ] as { label: string; value: number; icon: typeof Briefcase; tone: 'primary' | 'default' | 'warning' | 'success' }[]).map(({ label, value, icon, tone }) => (
          <StatCard key={label} title={label} value={value} icon={icon} tone={tone} />
        ))}
        {avgTimeToHire !== null && (
          <StatCard title="Avg time to hire" value={`${avgTimeToHire}d`} icon={Calendar} tone="info" subtitle="ISO 30414" />
        )}
      </div>

      {/* Recruitment Analytics */}
      {totalApplicants > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />Pipeline Funnel
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {pipelineFunnel.map(s => {
                const pct = totalApplicants > 0 ? Math.round((s.count / totalApplicants) * 100) : 0;
                return (
                  <div key={s.stage} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{s.stage}</span>
                    <Progress value={pct} className="flex-1 h-2" />
                    <span className="text-xs font-medium w-12 text-right">{s.count} ({pct}%)</span>
                  </div>
                );
              })}
              <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                <span>Conversion rate: <strong className="text-foreground">{conversionRate}%</strong></span>
                <span>Rejection rate: <strong className="text-foreground">{rejectionRate}%</strong></span>
              </div>
            </CardContent>
          </Card>
          {sourceBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />Source Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {sourceBreakdown.map(s => {
                  const pct = totalApplicants > 0 ? Math.round((s.count / totalApplicants) * 100) : 0;
                  return (
                    <div key={s.source} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{s.source}</span>
                      <Progress value={pct} className="flex-1 h-2" />
                      <span className="text-xs font-medium w-12 text-right">{s.count} ({pct}%)</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search job title, location…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as OpeningStatus | 'all')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="filled">Filled</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* Openings list */}
      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : filteredOpenings.length === 0 ? (
        <EmptyState
          icon={UserPlus2}
          title="No job openings found"
          description="Create a job opening to start building your hiring pipeline."
          action={
            <Button className="gap-2" onClick={openCreateOpening}><Plus className="h-4 w-4" /> New Opening</Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredOpenings.map(opening => {
            const oApps = applicants.filter(a => a.opening_id === opening.id);
            const isExpanded = expandedOpening === opening.id;
            const sb = OPENING_STATUS_BADGE[opening.status];
            const hiredCount = oApps.filter(a => a.stage === 'hired').length;

            const filteredApps = oApps.filter(a => stageFilter === 'all' || a.stage === stageFilter);

            return (
              <Card key={opening.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{opening.title}</CardTitle>
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                        <Badge variant="outline">{EMP_TYPE_LABEL[opening.employment_type]}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {opening.department_id && <span>{deptName(opening.department_id)}</span>}
                        {opening.location && <span>{opening.location}</span>}
                        {opening.closing_date && <span>Closes {format(parseISO(opening.closing_date), 'dd MMM yyyy')}</span>}
                        <span>{opening.opening_count} seat{opening.opening_count !== 1 ? 's' : ''}</span>
                        <span>{oApps.length} applicant{oApps.length !== 1 ? 's' : ''}</span>
                        {hiredCount > 0 && <span className="text-success font-medium">{hiredCount} hired</span>}
                      </div>
                      {(opening.salary_min_ngn || opening.salary_max_ngn) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ₦{(opening.salary_min_ngn ?? 0).toLocaleString()} – ₦{(opening.salary_max_ngn ?? 0).toLocaleString()} /yr
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {opening.status === 'published' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Copy public link"
                          title="Copy the public apply link for this opening"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/careers?opening=${opening.id}`);
                            toast({ title: 'Public link copied' });
                          }}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => openEditOpening(opening)} aria-label="Edit opening"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteOpening(opening)} aria-label="Remove opening"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setExpandedOpening(isExpanded ? null : opening.id)} aria-label={isExpanded ? 'Collapse opening' : 'Expand opening'}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-4">
                    {/* Pipeline stage counts */}
                    <div className="flex flex-wrap gap-2">
                      {STAGE_ORDER.map(stage => {
                        const count = oApps.filter(a => a.stage === stage).length;
                        return (
                          <button
                            key={stage}
                            onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
                            className={`text-xs px-2.5 py-1 rounded-lg border kd-transition ${stageFilter === stage ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}
                          >
                            {STAGE_LABEL[stage]} ({count})
                          </button>
                        );
                      })}
                    </div>

                    {/* Applicants */}
                    {filteredApps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No applicants{stageFilter !== 'all' ? ` in ${STAGE_LABEL[stageFilter as ApplicantStage]} stage` : ' yet'}.</p>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {filteredApps.map(app => {
                          const stageBadge = STAGE_BADGE[app.stage];
                          return (
                            <div key={app.id} className="py-2 flex items-center justify-between gap-3 group">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{app.full_name}</span>
                                  <Badge variant={stageBadge.variant} className="text-xs">{STAGE_LABEL[app.stage]}</Badge>
                                  <span className="text-xs text-muted-foreground">{SOURCE_LABEL[app.source]}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                                  {app.email && <span>{app.email}</span>}
                                  {app.phone && <span>{app.phone}</span>}
                                  {app.assigned_to && <span>→ {profileName(app.assigned_to)}</span>}
                                  {app.interview_date && <span><Calendar className="h-3 w-3 inline mr-0.5" />{format(parseISO(app.interview_date), 'dd MMM HH:mm')}</span>}
                                  {app.offer_amount_ngn != null && app.stage !== 'rejected' && (
                                    <span>Offer: ₦{app.offer_amount_ngn.toLocaleString()}/yr</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {app.stage === 'offer' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => setIssuingOffer({ applicant: app, opening })}
                                    title="Generate & sign offer letter"
                                  >
                                    <FileSignature className="h-3.5 w-3.5 mr-1" /> Offer
                                  </Button>
                                )}
                                {(app.stage === 'offer' || app.stage === 'interview_2') && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                                    onClick={() => setHiring({ applicant: app, opening })}
                                  >
                                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Hire
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => openEditApplicant(app)} aria-label="Edit applicant"><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteApplicant(app)} aria-label="Remove applicant"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Button size="sm" variant="outline" className="gap-2" onClick={() => openAddApplicant(opening.id)}>
                      <Plus className="h-3 w-3" /> Add Applicant
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Opening dialog */}
      <Dialog open={openingDialog} onOpenChange={setOpeningDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOpening ? 'Edit Job Opening' : 'New Job Opening'}</DialogTitle>
            <DialogDescription>Define the role, requirements, and hiring details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="kd-label">Job Title *</Label>
              <Input placeholder="e.g. Senior Software Engineer" value={openingForm.title} onChange={e => setOpeningForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Employment Type</Label>
                <Select value={openingForm.employment_type} onValueChange={v => setOpeningForm(f => ({ ...f, employment_type: v as EmpType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EMP_TYPE_LABEL) as EmpType[]).map(t => (
                      <SelectItem key={t} value={t}>{EMP_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Status</Label>
                <Select value={openingForm.status} onValueChange={v => setOpeningForm(f => ({ ...f, status: v as OpeningStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="filled">Filled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Department</Label>
                <Select value={openingForm.department_id} onValueChange={v => setOpeningForm(f => ({ ...f, department_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any / Not specified</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Location</Label>
                <Input placeholder="e.g. Lagos (Hybrid)" value={openingForm.location} onChange={e => setOpeningForm(f => ({ ...f, location: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Min Salary (₦/yr)</Label>
                <Input type="number" min="0" placeholder="0" value={openingForm.salary_min_ngn} onChange={e => setOpeningForm(f => ({ ...f, salary_min_ngn: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Max Salary (₦/yr)</Label>
                <Input type="number" min="0" placeholder="0" value={openingForm.salary_max_ngn} onChange={e => setOpeningForm(f => ({ ...f, salary_max_ngn: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Seats</Label>
                <Input type="number" min="1" value={openingForm.opening_count} onChange={e => setOpeningForm(f => ({ ...f, opening_count: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Closing Date</Label>
              <Input type="date" value={openingForm.closing_date} onChange={e => setOpeningForm(f => ({ ...f, closing_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Job Description</Label>
              <Textarea rows={3} placeholder="Role overview, responsibilities…" value={openingForm.description} onChange={e => setOpeningForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Requirements</Label>
              <Textarea rows={3} placeholder="Qualifications, experience, skills…" value={openingForm.requirements} onChange={e => setOpeningForm(f => ({ ...f, requirements: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Notes</Label>
              <Textarea rows={2} placeholder="Internal notes…" value={openingForm.notes} onChange={e => setOpeningForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveOpening} disabled={savingOpening}>{savingOpening ? 'Saving…' : editingOpening ? 'Save Changes' : 'Create Opening'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Applicant dialog */}
      <Dialog open={applicantDialog} onOpenChange={setApplicantDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingApplicant ? 'Edit Applicant' : 'Add Applicant'}</DialogTitle>
            <DialogDescription>Applicant details and pipeline stage</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="kd-label">Full Name *</Label>
              <Input placeholder="Applicant's full name" value={applicantForm.full_name} onChange={e => setApplicantForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Email</Label>
                <Input type="email" placeholder="email@example.com" value={applicantForm.email} onChange={e => setApplicantForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Phone</Label>
                <Input placeholder="+234 xxx xxxx" value={applicantForm.phone} onChange={e => setApplicantForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Source</Label>
                <Select value={applicantForm.source} onValueChange={v => setApplicantForm(f => ({ ...f, source: v as ApplicantSource }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOURCE_LABEL) as ApplicantSource[]).map(s => (
                      <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Pipeline Stage</Label>
                <Select value={applicantForm.stage} onValueChange={v => setApplicantForm(f => ({ ...f, stage: v as ApplicantStage }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGE_ORDER.map(s => (
                      <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Assigned Interviewer</Label>
                <Select value={applicantForm.assigned_to} onValueChange={v => setApplicantForm(f => ({ ...f, assigned_to: v }))}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Interview Date & Time</Label>
                <Input type="datetime-local" value={applicantForm.interview_date} onChange={e => setApplicantForm(f => ({ ...f, interview_date: e.target.value }))} />
              </div>
            </div>
            {(applicantForm.stage === 'offer' || applicantForm.stage === 'hired') && (
              <div className="space-y-1">
                <Label className="kd-label">Offer Amount (₦/yr)</Label>
                <Input type="number" min="0" placeholder="Annual salary offered" value={applicantForm.offer_amount_ngn} onChange={e => setApplicantForm(f => ({ ...f, offer_amount_ngn: e.target.value }))} />
              </div>
            )}
            {applicantForm.stage === 'rejected' && (
              <div className="space-y-1">
                <Label className="kd-label">Rejection Reason</Label>
                <Input placeholder="Brief reason for rejection" value={applicantForm.rejection_reason} onChange={e => setApplicantForm(f => ({ ...f, rejection_reason: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="kd-label">CV / Portfolio URL</Label>
              <Input placeholder="https://…" value={applicantForm.cv_url} onChange={e => setApplicantForm(f => ({ ...f, cv_url: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Stage Notes</Label>
              <Textarea rows={3} placeholder="Interview feedback, assessments…" value={applicantForm.stage_notes} onChange={e => setApplicantForm(f => ({ ...f, stage_notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplicantDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveApplicant} disabled={savingApplicant}>{savingApplicant ? 'Saving…' : editingApplicant ? 'Save Changes' : 'Add Applicant'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete opening */}
      <AlertDialog open={!!deleteOpening} onOpenChange={o => !o && setDeleteOpening(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove job opening?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteOpening?.title}" and all its applicants will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOpening}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete applicant */}
      <AlertDialog open={!!deleteApplicant} onOpenChange={o => !o && setDeleteApplicant(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove applicant?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteApplicant?.full_name}'s application will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteApplicant}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HireApplicantDialog
        open={!!hiring}
        onOpenChange={(v) => { if (!v) setHiring(null); }}
        applicant={hiring?.applicant ?? null}
        opening={hiring?.opening ?? null}
        departments={departments}
        onHired={() => {
          setHiring(null);
          load();
        }}
      />

      <OfferLetterDialog
        open={!!issuingOffer}
        onOpenChange={(v) => { if (!v) setIssuingOffer(null); }}
        applicant={issuingOffer?.applicant ?? null}
        opening={issuingOffer?.opening ?? null}
        departments={departments}
        startDate={new Date().toISOString().slice(0, 10)}
        monthlySalary={
          issuingOffer?.applicant?.offer_amount_ngn
            ? String(Math.round(issuingOffer.applicant.offer_amount_ngn / 12))
            : ''
        }
        onSigned={() => {
          setIssuingOffer(null);
          load();
        }}
      />
    </div>
  );
}
