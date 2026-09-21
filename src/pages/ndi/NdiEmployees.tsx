import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Building2, Loader2, UserCheck, Briefcase, ArrowRight,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AuroraHero } from '@/components/AuroraHero';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCompanies } from '@/queries';
import { supabase } from '@/lib/supabase';

interface PayGroupRow {
  id: string;
  name: string;
  employee_count: number;
}

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  job_title: string | null;
  department: { name: string } | null;
  status: string;
}

export default function NdiEmployees() {
  usePageTitle('NDI Employees');
  const { data: companies = [] } = useCompanies();
  const ndi = useMemo(() => companies.find((c) => c.short_code === 'NDI'), [companies]);

  const [payGroups, setPayGroups] = useState<PayGroupRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndi) return;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch NDI pay groups
        const { data: pg } = await supabase
          .from('pay_groups')
          .select('id, name')
          .eq('company_id', ndi.id)
          .order('name');

        const groups = (pg ?? []) as PayGroupRow[];

        if (groups.length > 0) {
          // Fetch employees in those pay groups
          const pgIds = groups.map((g) => g.id);
          const { data: emps } = await supabase
            .from('employees')
            .select('id, first_name, last_name, email, job_title, department:departments(name), status, pay_group_id')
            .in('pay_group_id', pgIds)
            .order('first_name');

          setEmployees((emps ?? []) as unknown as EmployeeRow[]);

          // Count employees per group
          const counts: Record<string, number> = {};
          (emps ?? []).forEach((e: any) => {
            const pgId = e.pay_group_id;
            counts[pgId] = (counts[pgId] || 0) + 1;
          });
          setPayGroups(groups.map((g) => ({ ...g, employee_count: counts[g.id] || 0 })));
        } else {
          setPayGroups([]);
          setEmployees([]);
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [ndi]);

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
          description="Staff assigned to NDI pay groups. Employees belong to NDI through their pay group assignment — the same person can serve both KD Squares and NDI."
          icon={Users}
          badge={<Badge variant="outline" style={{ borderColor: accentColor, color: accentColor }}>NDI</Badge>}
        />
      </AuroraHero>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : payGroups.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No NDI pay groups yet"
          description="Create a pay group scoped to NDI in the Payroll module, then assign employees to it. They'll appear here automatically."
        />
      ) : (
        <>
          {/* Pay groups summary */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {payGroups.map((pg) => (
              <Card key={pg.id} className="relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentColor }} />
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="h-4 w-4" style={{ color: accentColor }} />
                    <span className="font-semibold text-sm">{pg.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{pg.employee_count} employee{pg.employee_count !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Employee list */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <UserCheck className="h-4 w-4" /> NDI Staff ({employees.length})
                </h3>
              </div>
              {employees.length === 0 ? (
                <EmptyState icon={Users} title="No employees assigned" description="Assign employees to an NDI pay group." compact />
              ) : (
                <div className="rounded-lg border border-border/60 divide-y">
                  {employees.map((e) => (
                    <Link
                      key={e.id}
                      to={`/employees/${e.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{e.first_name} {e.last_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.job_title || 'No title'}
                          {e.department ? ` · ${(e.department as any).name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={e.status === 'active' ? 'default' : 'secondary'} className="text-2xs">{e.status}</Badge>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
