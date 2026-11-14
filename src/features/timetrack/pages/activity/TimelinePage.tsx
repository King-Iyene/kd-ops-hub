import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORY_BADGE } from './shared';

interface Row { app_name: string | null; window_title: string | null; productivity_category: string | null; captured_at: string }

/** TimeCamp's "Timeline" — one employee, one day, captures collapsed into contiguous
 * same-app blocks and laid out on a 24h bar (consecutive captures of the same app, with
 * no gap bigger than ~3x the capture interval, are treated as one continuous block). */
export default function TimelinePage() {
  const { data: employees } = useActiveEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [day, setDay] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: rows, isLoading } = useQuery({
    queryKey: ['timetrack', 'activity-timeline', employeeId, day],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('time_activity_logs')
        .select('app_name, window_title, productivity_category, captured_at')
        .eq('employee_id', employeeId)
        .gte('captured_at', `${day}T00:00:00`).lt('captured_at', `${day}T23:59:59`)
        .order('captured_at', { ascending: true });
      if (error) throw error;
      return data as Row[];
    },
  });

  const blocks = useMemo(() => {
    const out: { app: string; category: string | null; startMin: number; endMin: number }[] = [];
    for (const r of rows ?? []) {
      const d = new Date(r.captured_at);
      const min = d.getHours() * 60 + d.getMinutes();
      const app = r.app_name ?? 'Unknown';
      const last = out[out.length - 1];
      if (last && last.app === app && min - last.endMin <= 30) {
        last.endMin = min;
      } else {
        out.push({ app, category: r.productivity_category, startMin: min, endMin: min });
      }
    }
    return out;
  }, [rows]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Timeline" description="One employee's captures for a day, collapsed into continuous blocks per application" icon={History} />
      <div className="flex items-end gap-3">
        <div>
          <Label>Employee</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Choose employee" /></SelectTrigger>
            <SelectContent>{(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Day</Label><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
      </div>
      {!employeeId ? (
        <p className="text-muted-foreground text-sm">Choose an employee to see their timeline.</p>
      ) : isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : blocks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No activity captured for this day.</p>
      ) : (
        <div className="space-y-1">
          <div className="relative h-8 rounded-md bg-muted overflow-hidden">
            {blocks.map((b, i) => (
              <div key={i}
                className={`absolute top-0 h-full border-r border-background/60 ${b.category === 'productive' ? 'bg-emerald-500/60' : b.category === 'unproductive' ? 'bg-destructive/60' : 'bg-muted-foreground/40'}`}
                style={{ left: `${(b.startMin / 1440) * 100}%`, width: `${Math.max(0.3, ((b.endMin - b.startMin) / 1440) * 100)}%` }}
                title={`${b.app} — ${format(new Date(0, 0, 0, Math.floor(b.startMin / 60), b.startMin % 60), 'HH:mm')}–${format(new Date(0, 0, 0, Math.floor(b.endMin / 60), b.endMin % 60), 'HH:mm')}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground"><span>00:00</span><span>12:00</span><span>23:59</span></div>
          <div className="mt-4 divide-y divide-border/60">
            {blocks.map((b, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                <span>{b.app}</span>
                <span className="text-muted-foreground">
                  {format(new Date(0, 0, 0, Math.floor(b.startMin / 60), b.startMin % 60), 'HH:mm')}–{format(new Date(0, 0, 0, Math.floor(b.endMin / 60), b.endMin % 60), 'HH:mm')}
                </span>
                {b.category && <span className={`text-xs px-1.5 py-0.5 rounded border ${CATEGORY_BADGE[b.category]}`}>{b.category}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
