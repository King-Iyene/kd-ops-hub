import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agent', {
  signIn: (email: string, password: string) => ipcRenderer.invoke('sign-in', { email, password }),
  signOut: () => ipcRenderer.invoke('sign-out'),
  // really quit the tracker (closing the window only hides it; the tracker keeps working from the tray)
  quit: () => ipcRenderer.send('quit-app'),
  onSignedIn: (cb: (email: string) => void) => ipcRenderer.on('signed-in', (_e, email) => cb(email)),
  onSignedOut: (cb: () => void) => ipcRenderer.on('signed-out', () => cb()),
  onStatus: (cb: (status: { tracking: boolean }) => void) => ipcRenderer.on('agent-status', (_e, status) => cb(status)),
  onConfigError: (cb: (message: string) => void) => ipcRenderer.on('config-error', (_e, message) => cb(message)),
});
