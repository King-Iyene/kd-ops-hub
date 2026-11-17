import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Download, Globe, Search } from 'lucide-react';
import { RankedBars } from '@/features/timetrack/ui/charts';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { toCsv, downloadCsv } from '@/lib/csv';
import { PageHeader } from '@/features/timetrack/ui/TrackerPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SiteIcon } from '@/features/timetrack/ui/SiteIcon';
import { useActivityDateRange, ActivityDateRangeBar, useLogsWithIntervals, captureDomain, CATEGORY_BADGE } from './shared';

type ShowFilter = 'all' | 'websites' | 'applications' | 'non_categorized' | 'away_time';

const PAGE_SIZE = 20;

const CATEGORY_LABEL: Record<string, string> = {
  productive: 'a work tool (productive)', neutral: 'neutral', unproductive: 'not work (red)', blocked: 'blocked (red + alert)',
};

/** 3.38 hours -> "3h 23m" (TimeCamp's format); under an hour -> "23m". */
function formatHm(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Chart bar colour by productivity, like TimeCamp: green productive, red unproductive, grey otherwise. */
function barColor(category: string): string {
  if (category === 'productive') return '#22c55e';
  if (category === 'unproductive' || category === 'blocked') return '#ef4444';
  return '#9ca3af';
}

/** TimeCamp's "Sites and Apps" report. Real per-site domain breakdown is only
 * possible where the agent can get a browser's active-tab URL at all, which
 * is macOS only (Windows/Linux have no OS-level API for it — see the url
 * column's migration note). Rows with a captured domain show the site;
 * everything else falls back to grouping by application, same as before.
 *
 * The category dropdown on each row writes a time_productivity_rules row
 * (app_name_contains = that app/site), so future captures of it classify
 * accordingly — same rules table the Activity Categories page manages. */
export default function SitesAppsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);
  const [show, setShow] = useState<ShowFilter>('all');
  const [search, setSearch] = useState('');

  const { data: rules } = useQuery({
    queryKey: ['timetrack', 'productivity-rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_productivity_rules').select('id, app_name_contains, category');
      if (error) throw error;
      return data as { id: string; app_name_contains: string | null; category: string }[];
    },
  });
  const ruleFor = (key: string) => rules?.find((r) => r.app_name_contains && key.toLowerCase().includes(r.app_name_contains.toLowerCase()));

  const assignCategory = async (key: string, category: string) => {
    try {
      const existing = ruleFor(key);
      if (existing) {
        const { error } = await supabase.from('time_productivity_rules').update({ category }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('time_productivity_rules').insert({ app_name_contains: key, category, priority: 50 });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['timetrack', 'productivity-rules'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'activity-logs-range'] }); // rules now apply to past captures too
      toast({ title: `"${key}" is now ${CATEGORY_LABEL[category] ?? category}`, description: 'Applied to all captures, past and new.' });
    } catch (err) {
      toast({ title: 'Could not assign category', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const rows = useMemo(() => {
    const map = new Map<string, { hours: number; isSite: boolean; isIdle: boolean }>();
    for (const l of data?.logs ?? []) {
      const domain = captureDomain(l);
      const isIdle = l.productivity_category === 'idle';
      const key = isIdle ? 'Away time' : (domain ?? l.app_name ?? 'Unknown');
      const intervalMin = data?.intervalByEmployee.get(l.employee_id) ?? 10;
      const row = map.get(key) ?? { hours: 0, isSite: domain !== null, isIdle };
      row.hours += intervalMin / 60;
      map.set(key, row);
    }
    return [...map.entries()].map(([key, r]) => ({ key, ...r, category: ruleFor(key)?.category ?? '' })).sort((a, b) => b.hours - a.hours);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ruleFor is a plain closure over `rules`, already a dep
  }, [data, rules]);

  const filtered = useMemo(() => {
    let list = rows;
    if (show === 'websites') list = list.filter((r) => r.isSite);
    else if (show === 'applications') list = list.filter((r) => !r.isSite && !r.isIdle);
    else if (show === 'non_categorized') list = list.filter((r) => !r.category && !r.isIdle);
    else if (show === 'away_time') list = list.filter((r) => r.isIdle);
    if (search.trim()) list = list.filter((r) => r.key.toLowerCase().includes(search.trim().toLowerCase()));
    return list;
  }, [rows, show, search]);

  const [page, setPage] = useState(0);
  const totalHours = filtered.reduce((s, r) => s + r.hours, 0);
  const top10Hours = filtered.slice(0, 10).reduce((s, r) => s + r.hours, 0);
  const top10Pct = totalHours > 0 ? (top10Hours / totalHours) * 100 : 0;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const chartData = filtered.slice(0, 10).map((r) => ({
    name: r.key,
    hours: Number(r.hours.toFixed(2)),
    category: r.category,
  }));

  const exportCsv = () => {
    const csv = toCsv(['Site / App', 'Type', 'Category', 'Estimated hours'], filtered.map((r) => [r.key, r.isSite ? 'Site' : r.isIdle ? 'Away' : 'App', r.category, r.hours.toFixed(2)]));
    downloadCsv(`timetrack-apps-${start}-to-${end}.csv`, csv);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Sites and apps" description="Site and application usage, by estimated hours" icon={Globe} />
      {!isLoading && <p className="text-sm">Total time: <span className="font-medium text-emerald-500">{formatHm(totalHours)}</span></p>}
      <div className="flex flex-wrap items-end gap-3">
        <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
        <div className="relative w-56">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Hours are estimated from capture ticks × each employee's capture interval, not a true duration.
        Site/domain breakdown comes from the desktop app (v1.0.11+) reading the browser's address bar on
        Windows and macOS (Chrome, Edge, Brave, Firefox...). Only the site name is stored, never the full
        link. Older captures and Linux fall back to grouping by application.
      </p>

      <Tabs value={show} onValueChange={(v) => setShow(v as ShowFilter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="websites">Websites</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="non_categorized">Non-categorized</TabsTrigger>
          <TabsTrigger value="away_time">Away time</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <Card>
            <CardContent className="pt-4">
              {chartData.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No data to display.</p> : (
                <RankedBars data={chartData.map((d) => ({ name: d.name, hours: d.hours, color: barColor(d.category) }))} />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button></div>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-right">Time</TableHead><TableHead className="text-right w-16">%</TableHead><TableHead className="w-44">Category</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pageRows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="flex items-center gap-2">
                        {!r.isIdle && <SiteIcon name={r.key} size={18} />}
                        {r.key}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatHm(r.hours)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{totalHours > 0 ? `${Math.round((r.hours / totalHours) * 100)}%` : '0%'}</TableCell>
                      <TableCell>
                        {r.isIdle ? (
                          <Badge variant="outline" className={CATEGORY_BADGE.idle}>idle</Badge>
                        ) : (
                          <Select value={r.category || '__none'} onValueChange={(v) => assignCategory(r.key, v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none" disabled>Uncategorized</SelectItem>
                              <SelectItem value="productive">Work tool (productive)</SelectItem>
                              <SelectItem value="neutral">Neutral</SelectItem>
                              <SelectItem value="unproductive">Not work (red)</SelectItem>
                              <SelectItem value="blocked">Blocked (red + alert)</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
                </TableBody>
              </Table>
              {filtered.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-emerald-500">{top10Pct.toFixed(1)}%</span> of time in top 10
                  </p>
                  {pageCount > 1 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Page:</span>
                      {Array.from({ length: pageCount }, (_, i) => (
                        <Button key={i} size="sm" variant={i === safePage ? 'default' : 'outline'} className="h-7 w-7 p-0" onClick={() => setPage(i)}>{i + 1}</Button>
                      ))}
                      <span className="text-muted-foreground">({safePage * PAGE_SIZE + 1}-{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length})</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
