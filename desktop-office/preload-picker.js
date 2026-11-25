// Runs inside the "share your screen" window only. It receives the list of screens and windows (with small pictures) and can answer
// with one choice or cancel. Nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kdPicker', {
  onSources: (cb) => ipcRenderer.on('picker:sources', (_e, list) => cb(list)),
  ready: () => ipcRenderer.send('picker:ready'),
  choose: (id) => ipcRenderer.send('picker:choose', String(id)),
  cancel: () => ipcRenderer.send('picker:cancel'),
});
