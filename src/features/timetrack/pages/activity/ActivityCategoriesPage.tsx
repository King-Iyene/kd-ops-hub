import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Tags } from 'lucide-react';
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CATEGORY_BADGE, useActivityDateRange, ActivityDateRangeBar, useLogsWithIntervals } from './shared';

interface Rule { id: string; app_name_contains: string | null; title_contains: string | null; category: string; priority: number }

const CATEGORY_COLOR: Record<string, string> = {
  productive: '#10b981', neutral: '#6b7280', unproductive: '#ef4444', blocked: '#dc2626', idle: '#0ea5e9', uncategorized: '#a1a1aa',
};

/** TimeCamp's "Activity categories" — rules that classify each capture as productive/neutral/unproductive. */
export default function ActivityCategoriesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data: logData, isLoading: logsLoading } = useLogsWithIntervals(start, end);
  const { data: rules, isLoading } = useQuery({
    queryKey: ['timetrack', 'productivity-rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_productivity_rules').select('*').order('priority');
      if (error) throw error;
      return data as Rule[];
    },
  });

  const chartData = useMemo(() => {
    const hours = new Map<string, number>();
    for (const l of logData?.logs ?? []) {
      const cat = l.productivity_category ?? 'uncategorized';
      const intervalMin = logData?.intervalByEmployee.get(l.employee_id) ?? 10;
      hours.set(cat, (hours.get(cat) ?? 0) + intervalMin / 60);
    }
    return ['productive', 'neutral', 'unproductive', 'blocked', 'idle', 'uncategorized']
      .map((cat) => ({ cat, hours: Number((hours.get(cat) ?? 0).toFixed(1)) }))
      .filter((r) => r.hours > 0);
  }, [logData]);
  const [open, setOpen] = useState(false);
  const [appNameContains, setAppNameContains] = useState('');
  const [titleContains, setTitleContains] = useState('');
  const [category, setCategory] = useState<'productive' | 'neutral' | 'unproductive' | 'blocked'>('productive');
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
      <PageHeader title="Activity categories" description="Rules that classify each capture as productive, neutral, unproductive, or blocked (triggers an admin alert)" icon={Tags} />

      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium mb-2">Time by category</p>
          {logsLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No data to display.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="cat" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => `${v}h`} />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                  {chartData.map((r) => <Cell key={r.cat} fill={CATEGORY_COLOR[r.cat]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

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
                  <SelectItem value="blocked">Blocked (alerts admins)</SelectItem>
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
