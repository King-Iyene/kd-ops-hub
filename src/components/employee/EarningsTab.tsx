import { Plus } from 'lucide-react';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
  earnings: any[];
  canFinance: boolean;
  onShowEarningDialog: () => void;
  onDeactivateEarning: (id: string) => void;
}

export default function EarningsTab({ earnings, canFinance, onShowEarningDialog, onDeactivateEarning }: Props) {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recurring Earnings</CardTitle>
          {canFinance && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onShowEarningDialog}>
              <Plus className="h-4 w-4" /> Add Earning
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {earnings.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No recurring earnings configured. Add allowances like meal, transport, utility, etc.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Description</TableHead>
                    <TableHead className="text-right">Amount (₦)</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Taxable</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {earnings.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-4 font-medium">{e.description}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(e.amount_ngn)}</TableCell>
                      <TableCell className="capitalize text-xs">{e.earning_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="capitalize text-xs">{e.frequency.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{e.is_taxable ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{formatDate(e.start_date)}</TableCell>
                      <TableCell>{e.end_date ? formatDate(e.end_date) : '—'}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${e.status === 'active' ? 'bg-emerald-100 text-emerald-700' : e.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>
                          {e.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {e.status === 'active' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                            onClick={() => onDeactivateEarning(e.id)}>
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
