import { app, BrowserWindow, session } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/channels'
import { setProgressEmitter, type AnalysisProgress } from './analyzer'
import { MAIN_WINDOW } from './constants'
import { registerIpcHandlers } from './ipcHandlers'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...MAIN_WINDOW,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

app.whenReady().then(() => {
  // Electron 32+ runs a synchronous permission CHECK before the async REQUEST
  // dispatch, so both handlers must allow 'media' for getUserMedia to succeed.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'mediaKeySystem')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'mediaKeySystem'
  })

  registerIpcHandlers()
  setProgressEmitter((p: AnalysisProgress) => {
    mainWindow?.webContents.send(IPC.AnalyzeProgress, p)
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
