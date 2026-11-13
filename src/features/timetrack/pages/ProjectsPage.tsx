import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronDown, ChevronRight, Loader2, Archive, Tag as TagIcon, FolderKanban } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { fetchActiveProjects, fetchTasksForProject, fetchAllTags } from '../lib/queries';
import type { TimeCustomField, TimeProject, TimeTask } from '../lib/types';

export default function ProjectsPage() {
  const { has } = useTimetrackCapabilities();
  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Projects & Tasks" description="Projects, tasks, tags and custom fields — the structure everything else tracks against" icon={FolderKanban} />
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projects &amp; Tasks</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
        </TabsList>
        <TabsContent value="projects" className="mt-4"><ProjectsTab canManage={has('manage_projects')} canManageTasks={has('manage_tasks')} /></TabsContent>
        <TabsContent value="tags" className="mt-4"><TagsTab /></TabsContent>
        <TabsContent value="fields" className="mt-4"><CustomFieldsTab canManage={has('manage_custom_fields')} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ProjectsTab({ canManage, canManageTasks }: { canManage: boolean; canManageTasks: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const { data: projects, isLoading } = useQuery({ queryKey: ['timetrack', 'projects'], queryFn: fetchActiveProjects });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeProject | null>(null);
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState<string>('');
  const [isBillable, setIsBillable] = useState(true);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing(null); setName(''); setManagerId(''); setIsBillable(true); setDialogOpen(true); };
  const openEdit = (p: TimeProject) => { setEditing(p); setName(p.name); setManagerId(p.manager_id ?? ''); setIsBillable(p.is_billable); setDialogOpen(true); };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), manager_id: managerId || null, is_billable: isBillable };
      const { error } = editing
        ? await supabase.from('time_projects').update(payload).eq('id', editing.id)
        : await supabase.from('time_projects').insert(payload);
      if (error) throw error;
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ['timetrack', 'projects'] });
    } catch (err) {
      toast({ title: 'Could not save project', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const archive = async (p: TimeProject) => {
    try {
      const { error } = await supabase.from('time_projects').update({ is_archived: true }).eq('id', p.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'projects'] });
    } catch (err) {
      toast({ title: 'Could not archive', description: errorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      {canManage && <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" />New project</Button>}
      {(projects ?? []).map((p) => (
        <Card key={p.id}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="shrink-0">
                {expanded === p.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{p.name} {!p.is_billable && <Badge variant="outline" className="ml-2">non-billable</Badge>}</p>
                {p.manager_id && <p className="text-xs text-muted-foreground">PM: {employees?.find((e) => e.id === p.manager_id)?.full_name ?? '—'}</p>}
              </div>
              {canManage && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => archive(p)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
            {expanded === p.id && <TasksList projectId={p.id} canManage={canManageTasks || canManage} />}
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit project' : 'New project'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label>Project manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isBillable} onCheckedChange={setIsBillable} id="proj-billable" />
              <Label htmlFor="proj-billable">Billable project</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TasksList({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tasks } = useQuery({ queryKey: ['timetrack', 'tasks', projectId], queryFn: () => fetchTasksForProject(projectId) });
  const [newTask, setNewTask] = useState('');

  const addTask = async () => {
    if (!newTask.trim()) return;
    try {
      const { error } = await supabase.from('time_tasks').insert({ project_id: projectId, name: newTask.trim() });
      if (error) throw error;
      setNewTask('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'tasks', projectId] });
    } catch (err) {
      toast({ title: 'Could not add task', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const archiveTask = async (t: TimeTask) => {
    try {
      const { error } = await supabase.from('time_tasks').update({ is_archived: true }).eq('id', t.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'tasks', projectId] });
    } catch (err) {
      toast({ title: 'Could not archive task', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="ml-6 mt-3 space-y-1.5 border-l border-border/60 pl-4">
      {(tasks ?? []).map((t) => (
        <div key={t.id} className="flex items-center justify-between text-sm py-1">
          <span>{t.name}</span>
          {canManage && <Button variant="ghost" size="sm" onClick={() => archiveTask(t)}>Archive</Button>}
        </div>
      ))}
      {canManage && (
        <div className="flex gap-2 pt-1">
          <Input placeholder="New task name" value={newTask} onChange={(e) => setNewTask(e.target.value)} className="h-8" />
          <Button size="sm" onClick={addTask}>Add</Button>
        </div>
      )}
    </div>
  );
}

function TagsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tags, isLoading } = useQuery({ queryKey: ['timetrack', 'tags'], queryFn: fetchAllTags });
  const [newTag, setNewTag] = useState('');

  const addTag = async () => {
    if (!newTag.trim()) return;
    try {
      const { error } = await supabase.from('time_tags').insert({ name: newTag.trim() });
      if (error) throw error;
      setNewTag('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'tags'] });
    } catch (err) {
      toast({ title: 'Could not add tag', description: errorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 max-w-sm">
        <Input placeholder="New tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
        <Button onClick={addTag}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(tags ?? []).map((t) => <Badge key={t.id} variant="secondary"><TagIcon className="h-3 w-3 mr-1" />{t.name}</Badge>)}
      </div>
    </div>
  );
}

function CustomFieldsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: fields, isLoading } = useQuery({
    queryKey: ['timetrack', 'custom-fields'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_custom_fields').select('*').eq('is_archived', false).order('name');
      if (error) throw error;
      return data as TimeCustomField[];
    },
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState<'text' | 'number' | 'dropdown'>('text');
  const [appliesTo, setAppliesTo] = useState<'project' | 'task' | 'entry'>('entry');
  const [options, setOptions] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_custom_fields').insert({
        name: name.trim(), field_type: fieldType, applies_to: appliesTo,
        options: fieldType === 'dropdown' ? options.split(',').map((o) => o.trim()).filter(Boolean) : [],
      });
      if (error) throw error;
      setOpen(false); setName(''); setOptions('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'custom-fields'] });
    } catch (err) {
      toast({ title: 'Could not save field', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      {canManage && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New custom field</Button>}
      <div className="space-y-1.5">
        {(fields ?? []).map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
            <span className="font-medium">{f.name}</span>
            <Badge variant="outline">{f.field_type}</Badge>
            <Badge variant="outline">on {f.applies_to}</Badge>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New custom field</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label>Type</Label>
              <Select value={fieldType} onValueChange={(v) => setFieldType(v as typeof fieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="dropdown">Dropdown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {fieldType === 'dropdown' && <div><Label>Options (comma-separated)</Label><Input value={options} onChange={(e) => setOptions(e.target.value)} /></div>}
            <div>
              <Label>Applies to</Label>
              <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as typeof appliesTo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="entry">Time entry</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
