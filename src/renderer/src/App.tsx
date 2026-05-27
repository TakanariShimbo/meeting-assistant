import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, SessionMode } from '@shared/types'
import { RealtimeClient } from './realtime/client'
import { buildAudioStream } from './audio'
import { useStore } from './store'
import { TranscriptList } from './components/TranscriptList'
import { SettingsPanel } from './components/SettingsPanel'
import { RightPane } from './components/RightPane'
import { AttachmentsPanel } from './components/AttachmentsPanel'

const RIGHT_WIDTH_KEY = 'meeting-assistant:rightWidth'
const RIGHT_WIDTH_DEFAULT = 620
const RIGHT_WIDTH_MIN = 320
const RIGHT_WIDTH_MAX_RATIO = 0.8

export function App(): JSX.Element {
  const status = useStore((s) => s.status)
  const errorMessage = useStore((s) => s.errorMessage)
  const sessionMode = useStore((s) => s.sessionMode)
  const assistantSpeaking = useStore((s) => s.assistantSpeaking)
  const setStatus = useStore((s) => s.setStatus)
  const upsertDelta = useStore((s) => s.upsertDelta)
  const upsertFinal = useStore((s) => s.upsertFinal)
  const upsertAssistantDelta = useStore((s) => s.upsertAssistantDelta)
  const upsertAssistantFinal = useStore((s) => s.upsertAssistantFinal)
  const setSessionMode = useStore((s) => s.setSessionMode)
  const setAssistantSpeaking = useStore((s) => s.setAssistantSpeaking)
  const clear = useStore((s) => s.clear)

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const clientRef = useRef<RealtimeClient | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [rightWidth, setRightWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(RIGHT_WIDTH_KEY))
    return Number.isFinite(saved) && saved >= RIGHT_WIDTH_MIN ? saved : RIGHT_WIDTH_DEFAULT
  })
  // Latest width in a ref so the mouseup handler closes over fresh state when persisting.
  const widthRef = useRef(rightWidth)
  useEffect(() => {
    widthRef.current = rightWidth
    localStorage.setItem(RIGHT_WIDTH_KEY, String(rightWidth))
  }, [rightWidth])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widthRef.current
    const maxWidth = window.innerWidth * RIGHT_WIDTH_MAX_RATIO
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent): void => {
      const next = startWidth + (startX - ev.clientX)
      setRightWidth(Math.max(RIGHT_WIDTH_MIN, Math.min(maxWidth, next)))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    void window.api.getSettings().then((s) => {
      setSettings(s)
      // Seed the in-memory session mode from the persisted default so the
      // header toggle matches what the next Start will use.
      setSessionMode(s.sessionMode)
    })
    const setAnalysisProgress = useStore.getState().setAnalysisProgress
    return window.api.onAnalyzeProgress((p) => {
      setAnalysisProgress(p.mode, p.phase, p.outputChars, p.partialResult ?? null)
    })
  }, [setSessionMode])

  const refreshSettings = async (): Promise<void> => {
    const next = await window.api.getSettings()
    setSettings(next)
  }

  const onStart = async (): Promise<void> => {
    if (!settings) return
    if (!settings.hasApiKey) {
      setStatus('error', 'API キーを設定してください')
      setShowSettings(true)
      return
    }
    clear()
    const client = new RealtimeClient(
      {
        onStatus: (s, detail) => {
          if (s === 'connected') setStatus('connected')
          else if (s === 'connecting') setStatus('connecting')
          else if (s === 'paused') setStatus('paused')
          else if (s === 'closed') setStatus('idle')
          else setStatus('error', detail ?? null)
        },
        onUserTranscriptDelta: upsertDelta,
        onUserTranscriptCompleted: upsertFinal,
        onAssistantTranscriptDelta: upsertAssistantDelta,
        onAssistantTranscriptCompleted: upsertAssistantFinal,
        onAssistantSpeakingChange: setAssistantSpeaking,
        onRemoteAudio: (stream) => {
          // Attach the assistant's audio to a hidden <audio> element so it
          // plays back through the default output device. On Linux, if the
          // user has toggled the virtual sink as system default for system-
          // audio capture, the assistant voice would otherwise loop back
          // into our own mic input. The audio element's default routing
          // honors the OS-side audio output preference, which the user can
          // tweak in their sound settings if needed.
          if (audioRef.current) audioRef.current.srcObject = stream
        }
      },
      {
        instructions: settings.instructions,
        language: settings.language,
        sessionMode
      }
    )
    clientRef.current = client

    let audio: Awaited<ReturnType<typeof buildAudioStream>> | null = null
    try {
      audio = await buildAudioStream({
        mode: settings.audioMode,
        micDeviceId: settings.micDeviceId,
        systemDeviceId: settings.systemDeviceId
      })
    } catch (err) {
      setStatus('error', (err as Error).message)
      return
    }

    try {
      await client.start(audio)
    } catch (err) {
      // start() takes ownership and cleans up on failure, but if buildAudioStream
      // succeeded then start() threw before assigning, free the stream here.
      audio?.cleanup()
      console.error(err)
    }
  }

  const onStop = async (): Promise<void> => {
    await clientRef.current?.stop()
    clientRef.current = null
  }

  const onPause = (): void => clientRef.current?.pause()
  const onResume = (): void => clientRef.current?.resume()
  const onRequestReply = (): void => clientRef.current?.requestResponse()
  const onChangeMode = (mode: SessionMode): void => {
    setSessionMode(mode)
    // Mid-session: push the change down to OpenAI via session.update.
    // Pre-session: this is just a UI preference; next Start picks it up.
    clientRef.current?.setSessionMode(mode)
  }

  const isActive = status === 'connecting' || status === 'connected' || status === 'paused'
  const isPaused = status === 'paused'
  const canRequestReply = status === 'connected' || status === 'paused'

  return (
    <div className="app">
      <header className="header">
        <h1>Meeting Assistant</h1>
        <div className="header-actions">
          <span className={`status status-${status}`}>{statusLabel(status)}</span>
          {assistantSpeaking && <span className="assistant-speaking">🔊 AI 応答中</span>}
          {isActive ? (
            <>
              <button
                type="button"
                className="primary"
                onClick={isPaused ? onResume : onPause}
                disabled={status === 'connecting'}
              >
                {isPaused ? '再開' : '一時停止'}
              </button>
              <button type="button" onClick={() => void onStop()}>
                停止
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => void onStart()}
              disabled={settings === null}
            >
              開始
            </button>
          )}
          <button type="button" onClick={() => setShowSettings((v) => !v)}>
            設定
          </button>
        </div>
      </header>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

      {errorMessage && <div className="error">{errorMessage}</div>}

      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          onSaved={async () => {
            await refreshSettings()
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="body">
        <main className="main">
          <AttachmentsPanel />
          <TranscriptList
            sessionMode={sessionMode}
            onChangeMode={onChangeMode}
            onRequestReply={onRequestReply}
            canRequestReply={canRequestReply}
          />
        </main>
        <div
          className="divider"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={startResize}
        />
        <RightPane width={rightWidth} />
      </div>
    </div>
  )
}

function statusLabel(s: string): string {
  switch (s) {
    case 'idle':
      return '待機中'
    case 'connecting':
      return '接続中…'
    case 'connected':
      return '接続済み'
    case 'paused':
      return '一時停止中'
    case 'error':
      return 'エラー'
    default:
      return s
  }
}
