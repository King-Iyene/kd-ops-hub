import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Building2, Loader2, ArrowRight,
  Search, Mail, FolderOpen, UserPlus,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AuroraHero } from '@/components/AuroraHero';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCompanies } from '@/queries';
import { supabase } from '@/lib/supabase';

interface PayGroupRow {
  id: string;
  name: string;
  employee_count: number;
}

interface EmployeeRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  department: { name: string } | null;
  status: string;
  pay_group: { name: string } | null;
  pay_group_id: string | null;
}

export default function NdiEmployees() {
  usePageTitle('NDI Employees');
  const { data: companies = [] } = useCompanies();
  const ndi = useMemo(() => companies.find((c) => c.short_code === 'NDI'), [companies]);

  const [payGroups, setPayGroups] = useState<PayGroupRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPg, setFilterPg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ndi) return;
    setLoading(true);
    try {
      const { data: pg } = await supabase
        .from('pay_groups')
        .select('id, name')
        .eq('company_id', ndi.id)
        .order('name');

      const pgRows = (pg ?? []) as { id: string; name: string }[];
      const pgIds = pgRows.map((g) => g.id);

      let emps: EmployeeRow[] = [];
      if (pgIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email, role, department:departments!department_id(name), status, pay_group:pay_groups!profiles_pay_group_id_fkey(name), pay_group_id')
          .in('pay_group_id', pgIds)
          .order('first_name');
        emps = (data ?? []) as unknown as EmployeeRow[];
      }

      setPayGroups(pgRows.map((g) => ({
        ...g,
        employee_count: emps.filter((e) => e.pay_group_id === g.id).length,
      })));
      setEmployees(emps);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [ndi]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let list = employees;
    if (filterPg) list = list.filter((e) => e.pay_group_id === filterPg);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    const displayName = (emp: EmployeeRow) =>
      emp.full_name || `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim();
    return list.filter((e) =>
      displayName(e).toLowerCase().includes(q) ||
      (e.email ?? '').toLowerCase().includes(q) ||
      (e.role ?? '').toLowerCase().includes(q)
    );
  }, [employees, search, filterPg]);

  const activeCount = employees.filter((e) => e.status === 'active').length;

  if (!ndi) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground ml-3">NDI company not found.</p>
      </div>
    );
  }

  const accentColor = ndi.color || '#E84D1A';

  return (
    <div className="space-y-4">
      <AuroraHero className="p-5 sm:p-6" pattern="nest" patternColor={accentColor}>
        <PageHeader
          className="mb-0"
          title="NDI Employees"
          description="All staff under Niger Delta Innovate. Pay groups handle salary runs — employees belong to NDI through their pay group's company assignment."
          icon={Users}
          badge={<Badge variant="outline" style={{ borderColor: accentColor, color: accentColor }}>NDI</Badge>}
        />
      </AuroraHero>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total staff</p>
            <p className="text-xl font-bold" style={{ color: accentColor }}>{employees.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-xl font-bold text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pay groups</p>
            <p className="text-xl font-bold" style={{ color: accentColor }}>{payGroups.length}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Pay groups — always visible */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" style={{ color: accentColor }} />
                  NDI Pay Groups
                </h3>
                <Link to="/payroll" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Manage in Payroll <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {payGroups.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">No pay groups assigned to NDI yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Go to Payroll → Pay Groups, create or edit a group, and set its Company to NDI.</p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {payGroups.map((pg) => (
                    <button
                      key={pg.id}
                      onClick={() => setFilterPg(filterPg === pg.id ? null : pg.id)}
                      className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                        filterPg === pg.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border/60 hover:border-border hover:bg-muted/30'
                      }`}
                    >
                      <div>
                        <p className="font-medium">{pg.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {pg.employee_count} employee{pg.employee_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {filterPg === pg.id && (
                        <Badge variant="default" className="text-2xs">Filtered</Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {employees.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center space-y-3">
                <UserPlus className="h-10 w-10 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-semibold">No NDI employees yet</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    {payGroups.length > 0
                      ? `The NDI pay group${payGroups.length > 1 ? 's exist' : ' exists'} but no employees are assigned yet. Go to the main Employees page, edit an employee's profile, and set their pay group to an NDI group.`
                      : 'First create a pay group with Company set to NDI in Payroll, then assign employees to it.'}
                  </p>
                </div>
                <Link to="/employees">
                  <Button size="sm" className="mt-2" style={{ backgroundColor: accentColor }}>
                    <UserPlus className="mr-2 h-4 w-4" /> Go to Employees
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder="Search by name, email, or title…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {filterPg && (
                  <Button size="sm" variant="outline" onClick={() => setFilterPg(null)} className="h-8 text-xs">
                    Clear filter
                  </Button>
                )}
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {filtered.map((e) => (
                      <Link
                        key={e.id}
                        to={`/employees/${e.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{e.full_name || `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'Unnamed'}</p>
                            <Badge variant={e.status === 'active' ? 'default' : 'secondary'} className="text-2xs">{e.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {e.role || 'No role'}
                            {e.department ? ` · ${(e.department as any).name}` : ''}
                            {e.pay_group ? ` · ${(e.pay_group as any).name}` : ''}
                          </p>
                          {e.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" /> {e.email}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </Link>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-6">No employees match your search.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground text-center">
                {filtered.length === employees.length
                  ? `${employees.length} NDI employee${employees.length === 1 ? '' : 's'}`
                  : `${filtered.length} of ${employees.length} employees`}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
