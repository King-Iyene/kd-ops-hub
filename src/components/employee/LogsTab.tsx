import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow } from '@/components/ui-kit/MobileCard';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
  auditLogs: any[];
}

export default function LogsTab({ auditLogs }: Props) {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Audit Logs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {auditLogs.length === 0 ? (
            <EmptyState compact icon={Activity} title="No activity yet" description="Profile changes and audit events will appear here." />
          ) : (
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Action</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="pr-4 whitespace-nowrap">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="pl-4 font-mono text-xs whitespace-nowrap">
                          {log.action_type || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{log.description || '—'}</TableCell>
                        <TableCell className="pr-4 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="md:hidden space-y-2 p-3">
              {auditLogs.map((log: any) => (
                <MobileCard key={log.id}>
                  <MobileCardHeader>
                    <MobileCardTitle>{log.action_type || '—'}</MobileCardTitle>
                    <MobileCardMeta>{formatDateTime(log.created_at)}</MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Description" value={log.description || '—'} />
                </MobileCard>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
