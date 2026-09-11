import { Receipt } from 'lucide-react';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow } from '@/components/ui-kit/MobileCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
  expenses: any[];
}

export default function ExpensesTab({ expenses }: Props) {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Expenses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {expenses.length === 0 ? (
            <EmptyState compact icon={Receipt} title="No expenses raised" description="Expense claims submitted by this employee will appear here." />
          ) : (
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense: any) => (
                    <TableRow key={expense.id}>
                      <TableCell className="pl-4">{formatDate(expense.created_at)}</TableCell>
                      <TableCell className="font-medium">{expense.description || '—'}</TableCell>
                      <TableCell>{expense.category || '—'}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(expense.amount || 0)}</TableCell>
                      <TableCell className="pr-4">
                        <Badge
                          className={
                            expense.status === 'approved'
                              ? 'bg-success/10 text-success hover:bg-success/10'
                              : expense.status === 'rejected' || expense.status === 'denied'
                                ? 'bg-destructive/10 text-destructive hover:bg-destructive/10'
                                : 'bg-warning/10 text-warning hover:bg-warning/10'
                          }
                        >
                          {expense.status || 'pending'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden space-y-2 p-3">
              {expenses.map((expense: any) => (
                <MobileCard key={expense.id}>
                  <MobileCardHeader>
                    <MobileCardTitle>{expense.description || '—'}</MobileCardTitle>
                    <MobileCardMeta>
                      <Badge
                        className={
                          expense.status === 'approved'
                            ? 'bg-success/10 text-success hover:bg-success/10'
                            : expense.status === 'rejected' || expense.status === 'denied'
                              ? 'bg-destructive/10 text-destructive hover:bg-destructive/10'
                              : 'bg-warning/10 text-warning hover:bg-warning/10'
                        }
                      >
                        {expense.status || 'pending'}
                      </Badge>
                    </MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Date" value={formatDate(expense.created_at)} />
                  <MobileCardRow label="Category" value={expense.category || '—'} />
                  <MobileCardRow label="Amount" value={<span className="font-medium">{formatNaira(expense.amount || 0)}</span>} />
                </MobileCard>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
