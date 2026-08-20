import { useNavigate } from 'react-router-dom';
import { ClipboardList, ExternalLink } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
  tasks: any[];
}

export default function TasksTab({ tasks }: Props) {
  const navigate = useNavigate();

  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Assigned Tasks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <EmptyState compact icon={ClipboardList} title="No tasks assigned" description="Tasks assigned to this employee will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Title</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task: any) => (
                    <TableRow key={task.id}>
                      <TableCell className="pl-4 font-medium">{task.title}</TableCell>
                      <TableCell>{task.due_date ? formatDate(task.due_date) : '—'}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            task.status === 'completed' || task.status === 'done'
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                              : task.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                          }
                        >
                          {task.status || 'pending'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4">
                        <button
                          onClick={() => navigate('/tasks')}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Go to tasks"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
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
