import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agent', {
  signIn: (email: string, password: string) => ipcRenderer.invoke('sign-in', { email, password }),
  signOut: () => ipcRenderer.invoke('sign-out'),
  onSignedIn: (cb: (email: string) => void) => ipcRenderer.on('signed-in', (_e, email) => cb(email)),
  onStatus: (cb: (status: { tracking: boolean }) => void) => ipcRenderer.on('agent-status', (_e, status) => cb(status)),
});
