import { Plus } from 'lucide-react';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
  increments: any[];
  canManage: boolean;
  onShowIncrementDialog: () => void;
}

export default function IncrementsTab({ increments, canManage, onShowIncrementDialog }: Props) {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Salary Increments</CardTitle>
          {canManage && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onShowIncrementDialog}>
              <Plus className="h-4 w-4" /> Add Increment
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {increments.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No salary increments recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead className="text-right">Previous Salary</TableHead>
                    <TableHead className="text-right">New Salary</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="pr-4">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {increments.map((inc: any) => {
                    const diff = (inc.new_salary_ngn || 0) - (inc.old_salary_ngn || 0);
                    return (
                      <TableRow key={inc.id}>
                        <TableCell className="pl-4">{formatDate(inc.effective_date)}</TableCell>
                        <TableCell className="text-right currency">{formatNaira(inc.old_salary_ngn || 0)}</TableCell>
                        <TableCell className="text-right currency">{formatNaira(inc.new_salary_ngn || 0)}</TableCell>
                        <TableCell className="text-right currency">
                          <span className={diff >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                            {diff >= 0 ? '+' : ''}{formatNaira(diff)}
                          </span>
                        </TableCell>
                        <TableCell className="pr-4 text-muted-foreground">{inc.reason || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
