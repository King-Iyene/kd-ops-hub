import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Users, Wallet, FileText, ArrowRight, Loader2,
  TrendingUp, TrendingDown, DollarSign, UserCheck,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AuroraHero } from '@/components/AuroraHero';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCompanies } from '@/queries';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatNairaCompact } from '@/lib/format';
import {
  fetchNdiAccount,
  fetchNdiBalance,
  fetchNdiLedger,
  type NdiDedicatedAccount,
  type NdiLedgerRow,
} from '@/lib/ndi-finance';

export default function NdiDashboard() {
  usePageTitle('NDI — Niger Delta Innovate');
  const { data: companies = [] } = useCompanies();
  const ndi = useMemo(() => companies.find((c) => c.short_code === 'NDI'), [companies]);

  const [account, setAccount] = useState<NdiDedicatedAccount | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<NdiLedgerRow[]>([]);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndi) return;
    const load = async () => {
      setLoading(true);
      try {
        const [acct, bal, rows] = await Promise.all([
          fetchNdiAccount(ndi.id).catch(() => null),
          fetchNdiBalance(ndi.id).catch(() => 0),
          fetchNdiLedger(ndi.id, 10).catch(() => []),
        ]);
        setAccount(acct);
        setBalance(bal);
        setLedger(rows);

        // Count employees via their pay groups
        const { data: pgData } = await supabase
          .from('pay_groups')
          .select('id')
          .eq('company_id', ndi.id);
        const pgIds = (pgData ?? []).map((g: any) => g.id);
        if (pgIds.length > 0) {
          const { count } = await supabase
            .from('employees')
            .select('id', { count: 'exact', head: true })
            .in('pay_group_id', pgIds);
          setEmployeeCount(count ?? 0);
        } else {
          setEmployeeCount(0);
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [ndi]);

  const stats = useMemo(() => {
    const totalIn = ledger.filter((r) => r.direction === 'credit').reduce((s, r) => s + Number(r.amount_ngn), 0);
    const totalOut = ledger.filter((r) => r.direction === 'debit').reduce((s, r) => s + Number(r.amount_ngn), 0);
    return { totalIn, totalOut, txCount: ledger.length };
  }, [ledger]);

  if (!ndi) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">NDI company not found. Ensure it exists in the companies table.</p>
        </div>
      </div>
    );
  }

  const accentColor = ndi.color || '#E84D1A';

  return (
    <div className="space-y-5">
      <AuroraHero
        className="p-5 sm:p-6"
        pattern="nest"
        patternColor={accentColor}
      >
        <PageHeader
          className="mb-0"
          title="Niger Delta Innovate"
          description="NDI's standalone organizational hub — employees, finance, and reporting, fully isolated from KD Squares."
          icon={Building2}
          badge={<Badge variant="outline" style={{ borderColor: accentColor, color: accentColor }}>NDI</Badge>}
        />
      </AuroraHero>

      {/* Quick-nav cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickCard
          to="/ndi/finance"
          icon={Wallet}
          label="Finance"
          value={balance !== null ? formatNaira(balance) : '—'}
          sub={account ? `${account.bank_name} · ${account.account_number}` : 'No dedicated account'}
          color={accentColor}
          loading={loading}
        />
        <QuickCard
          to="/ndi/employees"
          icon={Users}
          label="Employees"
          value={employeeCount !== null ? String(employeeCount) : '—'}
          sub="NDI staff"
          color={accentColor}
          loading={loading}
        />
        <QuickCard
          to="/ndi/finance"
          icon={TrendingUp}
          label="Funded"
          value={formatNairaCompact(stats.totalIn)}
          sub="Recent credits"
          color="#22c55e"
          loading={loading}
        />
        <QuickCard
          to="/ndi/finance"
          icon={TrendingDown}
          label="Disbursed"
          value={formatNairaCompact(stats.totalOut)}
          sub="Recent debits"
          color="#ef4444"
          loading={loading}
        />
      </div>

      {/* Module links */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ModuleLink
          to="/ndi/finance"
          icon={DollarSign}
          title="Finance & Wallet"
          desc="Dedicated account, ledger, disbursements, beneficiaries, reporting"
          color={accentColor}
        />
        <ModuleLink
          to="/ndi/employees"
          icon={UserCheck}
          title="Employees"
          desc="NDI staff, pay groups, and payroll integration"
          color={accentColor}
        />
        <ModuleLink
          to="/ndi/profile"
          icon={FileText}
          title="Profile & Branding"
          desc="NDI registration details, logo, and document identity"
          color={accentColor}
        />
      </div>

      {/* Recent ledger */}
      {ledger.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              <Link to="/ndi/finance" className="text-xs text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/60">
              {ledger.slice(0, 5).map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.description || row.category}</p>
                    <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`font-medium shrink-0 ${row.direction === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                    {row.direction === 'credit' ? '+' : '−'}{formatNaira(row.amount_ngn)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuickCard({ to, icon: Icon, label, value, sub, color, loading }: {
  to: string; icon: typeof Wallet; label: string; value: string; sub: string; color: string; loading: boolean;
}) {
  return (
    <Link to={to} className="block">
      <Card className="relative overflow-hidden hover:shadow-md transition-shadow group">
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: color }} />
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Icon className="h-3.5 w-3.5" style={{ color }} />
            <span className="uppercase tracking-wide font-medium">{label}</span>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
          ) : (
            <>
              <p className="text-xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function ModuleLink({ to, icon: Icon, title, desc, color }: {
  to: string; icon: typeof DollarSign; title: string; desc: string; color: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="relative overflow-hidden hover:shadow-md transition-all group h-full">
        <div className="absolute inset-0 opacity-[0.03]" style={{ background: `linear-gradient(135deg, ${color}, transparent)` }} />
        <CardContent className="p-4 relative flex items-start gap-3">
          <div className="rounded-lg p-2" style={{ backgroundColor: `${color}15` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{title}</h3>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
