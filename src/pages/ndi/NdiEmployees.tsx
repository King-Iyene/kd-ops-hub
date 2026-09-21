import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Building2, Loader2, UserCheck, Briefcase, ArrowRight,
  Search, Mail, Phone,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AuroraHero } from '@/components/AuroraHero';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useCompanies } from '@/queries';
import { supabase } from '@/lib/supabase';

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  department: { name: string } | null;
  status: string;
  pay_group: { name: string } | null;
}

export default function NdiEmployees() {
  usePageTitle('NDI Employees');
  const { data: companies = [] } = useCompanies();
  const ndi = useMemo(() => companies.find((c) => c.short_code === 'NDI'), [companies]);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!ndi) return;
    setLoading(true);
    try {
      // Get all pay_group IDs that belong to NDI's company
      const { data: pg } = await supabase
        .from('pay_groups')
        .select('id')
        .eq('company_id', ndi.id);

      const pgIds = (pg ?? []).map((g: any) => g.id);

      if (pgIds.length > 0) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, first_name, last_name, email, phone, job_title, department:departments(name), status, pay_group:pay_groups(name)')
          .in('pay_group_id', pgIds)
          .order('first_name');

        setEmployees((emps ?? []) as unknown as EmployeeRow[]);
      } else {
        setEmployees([]);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [ndi]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase();
    return employees.filter((e) =>
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      (e.email ?? '').toLowerCase().includes(q) ||
      (e.job_title ?? '').toLowerCase().includes(q)
    );
  }, [employees, search]);

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
          description="Staff assigned to NDI through pay groups. Employees appear here when their pay group belongs to the NDI company. They remain visible in KDOps too — same person, two views."
          icon={Users}
          badge={<Badge variant="outline" style={{ borderColor: accentColor, color: accentColor }}>NDI</Badge>}
        />
      </AuroraHero>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Inactive / On leave</p>
            <p className="text-xl font-bold text-muted-foreground">{employees.length - activeCount}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No NDI employees yet"
          description="Employees show here when their pay group is assigned to the NDI company. Go to Payroll → Pay Groups, create or edit a group, and set its company to NDI."
        />
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search by name, email, or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Employee list */}
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
                        <p className="font-medium">{e.first_name} {e.last_name}</p>
                        <Badge variant={e.status === 'active' ? 'default' : 'secondary'} className="text-2xs">{e.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {e.job_title || 'No title'}
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
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            {filtered.length === employees.length
              ? `${employees.length} NDI employee${employees.length === 1 ? '' : 's'}`
              : `${filtered.length} of ${employees.length} employees`}
            {' · '}Employees also appear in the main KDOps employee list
          </p>
        </>
      )}
    </div>
  );
}
