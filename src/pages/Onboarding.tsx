import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, UserCheck,
  CheckCircle2, Circle, ChevronDown, ChevronUp, ClipboardList,
  UserMinus, AlertCircle, Clock,
} from 'lucide-react';
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
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

type ChecklistType = 'onboarding' | 'offboarding';
type ItemCategory = 'documentation' | 'it_setup' | 'hr_admin' | 'finance' | 'training' | 'equipment' | 'introduction' | 'other';

const CAT_LABEL: Record<ItemCategory, string> = {
  documentation: 'Documentation',
  it_setup: 'IT Setup',
  hr_admin: 'HR Admin',
  finance: 'Finance',
  training: 'Training',
  equipment: 'Equipment',
  introduction: 'Introduction',
  other: 'Other',
};

const DEFAULT_ONBOARDING_ITEMS: { category: ItemCategory; title: string }[] = [
  { category: 'documentation',  title: 'Collect signed employment contract' },
  { category: 'documentation',  title: 'Obtain valid ID and passport photos' },
  { category: 'hr_admin',       title: 'Register employee on HRIS' },
  { category: 'hr_admin',       title: 'Enrol on HMO / NHIS scheme' },
  { category: 'hr_admin',       title: 'Set up pension PFA account' },
  { category: 'finance',        title: 'Collect bank account details for payroll' },
  { category: 'it_setup',       title: 'Create corporate email account' },
  { category: 'it_setup',       title: 'Set up laptop / workstation' },
  { category: 'equipment',      title: 'Issue ID card and access pass' },
  { category: 'introduction',   title: 'Introduce to team and line manager' },
  { category: 'training',       title: 'Complete company policy induction' },
];

const DEFAULT_OFFBOARDING_ITEMS: { category: ItemCategory; title: string }[] = [
  { category: 'documentation',  title: 'Collect resignation / termination letter' },
  { category: 'hr_admin',       title: 'Process final salary computation' },
  { category: 'hr_admin',       title: 'Issue certificate of employment' },
  { category: 'it_setup',       title: 'Revoke system / email access' },
  { category: 'it_setup',       title: 'Retrieve company devices' },
  { category: 'equipment',      title: 'Collect ID card and access pass' },
  { category: 'finance',        title: 'Settle any outstanding advances' },
  { category: 'documentation',  title: 'Complete exit interview' },
];

