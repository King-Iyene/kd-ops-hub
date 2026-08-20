import { useParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TaskFormPublic } from '@/components/tasks/TaskFormPublic';

export default function PublicForm() {
  usePageTitle('Public Form');
  const { formId } = useParams<{ formId: string }>();
  if (!formId) return <p className="text-center py-20 text-muted-foreground">Form not found</p>;
  return <TaskFormPublic formId={formId} />;
}
