import { CalendarDays } from 'lucide-react';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow } from '@/components/ui-kit/MobileCard';
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
            <>
            <div className="hidden md:block overflow-x-auto">
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
                              ? 'bg-success/10 text-success hover:bg-success/10'
                              : leave.status === 'rejected' || leave.status === 'denied'
                                ? 'bg-destructive/10 text-destructive hover:bg-destructive/10'
                                : 'bg-warning/10 text-warning hover:bg-warning/10'
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
            <div className="md:hidden space-y-2 p-3">
              {leaves.map((leave: any) => (
                <MobileCard key={leave.id}>
                  <MobileCardHeader>
                    <MobileCardTitle>{leave.leave_type || leave.type || '—'}</MobileCardTitle>
                    <MobileCardMeta>
                      <Badge
                        className={
                          leave.status === 'approved'
                            ? 'bg-success/10 text-success hover:bg-success/10'
                            : leave.status === 'rejected' || leave.status === 'denied'
                              ? 'bg-destructive/10 text-destructive hover:bg-destructive/10'
                              : 'bg-warning/10 text-warning hover:bg-warning/10'
                        }
                      >
                        {leave.status || 'pending'}
                      </Badge>
                    </MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Start" value={leave.start_date ? formatDate(leave.start_date) : '—'} />
                  <MobileCardRow label="End" value={leave.end_date ? formatDate(leave.end_date) : '—'} />
                  <MobileCardRow label="Days" value={leave.days ?? '—'} />
                </MobileCard>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
