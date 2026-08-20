import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
  advances: any[];
}

export default function AdvancesTab({ advances }: Props) {
  if (advances.length === 0) {
    return (
      <div className="mt-4 space-y-4">
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No salary advances recorded.</CardContent></Card>
      </div>
    );
  }

  const active = advances.filter((a) => a.status === 'active');
  const totalOutstanding = active.reduce((s: number, a: any) => s + (a.outstanding_ngn || 0), 0);
  const totalDeduction = active.reduce((s: number, a: any) => s + (a.deduction_per_month || 0), 0);

  return (
    <div className="mt-4 space-y-4">
      {active.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Outstanding</p>
              <p className="text-2xl font-bold text-destructive currency">{formatNaira(totalOutstanding)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Monthly Deduction</p>
              <p className="text-2xl font-bold currency">{formatNaira(totalDeduction)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Active Advances</p>
              <p className="text-2xl font-bold">{active.length}</p>
            </CardContent>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Advance History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Monthly Deduction</TableHead>
                  <TableHead className="text-right">Months</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((a: any) => {
                  const repaid = a.amount_ngn - a.outstanding_ngn;
                  const pct = a.amount_ngn > 0 ? Math.round((repaid / a.amount_ngn) * 100) : 0;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-muted-foreground">{formatDate(a.created_at)}</TableCell>
                      <TableCell>{a.start_period || '—'}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(a.amount_ngn)}</TableCell>
                      <TableCell className="text-right currency font-semibold">{formatNaira(a.outstanding_ngn)}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(a.deduction_per_month)}</TableCell>
                      <TableCell className="text-right">{a.repayment_months}m</TableCell>
                      <TableCell>
                        <Badge variant={a.status === 'active' ? 'destructive' : a.status === 'settled' ? 'default' : 'secondary'}>
                          {a.status === 'active' ? `${pct}% repaid` : a.status}
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
    </div>
  );
}
