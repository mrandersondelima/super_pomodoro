import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('alarm', {
  stop: () => ipcRenderer.send('alarm-stop'),
})
