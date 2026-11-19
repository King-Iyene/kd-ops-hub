import { useSearchParams } from 'react-router-dom';

export const TASK_PARAM = 'task';

// A task opens over whatever page you're on by adding ?task=<id> to the
// address, so links to a task work from anywhere and Back closes it.
export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  const openTaskId = params.get(TASK_PARAM);
  const open = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(TASK_PARAM, id);
      return next;
    });
  const close = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(TASK_PARAM);
      return next;
    });
  return { openTaskId, open, close };
}

export function taskLink(taskId: string) {
  return `${window.location.origin}/task?${TASK_PARAM}=${taskId}`;
}
