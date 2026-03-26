import { contextBridge } from 'electron'
import { api } from './api'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = api
  // @ts-ignore (define in dts)
  window.api = api
}
