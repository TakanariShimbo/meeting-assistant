import { app, BrowserWindow, clipboard, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/channels'
import type { SdpExchangeRequest, SettingsUpdate } from '@shared/types'
import type { AnalyzeRequest } from '@shared/analysis'
import { getAppSettings, updateSettings } from './settings'
import { exchangeSdp } from './realtime'
import { analyze, setProgressEmitter, type AnalysisProgress } from './analyzer'
import {
  addAttachment,
  clearAttachments,
  listAttachments,
  removeAttachment
} from './attachments'
import type { AttachmentInput } from '@shared/attachments'
import {
  getAudioStatus,
  setCaptureAsDefault,
  setupVirtualSink,
  teardownVirtualSink
} from './linuxAudio'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Meeting Assistant',
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

function registerIpc(): void {
  ipcMain.handle(IPC.SettingsGet, () => getAppSettings())
  ipcMain.handle(IPC.SettingsSave, (_e, update: SettingsUpdate) => updateSettings(update))
  ipcMain.handle(IPC.RealtimeExchangeSdp, (_e, req: SdpExchangeRequest) => exchangeSdp(req))
  ipcMain.handle(IPC.Analyze, (_e, req: AnalyzeRequest) => analyze(req))

  // Linux audio helpers. On non-Linux these still respond — `getAudioStatus`
  // will report pactlAvailable=false, so the renderer hides the UI.
  ipcMain.handle(IPC.LinuxAudioStatus, () => getAudioStatus())
  ipcMain.handle(IPC.LinuxAudioSetup, async () => {
    await setupVirtualSink()
    return getAudioStatus()
  })
  ipcMain.handle(IPC.LinuxAudioTeardown, async () => {
    await teardownVirtualSink()
    return getAudioStatus()
  })
  ipcMain.handle(IPC.LinuxAudioSetCaptureDefault, async (_e, enable: boolean) => {
    await setCaptureAsDefault(enable)
    return getAudioStatus()
  })

  // Electron's native clipboard works regardless of renderer focus/permission
  // quirks, unlike navigator.clipboard.writeText which can fail silently.
  ipcMain.handle(IPC.ClipboardWriteText, (_e, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle(IPC.AttachmentList, () => listAttachments())
  ipcMain.handle(IPC.AttachmentAdd, (_e, input: AttachmentInput) => addAttachment(input))
  ipcMain.handle(IPC.AttachmentRemove, (_e, id: string) => {
    removeAttachment(id)
    return listAttachments()
  })
  ipcMain.handle(IPC.AttachmentClear, () => {
    clearAttachments()
    return listAttachments()
  })
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

  registerIpc()
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
