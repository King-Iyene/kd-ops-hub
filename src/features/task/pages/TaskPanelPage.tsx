import { useNavigate, useParams } from 'react-router-dom';
import { TaskPanel } from '../tasks/TaskPanel';

export default function TaskPanelPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  if (!taskId) return null;
  return <TaskPanel taskId={taskId} onClose={() => navigate(-1)} />;
}
