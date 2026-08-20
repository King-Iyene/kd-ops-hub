import { Plus } from 'lucide-react';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
  deductions: any[];
  canFinance: boolean;
  onShowDeductionDialog: () => void;
  onDeactivateDeduction: (id: string) => void;
}

export default function DeductionsTab({ deductions, canFinance, onShowDeductionDialog, onDeactivateDeduction }: Props) {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Deductions</CardTitle>
          {canFinance && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onShowDeductionDialog}>
              <Plus className="h-4 w-4" /> Add Deduction
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {deductions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No deductions configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Description</TableHead>
                    <TableHead className="text-right">Amount (₦)</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="text-right">Deducted to Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deductions.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="pl-4 font-medium">{d.description}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(d.amount_ngn)}</TableCell>
                      <TableCell className="capitalize">{d.frequency.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{formatDate(d.start_date)}</TableCell>
                      <TableCell>{d.end_date ? formatDate(d.end_date) : '—'}</TableCell>
                      <TableCell className="text-right currency">
                        {formatNaira(d.amount_deducted_to_date || 0)}
                        {d.total_deductible_amount ? (
                          <span className="text-xs text-muted-foreground"> / {formatNaira(d.total_deductible_amount)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${d.status === 'active' ? 'bg-emerald-100 text-emerald-700' : d.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>
                          {d.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {d.status === 'active' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                            onClick={() => onDeactivateDeduction(d.id)}>
                            Pause
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
