import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ScreenshotRow { id: string; employee_id: string; storage_path: string; captured_at: string }

/** TimeCamp's "Screenshots" report. Thumbnails are loaded lazily via short-lived signed URLs from
 * the private timetrack-screenshots bucket — never public, matching the RLS on time_screenshots. */
export default function ScreenshotsPage() {
  const { data: employees } = useActiveEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});

  const { data: rows, isLoading } = useQuery({
    queryKey: ['timetrack', 'screenshots', employeeId],
    queryFn: async () => {
      let q = supabase.from('time_screenshots').select('id, employee_id, storage_path, captured_at').order('captured_at', { ascending: false }).limit(60);
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as ScreenshotRow[];
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = (rows ?? []).filter((r) => !urls[r.id]);
      if (pending.length === 0) return;
      const entries = await Promise.all(pending.map(async (r) => {
        const { data } = await supabase.storage.from('timetrack-screenshots').createSignedUrl(r.storage_path, 300);
        return [r.id, data?.signedUrl ?? ''] as const;
      }));
      if (!cancelled) setUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Screenshots" description="Captured only for employees with screenshots enabled under Agent & policy" icon={ImageIcon} />
      <Select value={employeeId} onValueChange={setEmployeeId}>
        <SelectTrigger className="w-64"><SelectValue placeholder="All employees" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="">All employees</SelectItem>
          {(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
        </SelectContent>
      </Select>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="rounded-md border border-border/60 overflow-hidden">
              {urls[r.id] ? (
                <img src={urls[r.id]} alt="" className="w-full aspect-video object-cover bg-muted" loading="lazy" />
              ) : (
                <div className="w-full aspect-video bg-muted flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              )}
              <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
                <span>{employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id}</span>
                <span>{format(new Date(r.captured_at), 'MMM d, HH:mm')}</span>
              </div>
            </div>
          ))}
          {(rows ?? []).length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-6">
              No screenshots yet — only captured when an employee has screenshots enabled under Agent &amp; policy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
