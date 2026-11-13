import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchActiveProjects } from '../lib/queries';

interface PlannerRow { employee_id: string; project_id: string; scheduled_date: string; scheduled_hours: number; actual_hours: number }

export default function PlannerPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { has } = useTimetrackCapabilities();
  const { data: employees } = useActiveEmployees();
  const { data: projects } = useQuery({ queryKey: ['timetrack', 'projects'], queryFn: fetchActiveProjects });
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: rows, isLoading } = useQuery({
    queryKey: ['timetrack', 'planner', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('time_planner_vs_actual', {
        p_start_date: format(weekStart, 'yyyy-MM-dd'), p_end_date: format(addDays(weekStart, 6), 'yyyy-MM-dd'),
      });
      if (error) throw error;
      return data as PlannerRow[];
    },
  });

  const cellValue = (employeeId: string, projectId: string, day: Date) =>
    (rows ?? []).find((r) => r.employee_id === employeeId && r.project_id === projectId && r.scheduled_date === format(day, 'yyyy-MM-dd'));

  const setAssignment = async (employeeId: string, projectId: string, day: Date, hours: number) => {
    try {
      if (hours <= 0) {
        const { error } = await supabase.from('time_planner_assignments').delete()
          .eq('employee_id', employeeId).eq('project_id', projectId).eq('scheduled_date', format(day, 'yyyy-MM-dd'));
        if (error) throw error;
      } else {
        const { error } = await supabase.from('time_planner_assignments').upsert({
          employee_id: employeeId, project_id: projectId, scheduled_date: format(day, 'yyyy-MM-dd'), scheduled_hours: hours,
        }, { onConflict: 'employee_id,project_id,scheduled_date' });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['timetrack', 'planner'] });
    } catch (err) {
      toast({ title: 'Could not save assignment', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const [projectId, setProjectId] = useState('');

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>Prev week</Button>
        <span className="text-sm font-medium">Week of {format(weekStart, 'MMM d, yyyy')}</span>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next week</Button>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-56 ml-auto"><SelectValue placeholder="Filter by project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All projects</SelectItem>
            {(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border-b border-border/60">Employee</th>
              {days.map((d) => <th key={d.toISOString()} className="text-center p-2 border-b border-border/60">{format(d, 'EEE d')}</th>)}
            </tr>
          </thead>
          <tbody>
            {(employees ?? []).map((emp) => {
              const projectsToShow = projectId && projectId !== '__all__' ? (projects ?? []).filter((p) => p.id === projectId) : (projects ?? []);
              return projectsToShow.map((proj, pi) => (
                <tr key={`${emp.id}-${proj.id}`}>
                  {pi === 0 && <td rowSpan={projectsToShow.length} className="p-2 border-b border-border/60 align-top font-medium">{emp.full_name}</td>}
                  {days.map((d) => {
                    const cell = cellValue(emp.id, proj.id, d);
                    return (
                      <td key={d.toISOString()} className="p-1 border-b border-border/60 text-center">
                        {has('manage_planner') ? (
                          <Input
                            type="number" step="0.5" className="h-7 w-14 text-center mx-auto"
                            defaultValue={cell?.scheduled_hours || ''}
                            placeholder={proj.name.slice(0, 3)}
                            onBlur={(e) => setAssignment(emp.id, proj.id, d, Number(e.target.value) || 0)}
                          />
                        ) : (
                          <span>{cell?.scheduled_hours ?? '—'}</span>
                        )}
                        {cell && <p className="text-[10px] text-muted-foreground">act: {cell.actual_hours.toFixed(1)}</p>}
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
