import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  StickyNote, Plus, Search, Filter, Pencil, Trash2, Pin, PinOff,
  TrendingUp, AlertTriangle, Lightbulb, Target, Loader2,
} from 'lucide-react';

interface CfoNote {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  period_label: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
}

const CATEGORIES = [
  { value: 'decision',   label: 'Decision',    icon: Target,         color: 'text-blue-600 bg-blue-500/10' },
  { value: 'risk',       label: 'Risk',         icon: AlertTriangle,  color: 'text-amber-600 bg-amber-500/10' },
  { value: 'insight',    label: 'Insight',      icon: Lightbulb,      color: 'text-purple-600 bg-purple-500/10' },
  { value: 'forecast',   label: 'Forecast',     icon: TrendingUp,     color: 'text-emerald-600 bg-emerald-500/10' },
  { value: 'general',    label: 'General',      icon: StickyNote,     color: 'text-slate-600 bg-slate-500/10' },
] as const;

type Category = typeof CATEGORIES[number]['value'];

const EMPTY_FORM = {
  title: '', body: '', category: 'general' as Category, period_label: '', pinned: false,
};

export default function CfoNotesTab() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [notes, setNotes] = useState<CfoNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cfo_notes' as any)
        .select('id, title, body, category, pinned, period_label, created_at, created_by_name')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotes((data ?? []) as any as CfoNote[]);
    } catch (err: any) {
      toast({ title: 'Could not load notes', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (note: CfoNote) => {
    setEditingId(note.id);
    setForm({
      title: note.title,
      body: note.body,
      category: note.category as Category,
      period_label: note.period_label || '',
      pinned: note.pinned,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: 'Title and body are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        period_label: form.period_label.trim() || null,
        pinned: form.pinned,
      };

      if (editingId) {
        const { error } = await supabase
          .from('cfo_notes' as any)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cfo_notes' as any)
          .insert({
            ...payload,
            created_by: profile?.id,
            created_by_name: profile?.full_name || profile?.email,
          });
        if (error) throw error;
      }

      await logAudit(
        'cfo_note_saved' as any,
        `CFO note "${payload.title}" ${editingId ? 'updated' : 'created'}`,
        profile,
      );
      toast({ title: editingId ? 'Note updated' : 'Note created' });
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (note: CfoNote) => {
    if (!(await confirm({
      title: 'Delete note?',
      description: `Delete "${note.title}"? This cannot be undone.`,
      variant: 'destructive',
    }))) return;

    const { error } = await supabase.from('cfo_notes' as any).delete().eq('id', note.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('cfo_note_deleted' as any, `CFO note "${note.title}" deleted`, profile);
    toast({ title: 'Note deleted' });
    load();
  };

  const togglePin = async (note: CfoNote) => {
    const { error } = await supabase
      .from('cfo_notes' as any)
      .update({ pinned: !note.pinned })
      .eq('id', note.id);
    if (error) {
      toast({ title: 'Could not update pin', variant: 'destructive' });
      return;
    }
    load();
  };

  const filtered = notes.filter(n => {
    if (filterCategory !== 'all' && n.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        Loading CFO notes…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search notes…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px] h-9">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Note
        </Button>
      </div>

      {/* Notes grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No notes yet</p>
            <p className="text-xs mt-1">Create financial notes, record decisions, flag risks, and document insights.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(note => {
            const cat = CATEGORIES.find(c => c.value === note.category) ?? CATEGORIES[4];
            const Icon = cat.icon;
            return (
              <Card key={note.id} className={cn('relative group', note.pinned && 'ring-1 ring-primary/20')}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('p-1.5 rounded-md shrink-0', cat.color)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="text-sm truncate">{note.title}</CardTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="secondary" className="text-[9px]">{cat.label}</Badge>
                          {note.period_label && (
                            <Badge variant="outline" className="text-[9px]">{note.period_label}</Badge>
                          )}
                          {note.pinned && (
                            <Pin className="h-3 w-3 text-primary" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={note.pinned ? 'Unpin note' : 'Pin note'} onClick={() => togglePin(note)}>
                        {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit note" onClick={() => openEdit(note)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete note" onClick={() => handleDelete(note)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-4">{note.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {note.created_by_name} · {formatDate(note.created_at)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary" />
              {editingId ? 'Edit Note' : 'New CFO Note'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Q3 headcount decision"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as Category })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Period (optional)</Label>
                <Input
                  value={form.period_label}
                  onChange={e => setForm({ ...form, period_label: e.target.value })}
                  placeholder="e.g. Aug 2026, Q3 FY26"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note</Label>
              <Textarea
                className="min-h-[160px]"
                value={form.body}
                onChange={e => setForm({ ...form, body: e.target.value })}
                placeholder="Document your analysis, decision rationale, risk assessment, or forecast notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.body.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
