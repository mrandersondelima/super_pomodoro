import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
  showNotification: (payload) => ipcRenderer.invoke('show-notification', payload),
})
