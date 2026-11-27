import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfDay, format, startOfDay } from 'date-fns';
import { Loader2, Image as ImageIcon, Trash2, CheckSquare, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Rows3, GalleryHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees, useFieldTeamIds } from '@/features/timetrack/lib/trackerEmployees';
import { useTimetrackCapabilities } from '../../lib/capabilities';
import { PageHeader } from '@/features/timetrack/ui/TrackerPageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScreenPanels, estimateScreens, useImageDims } from '@/features/timetrack/ui/ScreenPanels';
import { EmployeeSelect } from '@/features/timetrack/ui/EmployeeSelect';
import { DateRangeSelect } from '@/features/timetrack/ui/DateRangeSelect';
import { SCREENSHOT_PAGE, groupByDay, rangeWords, shiftRange } from '../../lib/screenshotRange';
import { STICKY_FILTERS } from '@/features/timetrack/ui/stickyFilters';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ScreenshotRow {
  id: string;
  employee_id: string;
  storage_path: string;
  captured_at: string;
  time_activity_logs: { app_name: string | null; url: string | null } | null;
}


/** TimeCamp's "Screenshots" report: pick a day and a person, get one row per capture with the
 * application that was in front, a thumbnail (click to enlarge), and per-row / bulk removal.
 * Images come from the private timetrack-screenshots bucket via short-lived signed URLs. */
