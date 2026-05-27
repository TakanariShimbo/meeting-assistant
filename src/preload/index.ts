import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/channels'
import type {
  AppSettings,
  AudioSetupStatus,
  SdpExchangeRequest,
  SdpExchangeResponse,
  SettingsUpdate
} from '@shared/types'
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalysisMode,
  FinalAnalysis,
  LiveAnalysis
} from '@shared/analysis'
import type { AttachmentInput, AttachmentMeta } from '@shared/attachments'

interface AnalysisProgressPayload {
  mode: AnalysisMode
  phase: 'reasoning' | 'output'
  outputChars: number
  partialResult?: LiveAnalysis | FinalAnalysis
}

const api = {
  platform: process.platform,
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SettingsGet),
  saveSettings: (update: SettingsUpdate): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.SettingsSave, update),
  exchangeSdp: (req: SdpExchangeRequest): Promise<SdpExchangeResponse> =>
    ipcRenderer.invoke(IPC.RealtimeExchangeSdp, req),
  analyze: (req: AnalyzeRequest): Promise<AnalyzeResponse> => ipcRenderer.invoke(IPC.Analyze, req),

  // Linux PulseAudio / PipeWire helpers (managed from the main process so the
  // renderer never has to shell out).
  linuxAudioStatus: (): Promise<AudioSetupStatus> => ipcRenderer.invoke(IPC.LinuxAudioStatus),
  linuxAudioSetup: (): Promise<AudioSetupStatus> => ipcRenderer.invoke(IPC.LinuxAudioSetup),
  linuxAudioTeardown: (): Promise<AudioSetupStatus> => ipcRenderer.invoke(IPC.LinuxAudioTeardown),
  linuxAudioSetCaptureDefault: (enable: boolean): Promise<AudioSetupStatus> =>
    ipcRenderer.invoke(IPC.LinuxAudioSetCaptureDefault, enable),

  clipboardWriteText: (text: string): Promise<void> =>
    ipcRenderer.invoke(IPC.ClipboardWriteText, text),

  /** Subscribe to streaming progress events. Returns an unsubscribe function. */
  onAnalyzeProgress: (cb: (p: AnalysisProgressPayload) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: AnalysisProgressPayload): void => cb(p)
    ipcRenderer.on(IPC.AnalyzeProgress, listener)
    return () => ipcRenderer.off(IPC.AnalyzeProgress, listener)
  },

  attachmentList: (): Promise<AttachmentMeta[]> => ipcRenderer.invoke(IPC.AttachmentList),
  attachmentAdd: (input: AttachmentInput): Promise<AttachmentMeta> =>
    ipcRenderer.invoke(IPC.AttachmentAdd, input),
  attachmentRemove: (id: string): Promise<AttachmentMeta[]> =>
    ipcRenderer.invoke(IPC.AttachmentRemove, id),
  attachmentClear: (): Promise<AttachmentMeta[]> => ipcRenderer.invoke(IPC.AttachmentClear)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
