// Runs inside the small "who is around" window only. It can show what the Office sends and ask for three things: set my status,
// open the office, hide this strip.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kdMini', {
  onState: (cb) => ipcRenderer.on('mini:state', (_e, s) => cb(s)),
  ready: () => ipcRenderer.send('mini:ready'),
  setStatus: (id) => ipcRenderer.send('mini:status', String(id)),
  expand: () => ipcRenderer.send('mini:expand'),
  close: () => ipcRenderer.send('mini:close'),
  size: (h) => ipcRenderer.send('mini:size', Number(h) || 0),
});
