const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  assets: kind => ipcRenderer.invoke('assets', kind),
  growthAudio: () => ipcRenderer.invoke('growth-audio'),
  progress: () => ipcRenderer.invoke('progress'),
  selectSpecies: kind => ipcRenderer.invoke('select-species', kind),
  onSelectSpecies: callback => ipcRenderer.on('select-species-request', (_event, kind) => callback(kind)),
  resetProgress: () => ipcRenderer.invoke('reset-progress'),
  onResetProgress: callback => ipcRenderer.on('reset-progress-request', () => callback()),
  addPreviewTokens: tokens => ipcRenderer.invoke('preview-tokens', tokens),
  usageStatus: () => ipcRenderer.invoke('usage-status'),
  onUsageStatus: callback => ipcRenderer.on('usage-status', (_event, status) => callback(status)),
  onUsageGrowth: callback => ipcRenderer.on('usage-growth', (_event, update) => callback(update)),
  startDrag: () => ipcRenderer.send('drag-start'),
  endDrag: () => ipcRenderer.invoke('drag-end'),
  cancelDrag: () => ipcRenderer.send('drag-cancel'),
  menu: () => ipcRenderer.send('menu'),
  onMute: callback => ipcRenderer.on('mute', (_event, muted) => callback(muted)),
});
