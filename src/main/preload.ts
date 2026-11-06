import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from '../shared/desktop'

let pendingCapture: string | null = null
ipcRenderer.on('capture:init', (_event, image: string) => { pendingCapture = image })

function onString(channel: string, callback: (value: string) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: string) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const bridge: DesktopBridge = {
  settings: () => ipcRenderer.invoke('settings:get'),
  setProvider: (provider) => ipcRenderer.invoke('settings:provider', provider),
  setApiKey: (provider, key) => ipcRenderer.invoke('settings:key', provider, key),
  setModel: (provider, model) => ipcRenderer.invoke('settings:model', provider, model),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  analyze: (source, depth) => ipcRenderer.invoke('ai:analyze', source, depth),
  extractImage: (image) => ipcRenderer.invoke('ai:extract', image),
  ask: (source, question, history, historyId) => ipcRenderer.invoke('ai:ask', source, question, history, historyId),
  translateKeyword: (term, language) => ipcRenderer.invoke('keyword:translate', term, language),
  listKeywords: () => ipcRenderer.invoke('keyword:list'),
  deleteKeyword: (id) => ipcRenderer.invoke('keyword:delete', id),
  clearKeywords: () => ipcRenderer.invoke('keyword:clear'),
  listHistory: () => ipcRenderer.invoke('history:list'),
  getHistory: (id) => ipcRenderer.invoke('history:get', id),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  startCapture: () => ipcRenderer.invoke('capture:start'),
  captureDone: (image) => ipcRenderer.invoke('capture:done', image),
  captureCancel: () => ipcRenderer.invoke('capture:cancel'),
  collapse: () => ipcRenderer.invoke('window:collapse'),
  expand: () => ipcRenderer.invoke('window:expand'),
  quit: () => ipcRenderer.invoke('window:quit'),
  onClipboard: (callback) => onString('clipboard:code', callback),
  onImage: (callback) => onString('capture:image', callback),
  onCaptureInit: (callback) => {
    if (pendingCapture) callback(pendingCapture)
    return onString('capture:init', callback)
  },
}

contextBridge.exposeInMainWorld('codelens', bridge)