interface OnboardingChecklist {
  id: string;
  employee_id: string;
  checklist_type: ChecklistType;
  target_completion_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface OnboardingItem {
  id: string;
  checklist_id: string;
  category: ItemCategory;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

interface Profile { id: string; full_name: string; }

const EMPTY_FORM = {
  employee_id: '__none__',
  checklist_type: 'onboarding' as ChecklistType,
  target_completion_date: '',
  notes: '',
  seed_defaults: true,
};

const EMPTY_ITEM_FORM = {
  category: 'other' as ItemCategory,
  title: '',
  description: '',
  assigned_to: '__none__',
  due_date: '',
};

function deriveStatus(items: OnboardingItem[]): { label: string; pct: number; variant: 'default' | 'secondary' | 'outline' } {
  if (items.length === 0) return { label: 'Pending', pct: 0, variant: 'secondary' };
  const done = items.filter(i => i.is_completed).length;
  const pct = Math.round((done / items.length) * 100);
  if (pct === 100) return { label: 'Completed', pct: 100, variant: 'default' };
  if (pct === 0)   return { label: 'Pending',   pct: 0,   variant: 'secondary' };
  return { label: 'In Progress', pct, variant: 'outline' };
}

export default function Onboarding() {
  usePageTitle('Onboarding & Offboarding');
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [checklists, setChecklists] = useState<OnboardingChecklist[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<string, OnboardingItem[]>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ChecklistType | 'all'>('all');
  const [empFilter, setEmpFilter] = useState('__none__');

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Checklist dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCl, setEditingCl] = useState<OnboardingChecklist | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OnboardingChecklist | null>(null);

  // Item add
  const [addItemCl, setAddItemCl] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM_FORM });
  const [itemSaving, setItemSaving] = useState(false);
  const newItemRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: clData }, { data: itData }, { data: pData }] = await Promise.all([
      supabase.from('onboarding_checklists').select('id, employee_id, checklist_type, target_completion_date, notes').order('created_at', { ascending: false }).limit(5000),
      supabase.from('onboarding_items').select('id, checklist_id, category, title, is_completed, assigned_to, due_date').order('sort_order').limit(20000),
      supabase.from('profiles_directory').select('id, full_name').neq('is_anonymised', true).order('full_name'),
    ]);
    setChecklists(clData ?? []);
    const map: Record<string, OnboardingItem[]> = {};
    for (const item of (itData ?? [])) {
      if (!map[item.checklist_id]) map[item.checklist_id] = [];
      map[item.checklist_id].push(item);
    }
    setItemsMap(map);
    setProfiles(pData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingCl(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(cl: OnboardingChecklist) {
    setEditingCl(cl);
    setForm({
      employee_id: cl.employee_id,
      checklist_type: cl.checklist_type,
      target_completion_date: cl.target_completion_date ?? '',
      notes: cl.notes ?? '',
      seed_defaults: false,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.employee_id || form.employee_id === '__none__') {
      toast({ title: 'Please select an employee', variant: 'destructive' }); return;
    }
    setSaving(true);
    const payload = {
      employee_id: form.employee_id,
      checklist_type: form.checklist_type,
      target_completion_date: form.target_completion_date || null,
      notes: form.notes.trim() || null,
      created_by: user?.id,
    };

    if (editingCl) {
      const { error } = await supabase.from('onboarding_checklists').update(payload).eq('id', editingCl.id);
      setSaving(false);
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Checklist updated' });
    } else {
      const { data: newCl, error } = await supabase.from('onboarding_checklists').insert(payload).select('id').single();
      if (error) { setSaving(false); toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }

      if (form.seed_defaults && newCl) {
        const defaults = form.checklist_type === 'onboarding' ? DEFAULT_ONBOARDING_ITEMS : DEFAULT_OFFBOARDING_ITEMS;
        const seedItems = defaults.map((d, i) => ({
          checklist_id: newCl.id,
          category: d.category,
          title: d.title,
          sort_order: i,
          is_completed: false,
        }));
        await supabase.from('onboarding_items').insert(seedItems);
      }
      setSaving(false);
      toast({ title: 'Checklist created' });
    }
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('onboarding_checklists').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Checklist deleted' }); load(); }
    setDeleteTarget(null);
  }

  async function toggleItem(item: OnboardingItem) {
    const nowCompleted = !item.is_completed;
    const { error } = await supabase.from('onboarding_items').update({
      is_completed: nowCompleted,
      completed_at: nowCompleted ? new Date().toISOString() : null,
      completed_by: nowCompleted ? user?.id : null,
    }).eq('id', item.id);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    setItemsMap(prev => {
      const updated = (prev[item.checklist_id] ?? []).map(i =>
        i.id === item.id ? { ...i, is_completed: nowCompleted, completed_at: nowCompleted ? new Date().toISOString() : null } : i
      );
      return { ...prev, [item.checklist_id]: updated };
    });
  }

  async function deleteItem(item: OnboardingItem) {
    const { error } = await supabase.from('onboarding_items').delete().eq('id', item.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setItemsMap(prev => ({
      ...prev,
      [item.checklist_id]: (prev[item.checklist_id] ?? []).filter(i => i.id !== item.id),
    }));
  }

  async function handleAddItem(clId: string) {
    if (!itemForm.title.trim()) return;
    setItemSaving(true);
    const existingItems = itemsMap[clId] ?? [];
    const payload = {
      checklist_id: clId,
      category: itemForm.category,
      title: itemForm.title.trim(),
      description: itemForm.description.trim() || null,
      assigned_to: itemForm.assigned_to !== '__none__' ? itemForm.assigned_to : null,
      due_date: itemForm.due_date || null,
      sort_order: existingItems.length,
      is_completed: false,
    };
    const { data, error } = await supabase.from('onboarding_items').insert(payload).select('id, checklist_id, category, title, is_completed, assigned_to, due_date').single();
    setItemSaving(false);
    if (error) { toast({ title: 'Failed to add item', description: error.message, variant: 'destructive' }); return; }
    setItemsMap(prev => ({ ...prev, [clId]: [...(prev[clId] ?? []), data] }));
    setItemForm({ ...EMPTY_ITEM_FORM });
    setAddItemCl(null);
  }

  const filtered = checklists.filter(cl => {
    const emp = profiles.find(p => p.id === cl.employee_id);
    const term = search.toLowerCase();
    const matchSearch = !term || (emp?.full_name ?? '').toLowerCase().includes(term);
    const matchType = typeFilter === 'all' || cl.checklist_type === typeFilter;
    const matchEmp = empFilter === '__none__' || cl.employee_id === empFilter;
    return matchSearch && matchType && matchEmp;
  });

  function exportCSV() {
    const rows: string[] = [];
    for (const cl of filtered) {
      const emp = profiles.find(p => p.id === cl.employee_id);
      const items = itemsMap[cl.id] ?? [];
      const status = deriveStatus(items);
      rows.push([
        emp?.full_name ?? cl.employee_id,
        cl.checklist_type,
        cl.target_completion_date ?? '',
        `${status.pct}%`,
        items.filter(i => i.is_completed).length,
        items.length,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }
    const csv = ['Employee,Type,Target Date,Progress,Completed,Total', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'onboarding.csv'; a.click();
  }

  const empName = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '—';

  const onboardingCount = checklists.filter(c => c.checklist_type === 'onboarding').length;
  const offboardingCount = checklists.filter(c => c.checklist_type === 'offboarding').length;
  const completedCount = checklists.filter(cl => {
    const items = itemsMap[cl.id] ?? [];
    return items.length > 0 && items.every(i => i.is_completed);
  }).length;

  const onboardingAnalytics = useMemo(() => {
    const allItems = Object.values(itemsMap).flat();
    const totalItems = allItems.length;
    const doneItems = allItems.filter(i => i.is_completed).length;
    const completionRate = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

    const overdueChecklists = checklists.filter(cl => {
      const items = itemsMap[cl.id] ?? [];
      if (items.length > 0 && items.every(i => i.is_completed)) return false;
      return cl.target_completion_date && new Date(cl.target_completion_date) < new Date();
    }).length;

    const overdueItems = allItems.filter(i =>
      !i.is_completed && i.due_date && new Date(i.due_date) < new Date()
    ).length;

    return { completionRate, overdueChecklists, overdueItems };
  }, [checklists, itemsMap]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding & Offboarding"
        description="Manage employee joining and exit checklists"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Checklist
          </Button>
        }
      />

      {/* Summary */}
      <div className="kd-stat-grid">
        <StatCard title="Onboarding" value={onboardingCount} icon={UserCheck} tone="primary" />
        <StatCard title="Offboarding" value={offboardingCount} icon={UserMinus} tone="default" />
        <StatCard title="Completed" value={completedCount} icon={CheckCircle2} tone="success" />
        <StatCard title="Task completion" value={`${onboardingAnalytics.completionRate}%`} icon={Clock} tone={onboardingAnalytics.completionRate >= 80 ? 'success' : 'warning'} />
        <StatCard title="Overdue checklists" value={onboardingAnalytics.overdueChecklists} icon={AlertCircle} tone={onboardingAnalytics.overdueChecklists > 0 ? 'danger' : 'default'} />
        <StatCard title="Overdue tasks" value={onboardingAnalytics.overdueItems} icon={AlertCircle} tone={onboardingAnalytics.overdueItems > 0 ? 'danger' : 'default'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as ChecklistType | 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="offboarding">Offboarding</SelectItem>
          </SelectContent>
        </Select>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">All Employees</SelectItem>
            {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* Checklists */}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No checklists found"
          description="Create an onboarding or offboarding checklist to track joining and exit tasks."
          action={
            <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> New Checklist</Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map(cl => {
            const items = itemsMap[cl.id] ?? [];
            const status = deriveStatus(items);
            const isExpanded = !!expanded[cl.id];
            const byCategory = items.reduce<Record<string, OnboardingItem[]>>((acc, item) => {
              if (!acc[item.category]) acc[item.category] = [];
              acc[item.category].push(item);
              return acc;
            }, {});

            return (
              <Card key={cl.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{empName(cl.employee_id)}</CardTitle>
                        <Badge variant={cl.checklist_type === 'onboarding' ? 'default' : 'secondary'}>
                          {cl.checklist_type === 'onboarding' ? 'Onboarding' : 'Offboarding'}
                        </Badge>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      {cl.target_completion_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Target: {format(parseISO(cl.target_completion_date), 'dd MMM yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cl)} aria-label="Edit checklist"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(cl)} aria-label="Delete checklist"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setExpanded(p => ({ ...p, [cl.id]: !p[cl.id] }))} aria-label={isExpanded ? 'Collapse checklist' : 'Expand checklist'}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <Progress value={status.pct} className="h-2" />
                      <p className="text-xs text-muted-foreground">{items.filter(i => i.is_completed).length} / {items.length} items complete</p>
                    </div>
                  )}
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-4">
                    {Object.keys(byCategory).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No items yet. Add one below.</p>
                    ) : (
                      Object.entries(byCategory).map(([cat, catItems]) => (
                        <div key={cat}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            {CAT_LABEL[cat as ItemCategory] ?? cat}
                          </p>
                          <div className="space-y-1">
                            {catItems.map(item => (
                              <div key={item.id} className="flex items-center gap-2 group">
                                <button
                                  onClick={() => toggleItem(item)}
                                  className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                                  aria-label={item.is_completed ? 'Mark incomplete' : 'Mark complete'}
                                >
                                  {item.is_completed
                                    ? <CheckCircle2 className="h-4 w-4" />
                                    : <Circle className="h-4 w-4 text-muted-foreground" />}
                                </button>
                                <span className={`flex-1 text-sm ${item.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                                  {item.title}
                                </span>
                                {item.assigned_to && (
                                  <span className="text-xs text-muted-foreground hidden group-hover:inline">
                                    → {empName(item.assigned_to)}
                                  </span>
                                )}
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => deleteItem(item)}
                                  aria-label="Delete item"
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Add item inline */}
                    {addItemCl === cl.id ? (
                      <div className="border border-border/60 rounded-xl p-3 space-y-2 bg-muted/30">
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            ref={newItemRef}
                            placeholder="Item title"
                            value={itemForm.title}
                            onChange={e => setItemForm(f => ({ ...f, title: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddItem(cl.id); if (e.key === 'Escape') setAddItemCl(null); }}
                          />
                          <Select value={itemForm.category} onValueChange={v => setItemForm(f => ({ ...f, category: v as ItemCategory }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(CAT_LABEL) as ItemCategory[]).map(c => (
                                <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={itemForm.assigned_to} onValueChange={v => setItemForm(f => ({ ...f, assigned_to: v }))}>
                            <SelectTrigger><SelectValue placeholder="Assign to (optional)" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Unassigned</SelectItem>
                              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input type="date" value={itemForm.due_date} onChange={e => setItemForm(f => ({ ...f, due_date: e.target.value }))} />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setAddItemCl(null)}>Cancel</Button>
                          <Button size="sm" onClick={() => handleAddItem(cl.id)} disabled={itemSaving || !itemForm.title.trim()}>
                            {itemSaving ? 'Adding…' : 'Add Item'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm" variant="outline" className="gap-2"
                        onClick={() => { setAddItemCl(cl.id); setItemForm({ ...EMPTY_ITEM_FORM }); setTimeout(() => newItemRef.current?.focus(), 50); }}
                      >
                        <Plus className="h-3 w-3" /> Add Item
                      </Button>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* New/Edit Checklist dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCl ? 'Edit Checklist' : 'New Checklist'}</DialogTitle>
            <DialogDescription>Onboarding or offboarding checklist for an employee</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="onboardingEmployee" className="kd-label">Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger id="onboardingEmployee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select employee —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="onboardingChecklistType" className="kd-label">Checklist Type</Label>
              <Select value={form.checklist_type} onValueChange={v => setForm(f => ({ ...f, checklist_type: v as ChecklistType }))}>
                <SelectTrigger id="onboardingChecklistType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding (new hire)</SelectItem>
                  <SelectItem value="offboarding">Offboarding (exit)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="onboardingTargetDate" className="kd-label">Target Completion Date</Label>
              <Input id="onboardingTargetDate" type="date" value={form.target_completion_date} onChange={e => setForm(f => ({ ...f, target_completion_date: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="onboardingNotes" className="kd-label">Notes</Label>
              <Textarea id="onboardingNotes" rows={3} placeholder="Additional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {!editingCl && (
              <div className="flex items-center gap-3">
                <input
                  id="seed-defaults"
                  type="checkbox"
                  checked={form.seed_defaults}
                  onChange={e => setForm(f => ({ ...f, seed_defaults: e.target.checked }))}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="seed-defaults" className="cursor-pointer">
                  Populate with default checklist items
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editingCl ? 'Save Changes' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete checklist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the {deleteTarget?.checklist_type} checklist for {deleteTarget ? empName(deleteTarget.employee_id) : ''} and all its items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
