import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Tags } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CATEGORY_BADGE } from './shared';

interface Rule { id: string; app_name_contains: string | null; title_contains: string | null; category: string; priority: number }

/** TimeCamp's "Activity categories" — rules that classify each capture as productive/neutral/unproductive. */
export default function ActivityCategoriesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rules, isLoading } = useQuery({
    queryKey: ['timetrack', 'productivity-rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_productivity_rules').select('*').order('priority');
      if (error) throw error;
      return data as Rule[];
    },
  });
  const [open, setOpen] = useState(false);
  const [appNameContains, setAppNameContains] = useState('');
  const [titleContains, setTitleContains] = useState('');
  const [category, setCategory] = useState<'productive' | 'neutral' | 'unproductive'>('productive');
  const [priority, setPriority] = useState('100');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!appNameContains.trim() && !titleContains.trim()) {
      toast({ title: 'Set at least one match condition', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('time_productivity_rules').insert({
        app_name_contains: appNameContains.trim() || null, title_contains: titleContains.trim() || null,
        category, priority: Number(priority) || 100,
      });
      if (error) throw error;
      setOpen(false); setAppNameContains(''); setTitleContains('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'productivity-rules'] });
    } catch (err) {
      toast({ title: 'Could not save rule', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await supabase.from('time_productivity_rules').delete().eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'productivity-rules'] });
    } catch (err) {
      toast({ title: 'Could not delete rule', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Activity categories" description="Rules that classify each capture as productive, neutral, or unproductive" icon={Tags} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="space-y-3">
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New rule</Button>
          <Table>
            <TableHeader><TableRow><TableHead>Priority</TableHead><TableHead>App contains</TableHead><TableHead>Title contains</TableHead><TableHead>Category</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(rules ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.priority}</TableCell>
                  <TableCell>{r.app_name_contains ?? '—'}</TableCell>
                  <TableCell>{r.title_contains ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={CATEGORY_BADGE[r.category]}>{r.category}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => remove(r.id)}>Remove</Button></TableCell>
                </TableRow>
              ))}
              {(rules ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No rules yet — everything classifies as neutral.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New productivity rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>App name contains</Label><Input value={appNameContains} onChange={(e) => setAppNameContains(e.target.value)} placeholder="e.g. Chrome" /></div>
            <div><Label>Window title contains</Label><Input value={titleContains} onChange={(e) => setTitleContains(e.target.value)} placeholder="e.g. Figma" /></div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="productive">Productive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="unproductive">Unproductive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Priority (lower checks first)</Label><Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} /></div>
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
