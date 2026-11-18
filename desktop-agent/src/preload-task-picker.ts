import { contextBridge, ipcRenderer } from 'electron';
import type { PickableProject } from './taskTimer';

contextBridge.exposeInMainWorld('taskPicker', {
  requestTasks: () => ipcRenderer.send('task-picker-ready'),
  // One payload covers both the project tree and the "Suggested" section
  // (the employee's own most-recently-tracked projects), so the renderer
  // only ever has one source of truth to render from instead of juggling
  // two separate async loads that could resolve out of order.
  onData: (cb: (data: { suggested: PickableProject[]; projects: PickableProject[] }) => void) =>
    ipcRenderer.on('task-picker-data', (_e, data) => cb(data)),
  chooseProject: (p: { projectId: string; projectName: string; clientName: string | null }) => ipcRenderer.send('task-picker-choose-project', p),
  chooseNoTask: () => ipcRenderer.send('task-picker-choose-none'),
  cancel: () => ipcRenderer.send('task-picker-cancel'),
});
