import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, FolderKanban,
  CheckCircle2, Clock, PauseCircle, XCircle, ChevronDown,
  ChevronUp, Flag, Link as LinkIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira } from '@/lib/format';
import { format, parseISO, isPast } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
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

const STATUS_META: Record<string, { label: string; icon: React.ElementType; color: string; variant: 'default'|'secondary'|'outline'|'destructive' }> = {
  planning:  { label: 'Planning',   icon: Clock,       color: 'text-blue-500',  variant: 'outline' },
  active:    { label: 'Active',     icon: FolderKanban,color: 'text-green-600', variant: 'default' },
  on_hold:   { label: 'On Hold',    icon: PauseCircle, color: 'text-warning',   variant: 'outline' },
  completed: { label: 'Completed',  icon: CheckCircle2,color: 'text-green-600', variant: 'outline' },
  cancelled: { label: 'Cancelled',  icon: XCircle,     color: 'text-muted-foreground', variant: 'secondary' },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'text-destructive' },
  high:     { label: 'High',     color: 'text-warning' },
  normal:   { label: 'Normal',   color: 'text-muted-foreground' },
  low:      { label: 'Low',      color: 'text-muted-foreground/60' },
};

interface Project {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
  owner_id: string | null;
  department_id: string | null;
  status: string;
  priority: string;
  budget_ngn: number | null;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Milestone {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: 'pending' | 'complete';
  completed_at: string | null;
  sort_order: number;
}

interface Task { id: string; title: string; status: string; project_id: string | null; }
interface Client { id: string; name: string; }
interface Profile { id: string; full_name: string; }
interface Department { id: string; name: string; }

const EMPTY_FORM = {
  name: '', description: '', client_id: '__none__', owner_id: '__none__',
  department_id: '__none__', status: 'planning', priority: 'normal',
  budget_ngn: '', start_date: '', end_date: '', notes: '',
};

export default function Projects() {
  usePageTitle('Projects');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const [msDialog, setMsDialog] = useState(false);
  const [msProjectId, setMsProjectId] = useState('');
  const [msTitle, setMsTitle] = useState('');
  const [msDueDate, setMsDueDate] = useState('');
  const [savingMs, setSavingMs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: pData }, { data: mData }, { data: tData }, { data: cData }, { data: prData }, { data: dData }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('project_milestones').select('*').order('sort_order').limit(1000),
      supabase.from('tasks').select('id, title, status, project_id').limit(1000),
      supabase.from('clients').select('id, name').order('name').limit(200),
      supabase.from('profiles').select('id, full_name').limit(200),
      supabase.from('departments').select('id, name').order('name').limit(100),
    ]);
    setProjects((pData as Project[]) || []);
    setMilestones((mData as Milestone[]) || []);
    setTasks((tData as Task[]) || []);
    setClients((cData as Client[]) || []);
    setProfiles((prData as Profile[]) || []);
    setDepartments((dData as Department[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? 'Unknown') : '—';
  const clientOf = (id: string | null) => id ? (clients.find(c => c.id === id)?.name ?? '—') : '—';
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, owner_id: profile?.id ?? '__none__' });
    setDialogOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? '', client_id: p.client_id ?? '__none__',
      owner_id: p.owner_id ?? '__none__', department_id: p.department_id ?? '__none__',
      status: p.status, priority: p.priority, budget_ngn: p.budget_ngn != null ? String(p.budget_ngn) : '',
      start_date: p.start_date ?? '', end_date: p.end_date ?? '', notes: p.notes ?? '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Project name is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null,
      client_id: form.client_id !== '__none__' ? form.client_id : null,
      owner_id: form.owner_id !== '__none__' ? form.owner_id : null,
      department_id: form.department_id !== '__none__' ? form.department_id : null,
      status: form.status, priority: form.priority,
      budget_ngn: form.budget_ngn ? Number(form.budget_ngn) : null,
      start_date: form.start_date || null, end_date: form.end_date || null,
      notes: form.notes.trim() || null, created_by: profile?.id,
      completed_at: form.status === 'completed' && editing?.status !== 'completed' ? new Date().toISOString() : (editing?.completed_at ?? null),
    };
    const { error } = editing
      ? await supabase.from('projects').update(payload).eq('id', editing.id)
      : await supabase.from('projects').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Project updated' : 'Project created' });
    setDialogOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', deleteTarget.id);
    toast({ title: 'Project removed' });
    setDeleteTarget(null);
    load();
  };

  const addMilestone = async () => {
    if (!msTitle.trim()) return;
    setSavingMs(true);
    const existing = milestones.filter(m => m.project_id === msProjectId);
    await supabase.from('project_milestones').insert({
      project_id: msProjectId, title: msTitle.trim(),
      due_date: msDueDate || null, sort_order: existing.length,
    });
    setSavingMs(false);
    setMsTitle(''); setMsDueDate('');
    toast({ title: 'Milestone added' });
    load();
  };

  const toggleMilestone = async (ms: Milestone) => {
    const done = ms.status === 'pending';
    await supabase.from('project_milestones').update({
      status: done ? 'complete' : 'pending',
      completed_at: done ? new Date().toISOString() : null,
    }).eq('id', ms.id);
    load();
  };

  const deleteMilestone = async (id: string) => {
    await supabase.from('project_milestones').delete().eq('id', id);
    load();
  };

  const exportCSV = () => {
    const header = 'Name,Client,Owner,Status,Priority,Budget,Start,End,Milestones,Tasks';
    const rows = filtered.map(p => {
      const ms = milestones.filter(m => m.project_id === p.id).length;
      const ts = tasks.filter(t => t.project_id === p.id).length;
      return [p.name, clientOf(p.client_id), nameOf(p.owner_id), p.status, p.priority,
        p.budget_ngn ?? '', p.start_date ?? '', p.end_date ?? '', ms, ts]
        .map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `projects-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
  };

  const filtered = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || clientOf(p.client_id).toLowerCase().includes(q) || nameOf(p.owner_id).toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    active:    projects.filter(p => p.status === 'active').length,
    planning:  projects.filter(p => p.status === 'planning').length,
    completed: projects.filter(p => p.status === 'completed').length,
    overdue:   projects.filter(p => p.status === 'active' && p.end_date && isPast(parseISO(p.end_date))).length,
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="Projects"
        description="Track client and internal projects with milestones and tasks."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export</Button>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />New Project</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active',    value: stats.active,    color: 'text-green-600' },
          { label: 'Planning',  value: stats.planning,  color: 'text-blue-500' },
          { label: 'Completed', value: stats.completed, color: 'text-muted-foreground' },
          { label: 'Overdue',   value: stats.overdue,   color: 'text-destructive' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[['active','Active'],['planning','Planning'],['on_hold','On Hold'],['completed','Completed'],['cancelled','Cancelled'],['all','All']].map(([v,l]) => (
            <Button key={v} size="sm" variant={statusFilter === v ? 'default' : 'outline'} onClick={() => setStatusFilter(v)}>{l}</Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No projects found. Create your first project above.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(project => {
            const pMilestones = milestones.filter(m => m.project_id === project.id);
            const doneMilestones = pMilestones.filter(m => m.status === 'complete').length;
            const pTasks = tasks.filter(t => t.project_id === project.id);
            const doneTasks = pTasks.filter(t => t.status === 'complete').length;
            const msProgress = pMilestones.length > 0 ? (doneMilestones / pMilestones.length) * 100 : 0;
            const isExpanded = expandedProject === project.id;
            const isOverdue = project.status === 'active' && project.end_date && isPast(parseISO(project.end_date));
            const SM = STATUS_META[project.status];

            return (
              <Card key={project.id} className={project.status === 'cancelled' ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{project.name}</CardTitle>
                        <Badge variant={SM.variant} className="text-[10px]">{SM.label}</Badge>
                        {project.priority !== 'normal' && (
                          <span className={`flex items-center gap-0.5 text-[10px] font-medium ${PRIORITY_META[project.priority].color}`}>
                            <Flag className="h-3 w-3" />{PRIORITY_META[project.priority].label}
                          </span>
                        )}
                        {isOverdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {project.client_id && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <LinkIcon className="h-3 w-3" />{clientOf(project.client_id)}
                          </span>
                        )}
                        {project.owner_id && (
                          <span className="text-[11px] text-muted-foreground">Owner: {nameOf(project.owner_id)}</span>
                        )}
                        {project.end_date && (
                          <span className="text-[11px] text-muted-foreground">
                            Due: {format(parseISO(project.end_date), 'd MMM yyyy')}
                          </span>
                        )}
                        {project.budget_ngn && (
                          <span className="text-[11px] text-muted-foreground">Budget: {formatNaira(project.budget_ngn)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit" onClick={() => openEdit(project)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Delete" onClick={() => setDeleteTarget(project)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setExpandedProject(isExpanded ? null : project.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Milestone progress */}
                  {pMilestones.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Milestones: {doneMilestones}/{pMilestones.length}</span>
                        <span>Tasks: {doneTasks}/{pTasks.length}</span>
                      </div>
                      <Progress value={msProgress} className="h-1.5" />
                    </div>
                  )}
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4">
                    {project.description && (
                      <p className="text-sm text-muted-foreground">{project.description}</p>
                    )}

                    {/* Milestones */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Milestones</p>
                      {pMilestones.length === 0 && <p className="text-xs text-muted-foreground">No milestones yet.</p>}
                      {pMilestones.map(ms => (
                        <div key={ms.id} className="flex items-center gap-2">
                          <button onClick={() => toggleMilestone(ms)} aria-label="Toggle milestone" className="shrink-0">
                            <CheckCircle2 className={`h-4 w-4 ${ms.status === 'complete' ? 'text-green-600 fill-green-100' : 'text-muted-foreground/40'}`} />
                          </button>
                          <span className={`flex-1 text-sm ${ms.status === 'complete' ? 'line-through text-muted-foreground' : ''}`}>{ms.title}</span>
                          {ms.due_date && (
                            <span className={`text-[11px] ${isPast(parseISO(ms.due_date)) && ms.status === 'pending' ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {format(parseISO(ms.due_date), 'd MMM')}
                            </span>
                          )}
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" aria-label="Remove milestone" onClick={() => deleteMilestone(ms.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {/* Add milestone inline */}
                      <div className="flex gap-2 mt-2">
                        <Input className="h-7 text-xs" placeholder="Add milestone…" value={msProjectId === project.id ? msTitle : ''}
                          onFocus={() => setMsProjectId(project.id)}
                          onChange={e => { setMsProjectId(project.id); setMsTitle(e.target.value); }}
                          onKeyDown={e => { if (e.key === 'Enter' && msProjectId === project.id) addMilestone(); }} />
                        <Input className="h-7 text-xs w-32" type="date"
                          value={msProjectId === project.id ? msDueDate : ''}
                          onFocus={() => setMsProjectId(project.id)}
                          onChange={e => { setMsProjectId(project.id); setMsDueDate(e.target.value); }} />
                        <Button size="sm" className="h-7 text-xs" disabled={savingMs || msProjectId !== project.id || !msTitle.trim()} onClick={addMilestone}>Add</Button>
                      </div>
                    </div>

                    {/* Linked tasks */}
                    {pTasks.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Linked Tasks ({pTasks.length})</p>
                        <div className="grid sm:grid-cols-2 gap-1">
                          {pTasks.map(t => (
                            <div key={t.id} className="flex items-center gap-2 text-xs">
                              <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${t.status === 'complete' ? 'text-green-600' : 'text-muted-foreground/40'}`} />
                              <span className={t.status === 'complete' ? 'line-through text-muted-foreground' : ''}>{t.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Project' : 'New Project'}</DialogTitle>
            <DialogDescription>Link to a client to track deliverables against your CRM.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project name *</Label>
              <Input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Website Redesign, Q3 Marketing Campaign" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => f('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => f('priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Client (optional)</Label>
              <Select value={form.client_id} onValueChange={v => f('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Link to client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select value={form.owner_id} onValueChange={v => f('owner_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Assign owner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={form.department_id} onValueChange={v => f('department_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End date</Label>
                <Input type="date" value={form.end_date} onChange={e => f('end_date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Budget (₦)</Label>
                <Input type="number" min={0} value={form.budget_ngn} onChange={e => f('budget_ngn', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={e => f('description', e.target.value)} placeholder="What is this project about?" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => f('notes', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create project'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The project and its milestones will be hidden. Linked tasks will be unlinked but not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
