const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('afa', {
  getStatus: () => ipcRenderer.invoke('afa:get-status'),
  listVoices: () => ipcRenderer.invoke('afa:list-voices'),
  listOutputs: () => ipcRenderer.invoke('afa:list-outputs'),
  doctor: () => ipcRenderer.invoke('afa:doctor'),
  getDriverState: () => ipcRenderer.invoke('afa:driver-state'),
  installDriver: () => ipcRenderer.invoke('afa:install-driver'),
  getSetupSteps: () => ipcRenderer.invoke('afa:setup-steps'),
  speak: (text) => ipcRenderer.invoke('afa:speak', text),
  setVoice: (value) => ipcRenderer.invoke('afa:set-voice', value),
  setRate: (value) => ipcRenderer.invoke('afa:set-rate', value),
  setMode: (value) => ipcRenderer.invoke('afa:set-mode', value),
  setOutput: (value) => ipcRenderer.invoke('afa:set-output', value),
  resize: (mode) => ipcRenderer.invoke('afa:resize', mode),
  minimize: () => ipcRenderer.invoke('afa:minimize'),
  close: () => ipcRenderer.invoke('afa:close')
});
