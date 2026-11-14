import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek } from 'date-fns';
import { Loader2, Clock, Users, TrendingUp, AlertTriangle, Download, Search, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toCsv, downloadCsv } from '@/lib/csv';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function DashboardPage() {
  const { profile } = useAuthStore();
  const { has } = useTimetrackCapabilities();
  const canViewOthers = has('view_others_time');
  const [search, setSearch] = useState('');

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

  // Server-side scoped: the RPC only ever returns rows the caller is
  // permitted to see — everyone when the caller has `view_others_time`
  // (admins, or a time role granted it), otherwise just the caller's own
  // row. Verified against time_dashboard_today()'s WHERE clause: this is
  // not a client-side filter layered on top of an already-broad query.
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
    enabled: canViewOthers,
  });

  const activeNow = (today ?? []).filter((t) => t.is_timer_active).length;
  const teamHoursToday = (today ?? []).reduce((s, t) => s + t.hours_today, 0);
  const myToday = (today ?? []).find((t) => t.employee_id === profile?.id);

  const roster = useMemo(() => {
    const rows = (today ?? []).slice().sort((a, b) => {
      if (a.is_timer_active !== b.is_timer_active) return a.is_timer_active ? -1 : 1;
      return b.hours_today - a.hours_today;
    });
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [today, search]);

  const handleDownload = () => {
    const rows = canViewOthers ? roster : (myToday ? [myToday] : []);
    const header = ['Name', 'Hours today', 'Active now', 'Current project'];
    const body = rows.map((r) => [r.full_name, r.hours_today.toFixed(2), r.is_timer_active ? 'Yes' : 'No', r.active_project_name ?? '']);
    downloadCsv(`timetrack-today-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCsv(header, body));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Time Tracking"
        description="Your hours, your team's activity, and anything that needs attention"
        icon={Clock}
        actions={
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={isLoading || (today ?? []).length === 0}>
            <Download className="h-4 w-4 mr-1.5" />
            Download CSV
          </Button>
        }
      />

      <div className="kd-stat-grid kd-stagger-in">
        <StatCard title="My hours this week" value={`${(myWeek?.total ?? 0).toFixed(1)} hrs`} icon={Clock} tone="primary" />
        <StatCard title="Billable this week" value={`${(myWeek?.billable ?? 0).toFixed(1)} hrs`} icon={TrendingUp} tone="success" />
        {canViewOthers ? (
          <>
            <StatCard title="Active timers now" value={activeNow} icon={Users} tone={activeNow > 0 ? 'success' : 'default'} />
            <StatCard title="Team hours today" value={`${teamHoursToday.toFixed(1)} hrs`} icon={Users} tone="info" />
          </>
        ) : (
          <StatCard
            title="My hours today"
            value={`${(myToday?.hours_today ?? 0).toFixed(1)} hrs`}
            icon={Clock}
            tone={myToday?.is_timer_active ? 'success' : 'default'}
          />
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

      {canViewOthers ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm">Today, by person</CardTitle>
            <div className="relative w-full max-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : roster.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {search ? 'No one matches that name.' : 'No activity logged yet today.'}
              </p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto -mx-1 px-1 divide-y divide-border/60">
                {roster.map((r) => (
                  <div key={r.employee_id} className="flex items-center gap-3 py-2 px-1 rounded-md hover:bg-muted/40 transition-colors">
                    <Avatar className="h-8 w-8" status={r.is_timer_active ? 'online' : undefined}>
                      <AvatarFallback className="text-2xs font-semibold bg-primary/10 text-primary">
                        {initials(r.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.full_name}</p>
                      {r.is_timer_active && r.active_project_name && (
                        <p className="text-3xs text-muted-foreground truncate">on {r.active_project_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.is_timer_active && (
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-3xs">active</Badge>
                      )}
                      <span className="text-sm font-mono tabular-nums w-14 text-right">{r.hours_today.toFixed(2)}h</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />Your day</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  {myToday?.is_timer_active && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">active now</Badge>}
                  {myToday?.is_timer_active && myToday.active_project_name ? `on ${myToday.active_project_name}` : 'No activity logged yet today.'}
                </span>
                <span className="font-mono tabular-nums font-medium">{(myToday?.hours_today ?? 0).toFixed(2)}h</span>
              </div>
            )}
            <p className="text-3xs text-muted-foreground mt-3">
              Only admins and roles granted "view others' time" can see the rest of the team's hours here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
