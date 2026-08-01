import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui-kit/StatCard';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, TrendingUp, DollarSign, UserCheck, UserMinus, Building2, Activity, Archive,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import HrDataExport from '@/components/hr/HrDataExport';

/**
 * HR Analytics dashboard — headcount, attrition, salary, tenure, gender split,
 * plus a simple org chart. All data is read-only aggregates from profiles,
 * terminations, and departments. Never writes.
 */

const CHART_COLORS = [
  '#0ea5e9', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#eab308',
  '#14b8a6', '#f43f5e', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
];

interface EmployeeSummary {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  status: string | null;
  gender: string | null;
  salary_ngn: number | null;
  department_id: string | null;
  start_date: string | null;
  reporting_manager_id: string | null;
  job_title: string | null;
  departments: { name: string } | null;
}
interface Department {
  id: string;
  name: string;
  head_id: string | null;
}
interface Termination {
  id: string;
  employee_id: string;
  effective_date: string | null;
  reason: string | null;
  rehire_eligible: boolean | null;
}

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const monthsBack = (n: number): string[] => {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
};

const HrAnalytics = () => {
  usePageTitle('HR Analytics');
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [terminations, setTerminations] = useState<Termination[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [pRes, dRes, tRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, full_name, first_name, last_name, role, status, gender, salary_ngn, department_id, start_date, reporting_manager_id, job_title, departments!department_id(name)',
          )
          .limit(2000),
        supabase.from('departments').select('id, name, head_id').order('name'),
        // terminations may not exist on every install
        supabase
          .from('terminations' as any)
          .select('id, employee_id, effective_date, reason, rehire_eligible')
          .order('effective_date', { ascending: false })
          .limit(500)
          .then((r) => ({ data: r.data || [], error: null }))
          .catch(() => ({ data: [] as Termination[], error: null })),
      ]);
      setEmployees((pRes.data as any[]) ?? []);
      setDepartments((dRes.data as Department[]) ?? []);
      setTerminations((tRes as any).data ?? []);
      setLoading(false);
    })();
  }, []);

  const active = useMemo(() => employees.filter((e) => e.status === 'active'), [employees]);
  const invited = useMemo(() => employees.filter((e) => e.status === 'invited').length, [employees]);
  const inactive = useMemo(() => employees.filter((e) => e.status === 'inactive').length, [employees]);

  const totalSalaryBurn = useMemo(
    () => active.reduce((s, e) => s + (Number(e.salary_ngn) || 0), 0),
    [active],
  );
  const avgSalary = active.length ? Math.round(totalSalaryBurn / active.length) : 0;

  // Headcount trend — 12 months, cumulative net (starts + terminations)
  const headcountSeries = useMemo(() => {
    const months = monthsBack(12);
    const startedBy: Record<string, number> = {};
    const endedBy: Record<string, number> = {};
    for (const e of employees) {
      if (e.start_date) {
        const k = e.start_date.slice(0, 7);
        startedBy[k] = (startedBy[k] || 0) + 1;
      }
    }
    for (const t of terminations) {
      if (t.effective_date) {
        const k = t.effective_date.slice(0, 7);
        endedBy[k] = (endedBy[k] || 0) + 1;
      }
    }
    // Baseline: employees whose start_date is before the earliest month
    const earliest = months[0];
    let running = employees.filter((e) => {
      const s = e.start_date?.slice(0, 7);
      return !!s && s < earliest;
    }).length;
    return months.map((m) => {
      running += (startedBy[m] || 0) - (endedBy[m] || 0);
      return {
        month: m,
        headcount: Math.max(0, running),
        joined: startedBy[m] || 0,
        left: endedBy[m] || 0,
      };
    });
  }, [employees, terminations]);

  // Attrition — trailing 12 months
  const attrition12m = useMemo(() => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const leavers = terminations.filter((t) => (t.effective_date || '') >= cutoffStr).length;
    const avgHc = headcountSeries.reduce((s, r) => s + r.headcount, 0) / (headcountSeries.length || 1);
    return {
      leavers,
      rate: avgHc > 0 ? (leavers / avgHc) * 100 : 0,
    };
  }, [terminations, headcountSeries]);

  const byDepartment = useMemo(() => {
    const byId = new Map<string, { name: string; count: number; cost: number }>();
    for (const d of departments) byId.set(d.id, { name: d.name, count: 0, cost: 0 });
    let none = 0;
    let noneCost = 0;
    for (const e of active) {
      if (e.department_id && byId.has(e.department_id)) {
        const row = byId.get(e.department_id)!;
        row.count += 1;
        row.cost += Number(e.salary_ngn) || 0;
      } else {
        none += 1;
        noneCost += Number(e.salary_ngn) || 0;
      }
    }
    const arr = Array.from(byId.values());
    if (none > 0) arr.push({ name: '(No department)', count: none, cost: noneCost });
    return arr.sort((a, b) => b.count - a.count).filter((r) => r.count > 0);
  }, [active, departments]);

  const byGender = useMemo(() => {
    const g: Record<string, number> = { Male: 0, Female: 0, Unspecified: 0 };
    for (const e of active) {
      if (e.gender === 'male') g.Male += 1;
      else if (e.gender === 'female') g.Female += 1;
      else g.Unspecified += 1;
    }
    return Object.entries(g)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [active]);

  const tenureBuckets = useMemo(() => {
    const buckets = [
      { name: '<1 yr', min: 0, max: 1, count: 0 },
      { name: '1-2 yr', min: 1, max: 2, count: 0 },
      { name: '2-5 yr', min: 2, max: 5, count: 0 },
      { name: '5-10 yr', min: 5, max: 10, count: 0 },
      { name: '10+ yr', min: 10, max: 999, count: 0 },
    ];
    for (const e of active) {
      if (!e.start_date) continue;
      const years = (Date.now() - new Date(e.start_date).getTime()) / (365.25 * 86400_000);
      const b = buckets.find((x) => years >= x.min && years < x.max);
      if (b) b.count += 1;
    }
    return buckets;
  }, [active]);

  // Simple org chart — group by manager
  const orgChart = useMemo(() => {
    const byId = new Map<string, EmployeeSummary>();
    for (const e of active) byId.set(e.id, e);
    const reports: Record<string, EmployeeSummary[]> = { __root: [] };
    for (const e of active) {
      const mgr = e.reporting_manager_id;
      if (mgr && byId.has(mgr)) {
        reports[mgr] ??= [];
        reports[mgr].push(e);
      } else {
        reports.__root.push(e);
      }
    }
    return reports;
  }, [active]);

  if (loading) return <TableSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Analytics"
        description="Headcount, attrition, cost per head, gender split, tenure and a simple org chart. Read-only aggregates."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Active headcount"
          value={active.length}
          subtitle={`${invited} invited · ${inactive} inactive`}
          icon={Users}
          tone="primary"
        />
        <StatCard
          title="Monthly salary burn"
          value={formatNaira(totalSalaryBurn)}
          subtitle={`Avg ${formatNaira(avgSalary)} / head`}
          icon={DollarSign}
          tone="success"
        />
        <StatCard
          title="Attrition (12 mo)"
          value={`${attrition12m.rate.toFixed(1)}%`}
          subtitle={`${attrition12m.leavers} leavers`}
          icon={UserMinus}
          tone={attrition12m.rate > 20 ? 'danger' : attrition12m.rate > 10 ? 'warning' : 'success'}
        />
        <StatCard
          title="Departments"
          value={departments.length}
          subtitle={`${byDepartment.filter((d) => d.name !== '(No department)').length} with staff`}
          icon={Building2}
          tone="primary"
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <TrendingUp className="mr-2 h-4 w-4" /> Trends
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Building2 className="mr-2 h-4 w-4" /> Departments
          </TabsTrigger>
          <TabsTrigger value="diversity">
            <Activity className="mr-2 h-4 w-4" /> Diversity & tenure
          </TabsTrigger>
          <TabsTrigger value="org">
            <UserCheck className="mr-2 h-4 w-4" /> Org chart
          </TabsTrigger>
          <TabsTrigger value="export">
            <Archive className="mr-2 h-4 w-4" /> Data export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Headcount over the last 12 months</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={headcountSeries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="headcount"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Joiners vs leavers per month</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={headcountSeries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Legend />
                  <Bar dataKey="joined" fill="#10b981" name="Joined" />
                  <Bar dataKey="left" fill="#f43f5e" name="Left" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Headcount & cost by department
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ResponsiveContainer width="100%" height={Math.max(180, byDepartment.length * 34)}>
                <BarChart layout="vertical" data={byDepartment}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11 }}
                    width={130}
                  />
                  <RTooltip
                    formatter={(v: any, k: string) =>
                      k === 'cost' ? formatNaira(Number(v)) : v
                    }
                  />
                  <Legend />
                  <Bar dataKey="count" fill="#0ea5e9" name="Headcount" />
                </BarChart>
              </ResponsiveContainer>

              <div className="border-t pt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="text-left py-1.5">Department</th>
                      <th className="text-right">Headcount</th>
                      <th className="text-right">Monthly cost</th>
                      <th className="text-right">Avg / head</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDepartment.map((d) => (
                      <tr key={d.name} className="border-t">
                        <td className="py-1.5">{d.name}</td>
                        <td className="text-right">{d.count}</td>
                        <td className="text-right currency">{formatNaira(d.cost)}</td>
                        <td className="text-right currency">
                          {formatNaira(d.count ? Math.round(d.cost / d.count) : 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diversity" className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gender split (active)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={byGender}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    label={(entry: any) => `${entry.name} ${entry.value}`}
                  >
                    {byGender.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tenure distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={tenureBuckets}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Bar dataKey="count" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <HrDataExport />
        </TabsContent>

        <TabsContent value="org" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reporting structure</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Groups by <span className="font-mono">reporting_manager_id</span> on
                each profile. Employees without a manager show at the top.
              </p>
            </CardHeader>
            <CardContent>
              <OrgTree
                nodes={active}
                reports={orgChart}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Minimal recursive tree — one column per level, indented lists inside each.
function OrgTree({
  nodes,
  reports,
}: {
  nodes: EmployeeSummary[];
  reports: Record<string, EmployeeSummary[]>;
}) {
  const roots = reports.__root ?? [];
  if (roots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No root managers — set reporting_manager_id on employees to build the tree.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {roots.map((r) => (
        <TreeNode key={r.id} node={r} reports={reports} depth={0} />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  reports,
  depth,
}: {
  node: EmployeeSummary;
  reports: Record<string, EmployeeSummary[]>;
  depth: number;
}) {
  const kids = reports[node.id] || [];
  const name =
    node.full_name ||
    `${node.first_name || ''} ${node.last_name || ''}`.trim() ||
    'Unnamed';
  return (
    <li>
      <div
        className="flex items-center gap-2 py-1.5 pl-2 pr-3 rounded-md hover:bg-accent/40"
        style={{ marginLeft: depth * 20 }}
      >
        <div
          className="h-7 w-7 rounded-full bg-primary/10 grid place-items-center text-[10px] font-semibold text-primary shrink-0"
          aria-hidden
        >
          {name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() || '')
            .join('')}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {node.job_title || node.role || 'Employee'}
            {node.departments?.name ? ` · ${node.departments.name}` : ''}
            {kids.length > 0 ? ` · ${kids.length} report${kids.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
      </div>
      {kids.length > 0 && (
        <ul className="mt-1 space-y-1">
          {kids.map((c) => (
            <TreeNode key={c.id} node={c} reports={reports} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default HrAnalytics;
