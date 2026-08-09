import { useParams } from 'react-router-dom';
import { TaskFormPublic } from '@/components/tasks/TaskFormPublic';

export default function PublicForm() {
  const { formId } = useParams<{ formId: string }>();
  if (!formId) return <p className="text-center py-20 text-muted-foreground">Form not found</p>;
  return <TaskFormPublic formId={formId} />;
}
