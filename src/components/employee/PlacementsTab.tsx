import { useNavigate } from 'react-router-dom';
import { Briefcase, Receipt } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { StatCard } from '@/components/ui-kit/StatCard';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
  empPlacements: any[];
  empPlacementPayments: any[];
}

export default function PlacementsTab({ empPlacements, empPlacementPayments }: Props) {
  const navigate = useNavigate();
  const activePl = empPlacements.filter((p: any) => p.status === 'active');
  const totalMonthlyEarning = activePl.reduce((s: number, p: any) => s + Number(p.employee_rate_ngn || 0), 0);
  const totalMonthlyCommission = activePl.reduce((s: number, p: any) => s + Number(p.commission_ngn || 0), 0);
  const paidPayments = empPlacementPayments.filter((pp: any) => pp.status === 'paid');
  const totalEarned = paidPayments.reduce((s: number, pp: any) => s + Number(pp.net_employee_ngn || 0), 0);

  const catLabels: Record<string, string> = {
    security: 'Security', cleaning: 'Cleaning', logistics: 'Logistics',
    technical: 'Technical', administrative: 'Admin', hospitality: 'Hospitality',
    maintenance: 'Maintenance', general: 'General',
  };
  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
    completed: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
    suspended: 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400',
    pending: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
  };
  const payBadge: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400',
    overdue: 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400',
    partial: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
    waived: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Placements" value={activePl.length} icon={Briefcase} tone="primary" />
        <StatCard title="Monthly Earnings" value={formatNaira(totalMonthlyEarning)} tone="success" subtitle="From all active placements" />
        <StatCard title="KD Commission" value={formatNaira(totalMonthlyCommission)} tone="gold" subtitle="Monthly deduction" />
        <StatCard title="Total Earned" value={formatNaira(totalEarned)} tone="primary" subtitle="All-time paid" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            Placement Assignments
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {empPlacements.length === 0 ? (
            <EmptyState compact icon={Briefcase} title="No placements" description="This employee has not been assigned to any client placement." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Client</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Client Rate</TableHead>
                    <TableHead className="text-right">Your Earnings</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empPlacements.map((p: any) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/clients/${p.client_id}`)}>
                      <TableCell className="pl-4 font-medium">{p.clients?.name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{catLabels[p.placement_category] || p.placement_category}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.placement_type === 'kd_receives' ? 'KD Receives' : 'Employee Receives'}
                      </TableCell>
                      <TableCell className="text-right font-medium currency">{formatNaira(p.client_rate_ngn)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400 currency">
                        {formatNaira(p.employee_rate_ngn)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground currency">
                        {formatNaira(p.commission_ngn)} ({p.commission_pct}%)
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(p.start_date)} — {p.end_date ? formatDate(p.end_date) : 'Ongoing'}
                      </TableCell>
                      <TableCell className="pr-4">
                        <Badge className={statusColors[p.status] || 'bg-muted text-muted-foreground'}>
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {empPlacementPayments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Month</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Net Earnings</TableHead>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empPlacementPayments.slice(0, 24).map((pp: any) => {
                    const placement = empPlacements.find((p: any) => p.id === pp.placement_id);
                    return (
                      <TableRow key={pp.id}>
                        <TableCell className="pl-4 font-medium">{formatDate(pp.month)}</TableCell>
                        <TableCell className="text-sm">{placement?.clients?.name || '—'}</TableCell>
                        <TableCell className="text-right currency">{formatNaira(pp.gross_amount_ngn)}</TableCell>
                        <TableCell className="text-right text-muted-foreground currency">{formatNaira(pp.commission_ngn)}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400 currency">
                          {formatNaira(pp.net_employee_ngn)}
                        </TableCell>
                        <TableCell className="pr-4">
                          <Badge className={payBadge[pp.status] || 'bg-muted text-muted-foreground'}>
                            {pp.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
