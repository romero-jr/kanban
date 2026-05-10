const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kanbanAPI', {
  loadData:       ()        => ipcRenderer.invoke('load-data'),
  saveData:       (data)    => ipcRenderer.invoke('save-data', data),
  loadSettings:   ()        => ipcRenderer.invoke('load-settings'),
  saveSettings:   (s)       => ipcRenderer.invoke('save-settings', s),
  syncOnStart:    ()        => ipcRenderer.invoke('sync-on-start'),
  createGist:     (token)   => ipcRenderer.invoke('create-gist', token),
  testConnection: (cfg)     => ipcRenderer.invoke('test-connection', cfg),
  quitSyncDone:   (data)    => ipcRenderer.invoke('quit-sync-done', data),
  onBeginQuitSync: (cb)     => ipcRenderer.on('begin-quit-sync', cb),
});
