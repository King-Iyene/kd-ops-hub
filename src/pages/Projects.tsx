import { useEffect, useState, useCallback, useMemo } from 'react';
import { useDepartments, useEmployeeDirectory } from '@/queries';
import {
  Plus, Search, Download, Pencil, Trash2, FolderKanban,
  CheckCircle2, Clock, PauseCircle, XCircle, ChevronDown,
  ChevronUp, Flag, Link as LinkIcon, LayoutGrid, List,
  FolderOpen, Layers, MoreHorizontal, GripVertical,
  CalendarDays, Users, Target, BarChart3, ArrowUpRight,
  Hash, Settings, Palette,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatNaira, formatDate, daysUntil } from '@/lib/format';
import { format, parseISO, isPast } from 'date-fns';
import { toCsv, downloadCsv } from '@/lib/csv';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STATUS_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; dot: string }> = {
  planning:  { label: 'Planning',   icon: Clock,       color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30',    dot: 'bg-blue-500' },
  active:    { label: 'Active',     icon: FolderKanban,color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', dot: 'bg-emerald-500' },
  on_hold:   { label: 'On Hold',    icon: PauseCircle, color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30',  dot: 'bg-amber-500' },
  completed: { label: 'Completed',  icon: CheckCircle2,color: 'text-emerald-600', bg: 'bg-emerald-50/50 dark:bg-emerald-950/20', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled',  icon: XCircle,     color: 'text-muted-foreground', bg: 'bg-muted',  dot: 'bg-slate-400' },
};

const PRIORITY_META: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'text-red-600',    dot: 'bg-red-500' },
  high:     { label: 'High',     color: 'text-orange-500', dot: 'bg-orange-400' },
  normal:   { label: 'Normal',   color: 'text-blue-500',   dot: 'bg-blue-400' },
  low:      { label: 'Low',      color: 'text-slate-400',  dot: 'bg-slate-300 dark:bg-slate-600' },
};

const SPACE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

interface Space {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  owner_id: string | null;
  sort_order: number;
  created_at: string;
}

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
  space_id: string | null;
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

interface TaskRow { id: string; title: string; status: string; project_id: string | null; due_date: string | null; parent_id: string | null; }
interface Client { id: string; name: string; }
interface Profile { id: string; full_name: string; }
interface Department { id: string; name: string; }

type ViewMode = 'grid' | 'list';

const EMPTY_FORM = {
  name: '', description: '', client_id: '__none__', owner_id: '__none__',
  department_id: '__none__', status: 'planning', priority: 'normal',
  budget_ngn: '', start_date: '', end_date: '', notes: '', space_id: '__none__',
};

const EMPTY_SPACE_FORM = {
  name: '', description: '', color: '#6366f1',
};

export default function Projects() {
  usePageTitle('Projects');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const { data: profiles = [] } = useEmployeeDirectory();
  const { data: departments = [] } = useDepartments();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('grid');
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const [spaceDialog, setSpaceDialog] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [spaceForm, setSpaceForm] = useState({ ...EMPTY_SPACE_FORM });
  const [savingSpace, setSavingSpace] = useState(false);
  const [deleteSpaceTarget, setDeleteSpaceTarget] = useState<Space | null>(null);

  const [msDialog, setMsDialog] = useState(false);
  const [msProjectId, setMsProjectId] = useState('');
  const [msTitle, setMsTitle] = useState('');
  const [msDueDate, setMsDueDate] = useState('');
  const [savingMs, setSavingMs] = useState(false);

  const [detailProject, setDetailProject] = useState<Project | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sData }, { data: pData }, { data: mData }, { data: tData }, { data: cData }] = await Promise.all([
      supabase.from('project_spaces').select('id, name, description, color, sort_order').is('deleted_at', null).order('sort_order').limit(50),
      supabase.from('projects').select('id, name, description, client_id, owner_id, department_id, status, priority, budget_ngn, start_date, end_date, completed_at, notes, space_id').is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
      supabase.from('project_milestones').select('id, project_id, title, due_date, status').order('sort_order').limit(2000),
      supabase.from('tasks').select('id, title, status, project_id, due_date, parent_id').is('parent_id', null).limit(2000),
      supabase.from('clients').select('id, name').order('name').limit(200),
    ]);
    setSpaces((sData as Space[]) || []);
    setProjects((pData as Project[]) || []);
    setMilestones((mData as Milestone[]) || []);
    setTasks((tData as TaskRow[]) || []);
    setClients((cData as Client[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? 'Unknown') : '—';
  const clientOf = (id: string | null) => id ? (clients.find(c => c.id === id)?.name ?? '—') : '—';
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const taskCountsByProject = useMemo(() => {
    const counts = new Map<string, { total: number; done: number; overdue: number }>();
    for (const t of tasks) {
      if (!t.project_id) continue;
      const prev = counts.get(t.project_id) || { total: 0, done: 0, overdue: 0 };
      prev.total++;
      if (t.status === 'complete') prev.done++;
      else if (t.due_date && (daysUntil(t.due_date) ?? 0) < 0) prev.overdue++;
      counts.set(t.project_id, prev);
    }
    return counts;
  }, [tasks]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (selectedSpace !== null) {
        if (selectedSpace === '__unassigned__') { if (p.space_id !== null) return false; }
        else if (p.space_id !== selectedSpace) return false;
      }
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || clientOf(p.client_id).toLowerCase().includes(q) || nameOf(p.owner_id).toLowerCase().includes(q);
      }
      return true;
    });
  }, [projects, selectedSpace, statusFilter, search, clients, profiles]);

  const stats = useMemo(() => {
    const src = selectedSpace !== null
      ? projects.filter(p => selectedSpace === '__unassigned__' ? !p.space_id : p.space_id === selectedSpace)
      : projects;
    return {
      active:    src.filter(p => p.status === 'active').length,
      planning:  src.filter(p => p.status === 'planning').length,
      completed: src.filter(p => p.status === 'completed').length,
      overdue:   src.filter(p => p.status === 'active' && p.end_date && isPast(parseISO(p.end_date))).length,
      total:     src.length,
    };
  }, [projects, selectedSpace]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      owner_id: profile?.id ?? '__none__',
      space_id: selectedSpace && selectedSpace !== '__unassigned__' ? selectedSpace : '__none__',
    });
    setDialogOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? '', client_id: p.client_id ?? '__none__',
      owner_id: p.owner_id ?? '__none__', department_id: p.department_id ?? '__none__',
      status: p.status, priority: p.priority, budget_ngn: p.budget_ngn != null ? String(p.budget_ngn) : '',
      start_date: p.start_date ?? '', end_date: p.end_date ?? '', notes: p.notes ?? '',
      space_id: p.space_id ?? '__none__',
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
      space_id: form.space_id !== '__none__' ? form.space_id : null,
      completed_at: form.status === 'completed' && editing?.status !== 'completed' ? new Date().toISOString() : (editing?.completed_at ?? null),
    };
    const { error } = editing
      ? await supabase.from('projects').update(payload).eq('id', editing.id)
      : await supabase.from('projects').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit(editing ? 'project_updated' : 'project_created', `Project "${payload.name}" ${editing ? 'updated' : 'created'}`, profile);
    toast({ title: editing ? 'Project updated' : 'Project created' });
    setDialogOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', deleteTarget.id);
    await logAudit('project_deleted', `Project "${deleteTarget.name}" removed`, profile);
    toast({ title: 'Project removed' });
    setDeleteTarget(null);
    load();
  };

  const openCreateSpace = () => {
    setEditingSpace(null);
    setSpaceForm({ ...EMPTY_SPACE_FORM });
    setSpaceDialog(true);
  };

  const openEditSpace = (s: Space) => {
    setEditingSpace(s);
    setSpaceForm({ name: s.name, description: s.description ?? '', color: s.color });
    setSpaceDialog(true);
  };

  const saveSpace = async () => {
    if (!spaceForm.name.trim()) { toast({ title: 'Space name is required', variant: 'destructive' }); return; }
    setSavingSpace(true);
    const payload = {
      name: spaceForm.name.trim(),
      description: spaceForm.description.trim() || null,
      color: spaceForm.color,
      owner_id: profile?.id,
      created_by: profile?.id,
      sort_order: editingSpace?.sort_order ?? spaces.length,
    };
    const { error } = editingSpace
      ? await supabase.from('project_spaces').update(payload).eq('id', editingSpace.id)
      : await supabase.from('project_spaces').insert(payload);
    setSavingSpace(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit(editingSpace ? 'space_updated' : 'space_created', `Space "${payload.name}" ${editingSpace ? 'updated' : 'created'}`, profile);
    toast({ title: editingSpace ? 'Space updated' : 'Space created' });
    setSpaceDialog(false);
    load();
  };

  const confirmDeleteSpace = async () => {
    if (!deleteSpaceTarget) return;
    await supabase.from('project_spaces').update({ deleted_at: new Date().toISOString() }).eq('id', deleteSpaceTarget.id);
    await logAudit('space_deleted', `Space "${deleteSpaceTarget.name}" removed`, profile);
    toast({ title: 'Space removed' });
    setDeleteSpaceTarget(null);
    if (selectedSpace === deleteSpaceTarget.id) setSelectedSpace(null);
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
    const header = ['Name', 'Space', 'Client', 'Owner', 'Status', 'Priority', 'Budget', 'Start', 'End', 'Milestones', 'Tasks'];
    const rows = filtered.map(p => {
      const ms = milestones.filter(m => m.project_id === p.id).length;
      const ts = taskCountsByProject.get(p.id)?.total ?? 0;
      const space = p.space_id ? spaces.find(s => s.id === p.space_id)?.name ?? '' : '';
      return [p.name, space, clientOf(p.client_id), nameOf(p.owner_id), p.status, p.priority,
        p.budget_ngn ?? '', p.start_date ?? '', p.end_date ?? '', ms, ts];
    });
    downloadCsv(`projects-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCsv(header, rows));
  };

  const activeSpaceName = selectedSpace
    ? selectedSpace === '__unassigned__'
      ? 'Unorganized'
      : spaces.find(s => s.id === selectedSpace)?.name ?? 'Space'
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={activeSpaceName ? `Space: ${activeSpaceName}` : 'Organize work into spaces, projects, and milestones.'}
        icon={FolderKanban}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-lg p-0.5">
              {([
                { key: 'grid' as const, icon: LayoutGrid, label: 'Grid' },
                { key: 'list' as const, icon: List, label: 'List' },
              ]).map((v) => (
                <button key={v.key} onClick={() => setView(v.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                    view === v.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}>
                  <v.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export</Button>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Project</Button>
          </div>
        }
      />

      <div className="flex gap-6">
        {/* ─── Spaces Sidebar ──────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-56 shrink-0 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Spaces</span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={openCreateSpace}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Create space</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <button onClick={() => setSelectedSpace(null)}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full',
              selectedSpace === null
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}>
            <Layers className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">All Projects</span>
            <span className="text-[11px] tabular-nums opacity-60">{projects.length}</span>
          </button>

          {spaces.map((space) => {
            const count = projects.filter(p => p.space_id === space.id).length;
            return (
              <div key={space.id} className="group flex items-center">
                <button onClick={() => setSelectedSpace(space.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left flex-1 min-w-0',
                    selectedSpace === space.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}>
                  <div className="h-3.5 w-3.5 rounded shrink-0" style={{ backgroundColor: space.color }} />
                  <span className="flex-1 truncate">{space.name}</span>
                  <span className="text-[11px] tabular-nums opacity-60">{count}</span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 ml-0.5">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => openEditSpace(space)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteSpaceTarget(space)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}

          {projects.some(p => !p.space_id) && (
            <button onClick={() => setSelectedSpace('__unassigned__')}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full',
                selectedSpace === '__unassigned__'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}>
              <FolderOpen className="h-4 w-4 shrink-0 opacity-50" />
              <span className="flex-1 truncate">Unorganized</span>
              <span className="text-[11px] tabular-nums opacity-60">
                {projects.filter(p => !p.space_id).length}
              </span>
            </button>
          )}
        </div>

        {/* ─── Main Content ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Mobile space selector */}
          <div className="lg:hidden">
            <Select value={selectedSpace ?? 'all'} onValueChange={v => setSelectedSpace(v === 'all' ? null : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {spaces.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                {projects.some(p => !p.space_id) && <SelectItem value="__unassigned__">Unorganized</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Active',    value: stats.active,    color: 'text-emerald-600', icon: FolderKanban },
              { label: 'Planning',  value: stats.planning,  color: 'text-blue-500',    icon: Clock },
              { label: 'Completed', value: stats.completed, color: 'text-muted-foreground', icon: CheckCircle2 },
              { label: 'Overdue',   value: stats.overdue,   color: 'text-red-600',     icon: Flag },
            ].map(s => (
              <Card key={s.label} className="overflow-hidden">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{s.label}</p>
                      <p className={cn('text-2xl font-bold mt-1 tabular-nums', s.color)}>{s.value}</p>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                      <s.icon className={cn('h-4 w-4', s.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {[['active','Active'],['planning','Planning'],['on_hold','On Hold'],['completed','Completed'],['all','All']].map(([v,l]) => (
                <Button key={v} size="sm" variant={statusFilter === v ? 'default' : 'outline'}
                  className="h-8 text-xs" onClick={() => setStatusFilter(v)}>{l}</Button>
              ))}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <Card><CardContent className="p-0"><TableSkeleton rows={6} cols={7} /></CardContent></Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                  <FolderOpen className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No projects found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {search ? 'Try a different search term.' : 'Create your first project to get started.'}
                </p>
                {!search && (
                  <Button className="mt-4" size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-1.5" /> New Project
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  space={project.space_id ? spaces.find(s => s.id === project.space_id) : undefined}
                  milestones={milestones.filter(m => m.project_id === project.id)}
                  taskCounts={taskCountsByProject.get(project.id)}
                  nameOf={nameOf}
                  clientOf={clientOf}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  onClick={setDetailProject}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Project</th>
                      <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Status</th>
                      <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Owner</th>
                      <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Client</th>
                      <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Progress</th>
                      <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Due</th>
                      <th className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(project => {
                      const pMs = milestones.filter(m => m.project_id === project.id);
                      const doneMs = pMs.filter(m => m.status === 'complete').length;
                      const tc = taskCountsByProject.get(project.id);
                      const isOverdue = project.status === 'active' && project.end_date && isPast(parseISO(project.end_date));
                      const SM = STATUS_META[project.status];
                      return (
                        <tr key={project.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <button className="text-left hover:underline" onClick={() => setDetailProject(project)}>
                              <p className="font-medium">{project.name}</p>
                              {project.space_id && (
                                <span className="text-[10px] text-muted-foreground">
                                  {spaces.find(s => s.id === project.space_id)?.name}
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <div className={cn('h-2 w-2 rounded-full', SM?.dot)} />
                              <span className="text-xs">{SM?.label}</span>
                              {isOverdue && <Badge variant="destructive" className="text-[9px] px-1 py-0">Late</Badge>}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">{nameOf(project.owner_id)}</td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">{clientOf(project.client_id)}</td>
                          <td className="py-3 px-4">
                            {(pMs.length > 0 || (tc && tc.total > 0)) ? (
                              <div className="space-y-0.5 min-w-20">
                                {pMs.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <Progress value={pMs.length > 0 ? (doneMs / pMs.length) * 100 : 0} className="h-1 flex-1" />
                                    <span className="text-[10px] text-muted-foreground tabular-nums">{doneMs}/{pMs.length}</span>
                                  </div>
                                )}
                                {tc && tc.total > 0 && (
                                  <span className="text-[10px] text-muted-foreground">{tc.done}/{tc.total} tasks</span>
                                )}
                              </div>
                            ) : <span className="text-[10px] text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 px-4">
                            {project.end_date ? (
                              <span className={cn('text-xs', isOverdue && 'text-destructive font-medium')}>
                                {format(parseISO(project.end_date), 'd MMM yyyy')}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(project)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(project)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── Project Detail Sheet ──────────────────────────────────── */}
      <Sheet open={!!detailProject} onOpenChange={v => { if (!v) setDetailProject(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailProject && (
            <ProjectDetailPanel
              project={detailProject}
              space={detailProject.space_id ? spaces.find(s => s.id === detailProject.space_id) : undefined}
              milestones={milestones.filter(m => m.project_id === detailProject.id)}
              tasks={tasks.filter(t => t.project_id === detailProject.id)}
              nameOf={nameOf}
              clientOf={clientOf}
              onEdit={() => { setDetailProject(null); openEdit(detailProject); }}
              onDelete={() => { setDetailProject(null); setDeleteTarget(detailProject); }}
              onToggleMilestone={toggleMilestone}
              onDeleteMilestone={deleteMilestone}
              onAddMilestone={(title, due) => {
                setMsProjectId(detailProject.id);
                setMsTitle(title);
                setMsDueDate(due);
                addMilestone().then(() => {
                  setMsProjectId(detailProject.id);
                });
              }}
              msProjectId={msProjectId}
              msTitle={msTitle}
              msDueDate={msDueDate}
              savingMs={savingMs}
              setMsProjectId={setMsProjectId}
              setMsTitle={setMsTitle}
              setMsDueDate={setMsDueDate}
              addMilestone={addMilestone}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Create / Edit Project Dialog ──────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Project' : 'New Project'}</DialogTitle>
            <DialogDescription>Organize work with milestones and link tasks to track progress.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project name *</Label>
              <Input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Website Redesign, Q3 Marketing" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Space</Label>
                <Select value={form.space_id} onValueChange={v => f('space_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select space" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {spaces.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => f('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => f('priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={form.client_id} onValueChange={v => f('client_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Link to client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      {/* ─── Space Create / Edit Dialog ────────────────────────────── */}
      <Dialog open={spaceDialog} onOpenChange={setSpaceDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingSpace ? 'Edit Space' : 'New Space'}</DialogTitle>
            <DialogDescription>Spaces organize projects into logical groups.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={spaceForm.name} onChange={e => setSpaceForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Engineering, Marketing" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={spaceForm.description} onChange={e => setSpaceForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {SPACE_COLORS.map(c => (
                  <button key={c} onClick={() => setSpaceForm(p => ({ ...p, color: c }))}
                    className={cn('h-7 w-7 rounded-lg transition-all border-2', spaceForm.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105')}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpaceDialog(false)}>Cancel</Button>
            <Button onClick={saveSpace} disabled={savingSpace}>{savingSpace ? 'Saving…' : editingSpace ? 'Update' : 'Create space'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Project Confirmation ───────────────────────────── */}
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

      {/* ─── Delete Space Confirmation ─────────────────────────────── */}
      <AlertDialog open={!!deleteSpaceTarget} onOpenChange={o => !o && setDeleteSpaceTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove space "{deleteSpaceTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Projects in this space will become unorganized. No projects or tasks will be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSpace} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Project Card ──────────────────────────────────────────────────

function ProjectCard({
  project, space, milestones, taskCounts, nameOf, clientOf,
  onEdit, onDelete, onClick,
}: {
  project: Project;
  space?: Space;
  milestones: Milestone[];
  taskCounts?: { total: number; done: number; overdue: number };
  nameOf: (id: string | null) => string;
  clientOf: (id: string | null) => string;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  onClick: (p: Project) => void;
}) {
  const SM = STATUS_META[project.status];
  const PM = PRIORITY_META[project.priority];
  const doneMs = milestones.filter(m => m.status === 'complete').length;
  const msProgress = milestones.length > 0 ? (doneMs / milestones.length) * 100 : 0;
  const isOverdue = project.status === 'active' && project.end_date && isPast(parseISO(project.end_date));
  const d = project.end_date ? daysUntil(project.end_date) : null;

  return (
    <Card className={cn(
      'group overflow-hidden transition-all hover:shadow-md cursor-pointer',
      project.status === 'cancelled' && 'opacity-60',
    )} onClick={() => onClick(project)}>
      {/* Color accent strip */}
      <div className="h-1" style={{ backgroundColor: space?.color ?? (SM?.dot === 'bg-emerald-500' ? '#10b981' : '#94a3b8') }} />

      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold leading-snug truncate">{project.name}</p>
              {isOverdue && (
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0 shrink-0">Overdue</Badge>
              )}
            </div>
            {space && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="h-2 w-2 rounded" style={{ backgroundColor: space.color }} />
                <span className="text-[10px] text-muted-foreground">{space.name}</span>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(project); }}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); onDelete(project); }}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status + Priority */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className={cn('flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5', SM?.bg)}>
            <div className={cn('h-1.5 w-1.5 rounded-full', SM?.dot)} />
            <span className={SM?.color}>{SM?.label}</span>
          </div>
          {project.priority !== 'normal' && (
            <div className="flex items-center gap-1 text-[11px]">
              <div className={cn('h-1.5 w-1.5 rounded-full', PM?.dot)} />
              <span className={PM?.color}>{PM?.label}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        {(milestones.length > 0 || (taskCounts && taskCounts.total > 0)) && (
          <div className="space-y-1.5">
            {milestones.length > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Milestones</span>
                  <span className="tabular-nums">{doneMs}/{milestones.length}</span>
                </div>
                <Progress value={msProgress} className="h-1" />
              </div>
            )}
            {taskCounts && taskCounts.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Tasks</span>
                  <span className="tabular-nums">
                    {taskCounts.done}/{taskCounts.total}
                    {taskCounts.overdue > 0 && <span className="text-destructive ml-1">({taskCounts.overdue} late)</span>}
                  </span>
                </div>
                <Progress value={(taskCounts.done / taskCounts.total) * 100} className="h-1" />
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3 min-w-0">
            {project.owner_id && (
              <div className="flex items-center gap-1 min-w-0">
                <div className="h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <span className="text-[7px] font-bold leading-none">
                    {nameOf(project.owner_id).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <span className="truncate">{nameOf(project.owner_id)}</span>
              </div>
            )}
            {project.client_id && (
              <span className="flex items-center gap-0.5 truncate">
                <LinkIcon className="h-2.5 w-2.5 shrink-0" />
                {clientOf(project.client_id)}
              </span>
            )}
          </div>
          {project.end_date && (
            <span className={cn('flex items-center gap-0.5 shrink-0', isOverdue && 'text-destructive font-medium')}>
              <CalendarDays className="h-2.5 w-2.5" />
              {d !== null && d < 0
                ? `${Math.abs(d)}d late`
                : d !== null && d === 0 ? 'Due today'
                : d !== null && d <= 7 ? `${d}d left`
                : format(parseISO(project.end_date), 'd MMM')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Project Detail Panel ──────────────────────────────────────────

function ProjectDetailPanel({
  project, space, milestones, tasks, nameOf, clientOf,
  onEdit, onDelete, onToggleMilestone, onDeleteMilestone,
  msProjectId, msTitle, msDueDate, savingMs,
  setMsProjectId, setMsTitle, setMsDueDate, addMilestone,
}: {
  project: Project;
  space?: Space;
  milestones: Milestone[];
  tasks: TaskRow[];
  nameOf: (id: string | null) => string;
  clientOf: (id: string | null) => string;
  onEdit: () => void;
  onDelete: () => void;
  onToggleMilestone: (ms: Milestone) => void;
  onDeleteMilestone: (id: string) => void;
  onAddMilestone: (title: string, due: string) => void;
  msProjectId: string;
  msTitle: string;
  msDueDate: string;
  savingMs: boolean;
  setMsProjectId: (id: string) => void;
  setMsTitle: (v: string) => void;
  setMsDueDate: (v: string) => void;
  addMilestone: () => Promise<void>;
}) {
  const SM = STATUS_META[project.status];
  const isOverdue = project.status === 'active' && project.end_date && isPast(parseISO(project.end_date));
  const doneTasks = tasks.filter(t => t.status === 'complete').length;
  const overdueTasks = tasks.filter(t => t.status !== 'complete' && t.due_date && (daysUntil(t.due_date) ?? 0) < 0).length;
  const doneMs = milestones.filter(m => m.status === 'complete').length;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-left pr-8">
          <span className="text-base font-semibold">{project.name}</span>
        </SheetTitle>
      </SheetHeader>

      <div className="space-y-5 mt-4">
        {/* Meta badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {space && (
            <div className="flex items-center gap-1.5 text-[11px] rounded-full px-2.5 py-0.5 bg-muted">
              <div className="h-2 w-2 rounded" style={{ backgroundColor: space.color }} />
              {space.name}
            </div>
          )}
          <div className={cn('flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-0.5', SM?.bg)}>
            <div className={cn('h-1.5 w-1.5 rounded-full', SM?.dot)} />
            <span className={SM?.color}>{SM?.label}</span>
          </div>
          {project.priority !== 'normal' && (
            <Badge variant="outline" className="text-[10px]">
              <div className={cn('h-1.5 w-1.5 rounded-full mr-1', PRIORITY_META[project.priority]?.dot)} />
              {PRIORITY_META[project.priority]?.label}
            </Badge>
          )}
          {isOverdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {project.owner_id && (
            <div><span className="text-muted-foreground text-xs">Owner</span><p className="font-medium">{nameOf(project.owner_id)}</p></div>
          )}
          {project.client_id && (
            <div><span className="text-muted-foreground text-xs">Client</span><p className="font-medium">{clientOf(project.client_id)}</p></div>
          )}
          {project.start_date && (
            <div><span className="text-muted-foreground text-xs">Start</span><p>{format(parseISO(project.start_date), 'd MMM yyyy')}</p></div>
          )}
          {project.end_date && (
            <div><span className="text-muted-foreground text-xs">Due</span>
              <p className={cn(isOverdue && 'text-destructive font-medium')}>{format(parseISO(project.end_date), 'd MMM yyyy')}</p>
            </div>
          )}
          {project.budget_ngn != null && (
            <div><span className="text-muted-foreground text-xs">Budget</span><p className="font-medium currency">{formatNaira(project.budget_ngn)}</p></div>
          )}
        </div>

        {project.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{tasks.length}</p>
            <p className="text-[10px] text-muted-foreground">Tasks</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-lg font-bold tabular-nums text-emerald-600">{doneTasks}</p>
            <p className="text-[10px] text-muted-foreground">Complete</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className={cn('text-lg font-bold tabular-nums', overdueTasks > 0 && 'text-destructive')}>{overdueTasks}</p>
            <p className="text-[10px] text-muted-foreground">Overdue</p>
          </div>
        </div>

        {/* Milestones */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Milestones</Label>
            {milestones.length > 0 && <span className="text-[11px] text-muted-foreground">{doneMs}/{milestones.length} done</span>}
          </div>
          {milestones.length > 0 && (
            <Progress value={milestones.length > 0 ? (doneMs / milestones.length) * 100 : 0} className="h-1.5" />
          )}
          {milestones.length === 0 && <p className="text-xs text-muted-foreground">No milestones yet.</p>}
          <div className="space-y-1">
            {milestones.map(ms => (
              <div key={ms.id} className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-muted/50">
                <button onClick={() => onToggleMilestone(ms)} className="shrink-0">
                  <CheckCircle2 className={cn('h-4 w-4', ms.status === 'complete' ? 'text-emerald-600 fill-emerald-100' : 'text-muted-foreground/40')} />
                </button>
                <span className={cn('flex-1 text-sm', ms.status === 'complete' && 'line-through text-muted-foreground')}>{ms.title}</span>
                {ms.due_date && (
                  <span className={cn('text-[11px]', isPast(parseISO(ms.due_date)) && ms.status === 'pending' ? 'text-destructive' : 'text-muted-foreground')}>
                    {format(parseISO(ms.due_date), 'd MMM')}
                  </span>
                )}
                <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={() => onDeleteMilestone(ms.id)}>
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input className="h-7 text-xs" placeholder="Add milestone…"
              value={msProjectId === project.id ? msTitle : ''}
              onFocus={() => setMsProjectId(project.id)}
              onChange={e => { setMsProjectId(project.id); setMsTitle(e.target.value); }}
              onKeyDown={e => { if (e.key === 'Enter' && msProjectId === project.id) addMilestone(); }} />
            <Input className="h-7 text-xs w-28" type="date"
              value={msProjectId === project.id ? msDueDate : ''}
              onFocus={() => setMsProjectId(project.id)}
              onChange={e => { setMsProjectId(project.id); setMsDueDate(e.target.value); }} />
            <Button size="sm" className="h-7 text-xs shrink-0" disabled={savingMs || msProjectId !== project.id || !msTitle.trim()} onClick={addMilestone}>
              <Plus className="h-3 w-3 mr-1" />Add
            </Button>
          </div>
        </div>

        {/* Linked tasks */}
        {tasks.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Linked Tasks ({tasks.length})</Label>
            {tasks.length > 0 && (
              <Progress value={tasks.length > 0 ? (doneTasks / tasks.length) * 100 : 0} className="h-1.5" />
            )}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {tasks.map(t => {
                const d = t.due_date ? daysUntil(t.due_date) : null;
                const late = t.status !== 'complete' && d !== null && d < 0;
                return (
                  <div key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', t.status === 'complete' ? 'text-emerald-600' : 'text-muted-foreground/40')} />
                    <span className={cn('flex-1 text-sm truncate', t.status === 'complete' && 'line-through text-muted-foreground')}>{t.title}</span>
                    {late && <span className="text-[10px] text-destructive shrink-0">{Math.abs(d!)}d late</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        {project.notes && (
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Notes</Label>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.notes}</p>
          </div>
        )}
      </div>
    </>
  );
}
