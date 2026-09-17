const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  assets: kind => ipcRenderer.invoke('assets', kind),
  progress: () => ipcRenderer.invoke('progress'),
  resetProgress: () => ipcRenderer.invoke('reset-progress'),
  onResetProgress: callback => ipcRenderer.on('reset-progress-request', () => callback()),
  addPreviewTokens: tokens => ipcRenderer.invoke('preview-tokens', tokens),
  startDrag: () => ipcRenderer.send('drag-start'),
  endDrag: () => ipcRenderer.invoke('drag-end'),
  cancelDrag: () => ipcRenderer.send('drag-cancel'),
  menu: () => ipcRenderer.send('menu'),
  onMute: callback => ipcRenderer.on('mute', (_event, muted) => callback(muted)),
});
