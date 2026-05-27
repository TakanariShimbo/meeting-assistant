import { clipboard, ipcMain } from 'electron'
import { IPC } from '@shared/channels'
import type { AnalyzeRequest } from '@shared/analysis'
import type { AttachmentInput } from '@shared/attachments'
import type { ChatRequest } from '@shared/chat'
import type { SdpExchangeRequest, SettingsUpdate } from '@shared/types'
import { analyze } from './analyzer'
import {
  addAttachment,
  clearAttachments,
  listAttachments,
  removeAttachment
} from './attachments'
import { cancelChat, chat } from './chat'
import { exchangeSdp } from './realtime'
import {
  getAudioStatus,
  setCaptureAsDefault,
  setupVirtualSink,
  teardownVirtualSink
} from './services/linuxAudio'
import { getAppSettings, updateSettings } from './settings'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.SettingsGet, () => getAppSettings())
  ipcMain.handle(IPC.SettingsSave, (_e, update: SettingsUpdate) => updateSettings(update))
  ipcMain.handle(IPC.RealtimeExchangeSdp, (_e, req: SdpExchangeRequest) => exchangeSdp(req))
  ipcMain.handle(IPC.Analyze, (_e, req: AnalyzeRequest) => analyze(req))

  // Linux audio helpers. On non-Linux these still respond — `getAudioStatus`
  // reports pactlAvailable=false, so the renderer hides the UI.
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

  ipcMain.handle(IPC.Chat, (_e, req: ChatRequest) => chat(req))
  ipcMain.handle(IPC.ChatCancel, () => {
    cancelChat()
  })
}