export default function ScreenshotsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { has } = useTimetrackCapabilities();
  const canManage = has('manage_activity_tracking');
  const { data: employees } = useActiveEmployees();
  const [employeeId, setEmployeeId] = useState('');
  // a day or a range: today by default; the quick choices are Today, Yesterday, Last 7 days, This week, Last week, This month, Last month (or pick any dates)
  const [start, setStart] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  // how many are loaded (more come with "Show more"; a week or a month can hold thousands)
  const [limit, setLimit] = useState(SCREENSHOT_PAGE);
  const [urls, setUrls] = useState<Record<string, string>>({});
  // pictures that would not load even after a fresh link (deleted, or never finished uploading)
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const triedAgain = useRef<Set<string>>(new Set());
  const signedAt = useRef<Record<string, number>>({});
  /** A new private link for one screenshot (links last an hour; an old page tab may hold one that has expired). */
  const resign = async (r: ScreenshotRow): Promise<string> => {
    const { data } = await supabase.storage.from('timetrack-screenshots').createSignedUrl(r.storage_path, 3600);
    const url = data?.signedUrl ?? '';
    if (url) { signedAt.current[r.id] = Date.now(); setUrls((prev) => ({ ...prev, [r.id]: url })); }
    return url;
  };
  const onImageError = async (r: ScreenshotRow) => {
    if (!triedAgain.current.has(r.id)) { triedAgain.current.add(r.id); if (await resign(r)) return; }
    setFailed((f) => new Set(f).add(r.id));
  };
  const retry = async (r: ScreenshotRow) => {
    setFailed((f) => { const n = new Set(f); n.delete(r.id); return n; });
    triedAgain.current.delete(r.id);
    if (!(await resign(r))) setFailed((f) => new Set(f).add(r.id));
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<ScreenshotRow | null>(null);
  const [zoom, setZoom] = useState(1);
  const [layout, setLayout] = useState<'stacked' | 'wide'>('stacked');
  // which screen is shown on its own (null = all of them)
  const [only, setOnly] = useState<number | null>(null);
  const openViewer = (r: ScreenshotRow) => {
    setZoom(1); setOnly(null); setViewing(r);
    // a link signed a while ago may have expired: get a fresh one before showing it large
    if (Date.now() - (signedAt.current[r.id] ?? 0) > 10 * 60_000) void resign(r);
  };
  const clampZoom = (z: number) => Math.min(8, Math.max(0.4, Number(z.toFixed(2))));
  const viewerUrl = viewing ? urls[viewing.id] : undefined;
  const screenCount = estimateScreens(useImageDims(viewerUrl));
  const pane = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  // keys: left and right change screen, + and - zoom, 0 resets
  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' && screenCount > 1) { e.preventDefault(); setOnly((o) => (o == null ? 0 : (o + 1) % screenCount)); setZoom(1); }
      else if (e.key === 'ArrowLeft' && screenCount > 1) { e.preventDefault(); setOnly((o) => (o == null ? screenCount - 1 : (o - 1 + screenCount) % screenCount)); setZoom(1); }
      else if (e.key === '+' || e.key === '=') setZoom((z) => clampZoom(z * 1.25));
      else if (e.key === '-') setZoom((z) => clampZoom(z / 1.25));
      else if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing, screenCount]);

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const goBy = (dir: -1 | 1) => { const r = shiftRange(start, end, dir); setStart(r.start); setEnd(r.end); };

  const { data: retentionDays } = useQuery({
    queryKey: ['timetrack', 'agent-retention', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data } = await supabase.from('time_agent_settings').select('retention_days').eq('employee_id', employeeId).maybeSingle();
      return data?.retention_days ?? 30;
    },
  });

  const { data: loaded, isLoading, isFetching } = useQuery({
    queryKey: ['timetrack', 'screenshots', employeeId, start, end, limit],
    placeholderData: (prev) => prev, // while more are loading, keep showing the ones already here
    queryFn: async () => {
      let q = supabase
        .from('time_screenshots')
        .select('id, employee_id, storage_path, captured_at, time_activity_logs(app_name, url)', { count: 'exact' })
        .gte('captured_at', startOfDay(startDate).toISOString())
        .lte('captured_at', endOfDay(endDate).toISOString())
        // Newest first, so the latest capture is at the top without scrolling.
        .order('captured_at', { ascending: false })
        .limit(limit);
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data as unknown as ScreenshotRow[], total: count ?? (data?.length ?? 0) };
    },
  });
  const allRows = loaded?.rows;
  const total = loaded?.total ?? 0;
  const fieldIds = useFieldTeamIds();
  const rows = useMemo(() => (allRows ?? []).filter((r) => !fieldIds.has(r.employee_id)), [allRows, fieldIds]);

  useEffect(() => {
    setSelected(new Set());
    setLimit(SCREENSHOT_PAGE);
  }, [employeeId, start, end]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = (rows ?? []).filter((r) => !urls[r.id]);
      if (pending.length === 0) return;
      const entries = await Promise.all(pending.map(async (r) => {
        const { data } = await supabase.storage.from('timetrack-screenshots').createSignedUrl(r.storage_path, 3600);
        if (data?.signedUrl) signedAt.current[r.id] = Date.now();
        return [r.id, data?.signedUrl ?? ''] as const;
      }));
      if (!cancelled) setUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => (prev.size === (rows ?? []).length ? new Set() : new Set((rows ?? []).map((r) => r.id))));
  };

  const remove = async (toRemove: ScreenshotRow[]) => {
    try {
      if (toRemove.length === 0) return;
      const { error: storageErr } = await supabase.storage.from('timetrack-screenshots').remove(toRemove.map((r) => r.storage_path));
      if (storageErr) throw storageErr;
      const { error } = await supabase.from('time_screenshots').delete().in('id', toRemove.map((r) => r.id));
      if (error) throw error;
      toast({ title: `Removed ${toRemove.length} screenshot${toRemove.length === 1 ? '' : 's'}` });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['timetrack', 'screenshots'] });
    } catch (err) {
      toast({ title: 'Could not remove screenshots', description: errorMessage(err), variant: 'destructive' });
    }
  };
  const removeSelected = () => remove((rows ?? []).filter((r) => selected.has(r.id)));

  const multiDay = start !== end;
  const groups = useMemo(() => groupByDay(rows), [rows]);
  const nameOf = (id: string) => employees?.find((e) => e.id === id)?.full_name ?? id;
  const appOf = (r: ScreenshotRow) => {
    const url = r.time_activity_logs?.url;
    if (url) {
      try { return new URL(url).hostname.replace(/^www\./, ''); } catch { /* fall through */ }
    }
    return r.time_activity_logs?.app_name ?? '';
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Screenshots" description="Captured only for employees with screenshots enabled under Agent & policy" icon={ImageIcon} />

      <div className={`flex flex-wrap items-end justify-between gap-3 ${STICKY_FILTERS}`}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Date</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => goBy(-1)} aria-label="Previous day or period"><ChevronLeft className="h-4 w-4" /></Button>
              <DateRangeSelect start={start} end={end} setStart={setStart} setEnd={setEnd} only={['today', 'yesterday', 'last7', 'week', 'lastweek', 'month', 'lastmonth']} />
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={end >= todayStr} onClick={() => goBy(1)} aria-label="Next day or period"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">People</p>
            <EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees ?? []} />
          </div>
        </div>

        {canManage && (rows ?? []).length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleAll}>
              <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
              {selected.size === (rows ?? []).length ? 'Deselect all' : 'Toggle all checkboxes'}
            </Button>
            {selected.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove selected ({selected.size})</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {selected.size} screenshot{selected.size === 1 ? '' : 's'}?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently deletes the selected screenshots. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={removeSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {employeeId && retentionDays != null && (
        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Screenshots for this employee are kept for <strong>{retentionDays} days</strong>, then deleted automatically. Change it under Agent &amp; policy.
        </div>
      )}

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (rows ?? []).length === 0 ? (
        <p className="text-center text-muted-foreground py-10">
          No screenshots for {rangeWords(start, end)}. Screenshots are only captured while the desktop app is running with screenshots enabled.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.day} className="space-y-5">
              {/* when the range is more than one day, each day gets its own heading */}
              {multiDay && (
                <h3 className="flex items-baseline gap-2 border-b border-border/60 pb-1 text-sm font-semibold">
                  {format(new Date(`${g.day}T00:00:00`), 'EEEE d MMM yyyy')}
                  <span className="text-xs font-normal text-muted-foreground">{g.rows.length} shown</span>
                </h3>
              )}
          {g.rows.map((r) => (
            <div key={r.id} className={`overflow-hidden rounded-lg border ${selected.has(r.id) ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
              <div className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                  {canManage && <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label="Select screenshot" />}
                  <span className="font-medium">{nameOf(r.employee_id)}</span>
                  <span className="tabular-nums text-muted-foreground">{format(new Date(r.captured_at), 'dd-MM-yyyy HH:mm:ss')}</span>
                  {appOf(r) && <span className="truncate text-muted-foreground">{appOf(r)}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => openViewer(r)}>
                    <ZoomIn className="mr-1.5 h-3.5 w-3.5" /> View large
                  </Button>
                  {canManage && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove screenshot"><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove this screenshot?</AlertDialogTitle>
                          <AlertDialogDescription>This permanently deletes it. This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove([r])} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
              {failed.has(r.id) ? (
                <div className="flex w-full flex-col items-center justify-center gap-2 bg-muted px-4 py-6 text-center text-sm text-muted-foreground" data-testid="screenshot-failed">
                  <p>This screenshot could not be loaded. The file may have been deleted, or it never finished uploading from the desktop app.</p>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => void retry(r)}>Try again</Button>
                </div>
              ) : urls[r.id] ? (
                <button type="button" onClick={() => openViewer(r)} className="block min-h-[3rem] w-full cursor-zoom-in bg-black" aria-label="View full-size screenshot">
                  <img src={urls[r.id]} alt="" className="block h-auto w-full" loading="lazy" onError={() => void onImageError(r)} />
                </button>
              ) : (
                <div className="flex aspect-[16/3] w-full items-center justify-center bg-muted"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
            </div>
          ))}
            </div>
          ))}
          {total > (allRows ?? []).length && (
            <div className="flex flex-col items-center gap-1 pb-4">
              <p className="text-xs text-muted-foreground">Showing the newest {(allRows ?? []).length} of {total}</p>
              <Button variant="outline" size="sm" disabled={isFetching} onClick={() => setLimit((l) => l + SCREENSHOT_PAGE)}>
                {isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Show {Math.min(SCREENSHOT_PAGE, total - (allRows ?? []).length)} more
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-w-[96vw] w-[96vw] p-3 gap-2">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-sm">
              {viewing ? `${nameOf(viewing.employee_id)} — ${format(new Date(viewing.captured_at), 'MMM d, yyyy HH:mm:ss')}${appOf(viewing) ? ` — ${appOf(viewing)}` : ''}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={() => { setLayout((l) => (l === 'stacked' ? 'wide' : 'stacked')); setZoom(1); }}>
              {layout === 'stacked' ? <GalleryHorizontal className="mr-1.5 h-3.5 w-3.5" /> : <Rows3 className="mr-1.5 h-3.5 w-3.5" />}
              {layout === 'stacked' ? 'Side by side' : 'One screen per row'}
            </Button>
            {screenCount > 1 && (
              <div className="flex items-center gap-1" role="group" aria-label="Which screen">
                <Button variant={only == null ? 'default' : 'outline'} size="sm" className="h-8" onClick={() => { setOnly(null); setZoom(1); }}>All screens</Button>
                {Array.from({ length: screenCount }, (_, i) => (
                  <Button key={i} variant={only === i ? 'default' : 'outline'} size="sm" className="h-8 px-3" onClick={() => { setOnly(i); setZoom(1); }} aria-label={`Screen ${i + 1}`}>{i + 1}</Button>
                ))}
              </div>
            )}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => clampZoom(z / 1.25))} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => clampZoom(z * 1.25))} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setZoom(1)}><Maximize2 className="mr-1.5 h-3.5 w-3.5" />Fit</Button>
            <span className="text-xs text-muted-foreground tabular-nums">{Math.round(zoom * 100)}% · + and − keys zoom · {screenCount > 1 ? 'arrow keys change screen · ' : ''}drag to move</span>
          </div>
          <div
            ref={pane}
            className="max-h-[80vh] cursor-grab overflow-auto rounded-md bg-black active:cursor-grabbing"
            onWheel={(e) => { if (e.ctrlKey || e.metaKey) setZoom((z) => clampZoom(e.deltaY < 0 ? z * 1.15 : z / 1.15)); }}
            onMouseDown={(e) => { if (pane.current) drag.current = { x: e.clientX, y: e.clientY, sl: pane.current.scrollLeft, st: pane.current.scrollTop }; }}
            onMouseMove={(e) => { const d = drag.current; if (d && pane.current && e.buttons === 1) { pane.current.scrollLeft = d.sl - (e.clientX - d.x); pane.current.scrollTop = d.st - (e.clientY - d.y); } }}
            onMouseUp={() => { drag.current = null; }}
            onMouseLeave={() => { drag.current = null; }}
          >
            {viewing && urls[viewing.id] && (
              <ScreenPanels
                url={urls[viewing.id]}
                layout={layout}
                zoom={zoom}
                only={only}
                onClickImage={() => setZoom((z) => (z >= 2 ? 1 : 2.5))}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
