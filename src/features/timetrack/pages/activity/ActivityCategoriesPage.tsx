import { useMemo, useState } from 'react';
import { ConfirmAction } from '@/features/timetrack/ui/ConfirmAction';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, Monitor, Plus, Tags } from 'lucide-react';
import { RankedBars } from '@/features/timetrack/ui/charts';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/features/timetrack/ui/TrackerPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { SiteIcon } from '@/features/timetrack/ui/SiteIcon';
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

  // "Add apps or websites": type or paste a list, pick what they are and how they count
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<'site' | 'app'>('site');
  const [addText, setAddText] = useState('');
  const [addCategory, setAddCategory] = useState<'productive' | 'neutral' | 'unproductive' | 'blocked'>('productive');

  /** "https://www.Facebook.com/groups/x?y=1" -> "facebook.com"; apps are kept as typed. */
  const normalise = (raw: string, kind: 'site' | 'app'): string | null => {
    const v = raw.trim();
    if (!v) return null;
    if (kind === 'app') return v;
    const host = v.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:\s]/)[0];
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  };
  const parsedEntries = useMemo(() => {
    const seen = new Set<string>();
    const ok: string[] = [];
    const bad: string[] = [];
    for (const line of addText.split(/[\n,;]+/)) {
      if (!line.trim()) continue;
      const n = normalise(line, addKind);
      if (!n) { bad.push(line.trim()); continue; }
      if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); ok.push(n); }
    }
    return { ok, bad };
   
  }, [addText, addKind]);

  const saveEntries = async () => {
    if (parsedEntries.ok.length === 0) { toast({ title: 'Nothing to add yet', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      let added = 0;
      let changed = 0;
      for (const name of parsedEntries.ok) {
        // an entry that already has a rule is switched to the new category instead of being doubled up
        const existing = (rules ?? []).find((r) => !r.title_contains && r.app_name_contains?.toLowerCase() === name.toLowerCase());
        if (existing) {
          const { error } = await supabase.from('time_productivity_rules').update({ category: addCategory, priority: 40 }).eq('id', existing.id);
          if (error) throw error;
          changed++;
        } else {
          // priority 40 so a hand-added entry beats the starter rules (60)
          const { error } = await supabase.from('time_productivity_rules').insert({ app_name_contains: name, title_contains: null, category: addCategory, priority: 40 });
          if (error) throw error;
          added++;
        }
      }
      toast({ title: `${added} added${changed ? `, ${changed} updated` : ''}`, description: 'Reports use it straight away, past days included.' });
      setAddOpen(false);
      setAddText('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'productivity-rules'] });
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

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
            <RankedBars data={chartData.map((r) => ({ name: r.cat.charAt(0).toUpperCase() + r.cat.slice(1), hours: r.hours, color: CATEGORY_COLOR[r.cat] }))} />
          )}
        </CardContent>
      </Card>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Add apps or websites</Button>
            <Button variant="outline" onClick={() => setOpen(true)}>Advanced rule (window title)</Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Priority</TableHead><TableHead>App or site</TableHead><TableHead>Title contains</TableHead><TableHead>Category</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {(rules ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.priority}</TableCell>
                      <TableCell>
                        {r.app_name_contains ? (
                          <span className="flex items-center gap-2">
                            <SiteIcon name={r.app_name_contains} size={18} />
                            <span>{r.app_name_contains}</span>
                            {!r.title_contains && (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(r.app_name_contains)
                              ? <Badge variant="outline" className="gap-1 text-3xs"><Globe className="h-3 w-3" />site</Badge>
                              : <Badge variant="outline" className="gap-1 text-3xs"><Monitor className="h-3 w-3" />app</Badge>)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{r.title_contains ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline" className={CATEGORY_BADGE[r.category]}>{r.category}</Badge></TableCell>
                      <TableCell><ConfirmAction title="Remove this rule?" confirmLabel="Remove" description="Captures that used this rule go back to uncategorised. This cannot be undone." onConfirm={() => remove(r.id)}><Button size="sm" variant="ghost">Remove</Button></ConfirmAction></TableCell>
                    </TableRow>
                  ))}
                  {(rules ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No rules yet — everything classifies as neutral.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add apps or websites</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={addKind === 'site' ? 'default' : 'outline'} onClick={() => setAddKind('site')}><Globe className="h-4 w-4 mr-1.5" />Websites</Button>
              <Button type="button" variant={addKind === 'app' ? 'default' : 'outline'} onClick={() => setAddKind('app')}><Monitor className="h-4 w-4 mr-1.5" />Apps</Button>
            </div>
            <div>
              <Label>{addKind === 'site' ? 'Websites (one per line, or paste a list)' : 'App names (one per line, or paste a list)'}</Label>
              <Textarea
                rows={5} value={addText} onChange={(e) => setAddText(e.target.value)}
                placeholder={addKind === 'site' ? 'facebook.com\nhttps://www.tiktok.com/@someone\nnetflix.com' : 'Slack\nSnippingTool\nSteam'}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {addKind === 'site'
                  ? 'Links are tidied to the site name (https://www.facebook.com/groups/1 becomes facebook.com).'
                  : 'Use the name as it appears in your reports (for example "Google Chrome" or "Slack"). Part of the name is enough.'}
              </p>
            </div>
            <div>
              <Label>How should they count?</Label>
              <Select value={addCategory} onValueChange={(v) => setAddCategory(v as typeof addCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="productive">Work tool (productive, green)</SelectItem>
                  <SelectItem value="neutral">Neutral (grey)</SelectItem>
                  <SelectItem value="unproductive">Not work (unproductive, red)</SelectItem>
                  <SelectItem value="blocked">Blocked (red and alerts the admins)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(parsedEntries.ok.length > 0 || parsedEntries.bad.length > 0) && (
              <div className="rounded-md border border-border p-2 text-xs space-y-1.5">
                {parsedEntries.ok.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {parsedEntries.ok.slice(0, 40).map((n) => (
                      <span key={n} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5"><SiteIcon name={n} size={14} />{n}</span>
                    ))}
                    {parsedEntries.ok.length > 40 && <span className="text-muted-foreground">+{parsedEntries.ok.length - 40} more</span>}
                  </div>
                )}
                {parsedEntries.bad.length > 0 && <p className="text-destructive">Not a website, skipped: {parsedEntries.bad.slice(0, 5).join(', ')}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveEntries} disabled={saving || parsedEntries.ok.length === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Add {parsedEntries.ok.length || ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
