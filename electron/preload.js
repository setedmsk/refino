const { contextBridge, ipcRenderer } = require('electron');

// Superficie minima exposta ao renderer. Nada de ipcRenderer solto.
contextBridge.exposeInMainWorld('desktop', {
  listSources: () => ipcRenderer.invoke('desktop:sources'),
  minimize:    () => ipcRenderer.invoke('window:minimize'),
  maximize:    () => ipcRenderer.invoke('window:maximize'),
  close:       () => ipcRenderer.invoke('window:close'),
  isElectron:  true,
});
