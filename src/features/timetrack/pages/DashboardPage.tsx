import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek } from 'date-fns';
import { Loader2, Clock, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const { profile } = useAuthStore();
  const { has } = useTimetrackCapabilities();

  const { data: myWeek } = useQuery({
    queryKey: ['timetrack', 'my-week-total', profile?.id],
    queryFn: async () => {
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('time_entries').select('duration_minutes, is_billable')
        .eq('employee_id', profile!.id).gte('start_time', weekStart).not('end_time', 'is', null);
      if (error) throw error;
      const rows = data ?? [];
      return {
        total: rows.reduce((s, e) => s + (e.duration_minutes ?? 0), 0) / 60,
        billable: rows.filter((e) => e.is_billable).reduce((s, e) => s + (e.duration_minutes ?? 0), 0) / 60,
      };
    },
    enabled: !!profile?.id,
  });

  const { data: today, isLoading } = useQuery({
    queryKey: ['timetrack', 'dashboard-today'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('time_dashboard_today');
      if (error) throw error;
      return data as { employee_id: string; full_name: string; hours_today: number; is_timer_active: boolean; active_project_name: string | null }[];
    },
    refetchInterval: 30_000,
  });

  const { data: budgetAlerts } = useQuery({
    queryKey: ['timetrack', 'budget-alerts'],
    queryFn: async () => {
      const { data: budgets, error } = await supabase.from('time_project_budgets').select('project_id, time_projects(name)');
      if (error) throw error;
      const results = await Promise.all((budgets ?? []).map(async (b: any) => {
        const { data } = await supabase.rpc('time_project_budget_usage', { p_project_id: b.project_id });
        return { name: b.time_projects?.name, usage: data?.[0] };
      }));
      return results.filter((r) => r.usage?.over_threshold);
    },
    enabled: has('view_others_time'),
  });

  const activeNow = (today ?? []).filter((t) => t.is_timer_active).length;
  const teamHoursToday = (today ?? []).reduce((s, t) => s + t.hours_today, 0);

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Time Tracking"
        description="Your hours, your team's activity, and anything that needs attention"
        icon={Clock}
      />

      <div className="kd-stat-grid kd-stagger-in">
        <StatCard title="My hours this week" value={`${(myWeek?.total ?? 0).toFixed(1)} hrs`} icon={Clock} tone="primary" />
        <StatCard title="Billable this week" value={`${(myWeek?.billable ?? 0).toFixed(1)} hrs`} icon={TrendingUp} tone="success" />
        <StatCard title="Active timers now" value={activeNow} icon={Users} tone={activeNow > 0 ? 'success' : 'default'} />
        {has('view_others_time') && (
          <StatCard title="Team hours today" value={`${teamHoursToday.toFixed(1)} hrs`} icon={Users} tone="info" />
        )}
      </div>

      {budgetAlerts && budgetAlerts.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Project budgets near/over limit</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {budgetAlerts.map((a, i) => (
              <p key={i} className="text-sm">{a.name}: <Badge variant="destructive">{a.usage?.pct_used}% used</Badge></p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Today, by person</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (today ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity logged yet today.</p>
          ) : (
            <div className="space-y-1.5">
              {(today ?? []).sort((a, b) => b.hours_today - a.hours_today).map((r) => (
                <div key={r.employee_id} className="flex items-center justify-between text-sm">
                  <span>{r.full_name}</span>
                  <span className="flex items-center gap-2">
                    {r.is_timer_active && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">active</Badge>}
                    {r.hours_today.toFixed(2)}h
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
