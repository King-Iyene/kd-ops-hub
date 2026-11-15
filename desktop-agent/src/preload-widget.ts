import { contextBridge, ipcRenderer } from 'electron';

// Separate, minimal preload for the floating status widget window — it has
// no sign-in form and no business reading agent-status's full payload, so it
// gets its own narrower bridge rather than reusing preload.ts's `agent`
// namespace (which is for the main sign-in window).
contextBridge.exposeInMainWorld('widget', {
  onStatus: (cb: (status: { tracking: boolean; idle: boolean; startedAt: number | null }) => void) =>
    ipcRenderer.on('widget-status', (_e, status) => cb(status)),
  openMain: () => ipcRenderer.send('open-main-window'),
});
