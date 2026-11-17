import { contextBridge, ipcRenderer } from 'electron';
import type { PickableTask, PickableProject } from './taskTimer';

export interface CreateTaskArgs {
  projectId: string;
  projectName: string;
  clientName: string | null;
  name: string;
  selectAfterCreate: boolean;
}

export interface CreateTaskResult {
  ok: boolean;
  task?: PickableTask;
  error?: string;
}

contextBridge.exposeInMainWorld('taskPicker', {
  requestTasks: () => ipcRenderer.send('task-picker-ready'),
  // One payload covers both the full tree (tasks, flat — the renderer groups
  // it into Client > Project > Task itself) and the "Suggested" section
  // (the employee's own most-recently-used tasks), so the renderer only
  // ever has one source of truth to render from instead of juggling two
  // separate async loads that could resolve out of order.
  onData: (cb: (data: { tasks: PickableTask[]; suggested: PickableTask[]; projects: PickableProject[] }) => void) =>
    ipcRenderer.on('task-picker-data', (_e, data) => cb(data)),
  chooseTask: (task: PickableTask) => ipcRenderer.send('task-picker-choose', task),
  chooseProject: (p: { projectId: string; projectName: string; clientName: string | null }) => ipcRenderer.send('task-picker-choose-project', p),
  chooseNoTask: () => ipcRenderer.send('task-picker-choose-none'),
  cancel: () => ipcRenderer.send('task-picker-cancel'),
  createTask: (args: CreateTaskArgs): Promise<CreateTaskResult> => ipcRenderer.invoke('task-picker-create-task', args),
});
