import { contextBridge, ipcRenderer } from 'electron';

// Separate, minimal preload for the floating status widget window — it has
// no sign-in form and no business reading agent-status's full payload, so it
// gets its own narrower bridge rather than reusing preload.ts's `agent`
// namespace (which is for the main sign-in window).
contextBridge.exposeInMainWorld('widget', {
  onStatus: (
    cb: (status: {
      tracking: boolean;
      idle: boolean;
      startedAt: number | null;
      task: { name: string; project: string; startedAt: number } | null;
    }) => void,
  ) => ipcRenderer.on('widget-status', (_e, status) => cb(status)),
  openMain: () => ipcRenderer.send('open-main-window'),
  stopTask: () => ipcRenderer.send('task-picker-choose-none'),
  // Click the task name itself (or "No Task") to bring up the same picker
  // the tray's "Start a Task…" menu item opens — matches the "Click to
  // change task" interaction the widget is meant to mirror, rather than
  // only being reachable through a right-click tray menu.
  changeTask: () => ipcRenderer.send('open-task-picker'),
});
