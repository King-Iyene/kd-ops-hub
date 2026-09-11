import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
} from '@/components/ui-kit/MobileCard';

// ---------------------------------------------------------------------------
// ActivityTab
// ---------------------------------------------------------------------------

export interface ActivityTabProps {
  activityLogs: any[];
}

export function ActivityTab({ activityLogs }: ActivityTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fleet Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">
                        No fleet activity recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {activityLogs.map((log: any) => (
                    <TableRow key={log.id} className="hover:bg-muted/40 kd-transition">
                      <TableCell className="font-medium capitalize">
                        {(log.action_type || '').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-sm truncate">
                        {log.description || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.performed_by_name || log.performed_by?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.created_at ? formatDate(log.created_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="md:hidden space-y-2 p-3">
            {activityLogs.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                No fleet activity recorded yet.
              </p>
            )}
            {activityLogs.map((log: any) => (
              <MobileCard key={log.id}>
                <MobileCardHeader>
                  <MobileCardTitle className="capitalize">
                    {(log.action_type || '').replace(/_/g, ' ')}
                  </MobileCardTitle>
                  <MobileCardMeta className="text-muted-foreground text-xs">
                    {log.created_at ? formatDate(log.created_at) : '—'}
                  </MobileCardMeta>
                </MobileCardHeader>
                <MobileCardRow label="Details">
                  {log.description || '—'}
                </MobileCardRow>
                <MobileCardRow label="By">
                  {log.performed_by_name || log.performed_by?.slice(0, 8) || '—'}
                </MobileCardRow>
              </MobileCard>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
