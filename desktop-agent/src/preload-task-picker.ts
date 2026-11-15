import { contextBridge, ipcRenderer } from 'electron';
import type { PickableTask } from './taskTimer';

contextBridge.exposeInMainWorld('taskPicker', {
  requestTasks: () => ipcRenderer.send('task-picker-ready'),
  onTasks: (cb: (tasks: PickableTask[]) => void) => ipcRenderer.on('task-picker-tasks', (_e, tasks) => cb(tasks)),
  chooseTask: (task: PickableTask) => ipcRenderer.send('task-picker-choose', task),
  chooseNoTask: () => ipcRenderer.send('task-picker-choose-none'),
  cancel: () => ipcRenderer.send('task-picker-cancel'),
});
