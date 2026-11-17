import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { Loader2, Image as ImageIcon, Trash2, CheckSquare, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Rows3, GalleryHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/features/timetrack/lib/trackerEmployees';
import { useTimetrackCapabilities } from '../../lib/capabilities';
import { PageHeader } from '@/features/timetrack/ui/TrackerPageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScreenPanels } from '@/features/timetrack/ui/ScreenPanels';
import { EmployeeSelect } from '@/features/timetrack/ui/EmployeeSelect';
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

const ALL = '__all__';

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
  const [day, setDay] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<ScreenshotRow | null>(null);
  const [zoom, setZoom] = useState(1);
  const [layout, setLayout] = useState<'stacked' | 'wide'>('stacked');
  const openViewer = (r: ScreenshotRow) => { setZoom(1); setViewing(r); };
  const clampZoom = (z: number) => Math.min(6, Math.max(1, Number(z.toFixed(2))));

  const dayDate = new Date(`${day}T00:00:00`);
  const shiftDay = (n: number) => setDay(format(addDays(dayDate, n), 'yyyy-MM-dd'));

  const { data: retentionDays } = useQuery({
    queryKey: ['timetrack', 'agent-retention', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data } = await supabase.from('time_agent_settings').select('retention_days').eq('employee_id', employeeId).maybeSingle();
      return data?.retention_days ?? 30;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['timetrack', 'screenshots', employeeId, day],
    queryFn: async () => {
      let q = supabase
        .from('time_screenshots')
        .select('id, employee_id, storage_path, captured_at, time_activity_logs(app_name, url)')
        .gte('captured_at', startOfDay(dayDate).toISOString())
        .lte('captured_at', endOfDay(dayDate).toISOString())
        // Newest first, so the latest capture is at the top without scrolling.
        .order('captured_at', { ascending: false })
        .limit(300);
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ScreenshotRow[];
    },
  });

  useEffect(() => {
    setSelected(new Set());
  }, [employeeId, day]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = (rows ?? []).filter((r) => !urls[r.id]);
      if (pending.length === 0) return;
      const entries = await Promise.all(pending.map(async (r) => {
        const { data } = await supabase.storage.from('timetrack-screenshots').createSignedUrl(r.storage_path, 900);
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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Date</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDay(-1)} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
              <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-40" />
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDay(1)} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
              {[0, 1, 2].map((back) => {
                const d = format(subDays(new Date(), back), 'yyyy-MM-dd');
                return (
                  <Button key={back} size="sm" variant={day === d ? 'default' : 'outline'} className="h-9 text-xs" onClick={() => setDay(d)}>
                    {back === 0 ? 'Today' : back === 1 ? 'Yesterday' : format(subDays(new Date(), back), 'EEE d MMM')}
                  </Button>
                );
              })}
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
          No screenshots for {format(dayDate, 'd MMM yyyy')}. Screenshots are only captured while the desktop app is running with screenshots enabled.
        </p>
      ) : (
        <div className="space-y-5">
          {(rows ?? []).map((r) => (
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
              {urls[r.id] ? (
                <button type="button" onClick={() => openViewer(r)} className="block w-full cursor-zoom-in bg-black" aria-label="View full-size screenshot">
                  <img src={urls[r.id]} alt="" className="block h-auto w-full" loading="lazy" />
                </button>
              ) : (
                <div className="flex aspect-[16/3] w-full items-center justify-center bg-muted"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
            </div>
          ))}
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
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => clampZoom(z - 0.5))} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => clampZoom(z + 0.5))} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setZoom(1)}><Maximize2 className="mr-1.5 h-3.5 w-3.5" />Fit</Button>
            <span className="text-xs text-muted-foreground tabular-nums">{Math.round(zoom * 100)}% · zoom is optional · scroll to move</span>
          </div>
          <div
            className="max-h-[80vh] overflow-auto rounded-md bg-black"
            onWheel={(e) => { if (e.ctrlKey || e.metaKey) setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.25 : -0.25))); }}
          >
            {viewing && urls[viewing.id] && (
              <ScreenPanels
                url={urls[viewing.id]}
                layout={layout}
                zoom={zoom}
                onClickImage={() => setZoom((z) => (z >= 3 ? 1 : clampZoom(z + 1)))}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
