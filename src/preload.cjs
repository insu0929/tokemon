const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  assets: () => ipcRenderer.invoke('assets'),
  startDrag: () => ipcRenderer.send('drag-start'),
  endDrag: () => ipcRenderer.invoke('drag-end'),
  cancelDrag: () => ipcRenderer.send('drag-cancel'),
  menu: () => ipcRenderer.send('menu'),
  onMute: callback => ipcRenderer.on('mute', (_event, muted) => callback(muted)),
});
