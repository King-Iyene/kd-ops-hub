import { useNavigate, Link } from 'react-router-dom';
import { Briefcase, ChevronRight, Receipt } from 'lucide-react';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow } from '@/components/ui-kit/MobileCard';
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
    active: 'bg-success/10 text-success',
    completed: 'bg-muted text-muted-foreground',
    suspended: 'bg-warning/10 text-warning',
    pending: 'bg-primary/10 text-primary',
  };
  const payBadge: Record<string, string> = {
    paid: 'bg-success/10 text-success',
    pending: 'bg-warning/10 text-warning',
    overdue: 'bg-destructive/10 text-destructive',
    partial: 'bg-primary/10 text-primary',
    waived: 'bg-muted text-muted-foreground',
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
            <>
            <div className="hidden md:block overflow-x-auto">
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
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/clients/${p.client_id}`)} onAuxClick={(ev) => { if (ev.button === 1) { window.open(`/clients/${p.client_id}`, '_blank'); ev.preventDefault(); } }}>
                      <TableCell className="pl-4 font-medium"><Link to={`/clients/${p.client_id}`} className="hover:underline" onClick={(e) => e.preventDefault()}>{p.clients?.name || '—'}</Link></TableCell>
                      <TableCell>
                        <Badge variant="secondary">{catLabels[p.placement_category] || p.placement_category}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.placement_type === 'kd_receives' ? 'KD Receives' : 'Employee Receives'}
                      </TableCell>
                      <TableCell className="text-right font-medium currency">{formatNaira(p.client_rate_ngn)}</TableCell>
                      <TableCell className="text-right font-medium text-success currency">
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
            <div className="md:hidden space-y-2 p-3">
              {empPlacements.map((p: any) => (
                <MobileCard key={p.id} onClick={() => navigate(`/clients/${p.client_id}`)}>
                  <MobileCardHeader>
                    <MobileCardTitle>{p.clients?.name || '—'}</MobileCardTitle>
                    <MobileCardMeta className="flex items-center gap-1.5">
                      <Badge className={statusColors[p.status] || 'bg-muted text-muted-foreground'}>{p.status}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Category" value={<Badge variant="secondary">{catLabels[p.placement_category] || p.placement_category}</Badge>} />
                  <MobileCardRow label="Earnings" value={<span className="text-success font-medium">{formatNaira(p.employee_rate_ngn)}</span>} />
                  <MobileCardRow label="Commission" value={`${formatNaira(p.commission_ngn)} (${p.commission_pct}%)`} />
                  <MobileCardRow label="Period" value={`${formatDate(p.start_date)} — ${p.end_date ? formatDate(p.end_date) : 'Ongoing'}`} />
                </MobileCard>
              ))}
            </div>
            </>
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
            <div className="hidden md:block overflow-x-auto">
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
                        <TableCell className="text-right font-medium text-success currency">
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
            <div className="md:hidden space-y-2 p-3">
              {empPlacementPayments.slice(0, 24).map((pp: any) => {
                const placement = empPlacements.find((p: any) => p.id === pp.placement_id);
                return (
                  <MobileCard key={pp.id}>
                    <MobileCardHeader>
                      <MobileCardTitle>{formatDate(pp.month)}</MobileCardTitle>
                      <MobileCardMeta>
                        <Badge className={payBadge[pp.status] || 'bg-muted text-muted-foreground'}>{pp.status}</Badge>
                      </MobileCardMeta>
                    </MobileCardHeader>
                    <MobileCardRow label="Client" value={placement?.clients?.name || '—'} />
                    <MobileCardRow label="Gross" value={formatNaira(pp.gross_amount_ngn)} />
                    <MobileCardRow label="Net Earnings" value={<span className="text-success font-medium">{formatNaira(pp.net_employee_ngn)}</span>} />
                  </MobileCard>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
