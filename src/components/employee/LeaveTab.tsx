import { CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import LeaveBalancesPanel from '@/components/hr/LeaveBalancesPanel';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { EmployeeData } from './types';

interface Props {
  employeeId: string;
  employee: EmployeeData;
  leaves: any[];
  leaveTaken: number;
}

export default function LeaveTab({ employeeId, employee, leaves, leaveTaken }: Props) {
  return (
    <div className="mt-4">
      <div className="mb-6">
        <LeaveBalancesPanel
          employeeId={employeeId}
          employeeStartDate={employee.start_date}
          employeeGender={employee.gender}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Leave taken</p>
            <p className="text-2xl font-bold">
              {leaveTaken}{' '}
              <span className="text-sm font-normal text-muted-foreground">days</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="text-2xl font-bold">
              {Math.max(0, (employee.annual_leave_days || 20) - leaveTaken)}{' '}
              <span className="text-sm font-normal text-muted-foreground">days</span>
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leave Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leaves.length === 0 ? (
            <EmptyState compact icon={CalendarDays} title="No leave requests" description="Leave requests submitted by this employee will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.map((leave: any) => (
                    <TableRow key={leave.id}>
                      <TableCell className="pl-4 font-medium">{leave.leave_type || leave.type || '—'}</TableCell>
                      <TableCell>{leave.start_date ? formatDate(leave.start_date) : '—'}</TableCell>
                      <TableCell>{leave.end_date ? formatDate(leave.end_date) : '—'}</TableCell>
                      <TableCell>{leave.days ?? '—'}</TableCell>
                      <TableCell className="pr-4">
                        <Badge
                          className={
                            leave.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                              : leave.status === 'rejected' || leave.status === 'denied'
                                ? 'bg-red-100 text-red-700 hover:bg-red-100'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                          }
                        >
                          {leave.status || 'pending'}
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
    </div>
  );
}
