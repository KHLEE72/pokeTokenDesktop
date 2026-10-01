import { contextBridge, ipcRenderer } from 'electron'
import { DesktopAPI, Snapshot, PetMotion } from '../shared/model'
const subscribe = <T>(channel: string, callback: (value: T) => void): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
contextBridge.exposeInMainWorld('desktop', {
  getSnapshot: () => ipcRenderer.invoke('snapshot:get'),
  onSnapshot: (callback: (value: Snapshot) => void) => subscribe('snapshot', callback),
  updateSettings: patch => ipcRenderer.invoke('settings:update', patch), refresh: () => ipcRenderer.invoke('usage:refresh'),
  chooseFolder: provider => ipcRenderer.invoke('folder:choose', provider), getDisplays: () => ipcRenderer.invoke('display:list'),
  getSprite: id => ipcRenderer.invoke('sprite:get', id), openDashboard: tab => ipcRenderer.invoke('dashboard:open', tab),
  onNavigate: callback => subscribe<string>('navigate', callback), onMotion: callback => subscribe<PetMotion>('pet:motion', callback),
  pointer: active => ipcRenderer.send('pet:pointer', active), drag: action => ipcRenderer.send('pet:drag', action), petMenu: () => ipcRenderer.send('pet:menu')
} satisfies DesktopAPI)
