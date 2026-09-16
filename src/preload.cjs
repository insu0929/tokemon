const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  assets: kind => ipcRenderer.invoke('assets', kind),
  progress: () => ipcRenderer.invoke('progress'),
  addPreviewTokens: tokens => ipcRenderer.invoke('preview-tokens', tokens),
  startDrag: () => ipcRenderer.send('drag-start'),
  endDrag: () => ipcRenderer.invoke('drag-end'),
  cancelDrag: () => ipcRenderer.send('drag-cancel'),
  menu: () => ipcRenderer.send('menu'),
  onMute: callback => ipcRenderer.on('mute', (_event, muted) => callback(muted)),
});
