// Runs inside the tab bar only (the strip with "KD Ops" and "Office"). It can switch tab and hear which tab is open.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kdTabs', {
  select: (id) => ipcRenderer.send('tabs:select', String(id)),
  onState: (cb) => ipcRenderer.on('tabs:state', (_e, s) => cb(s)),
  ready: () => ipcRenderer.send('tabs:ready'),
});
