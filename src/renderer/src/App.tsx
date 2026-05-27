import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '@shared/types'
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
  const setStatus = useStore((s) => s.setStatus)
  const upsertDelta = useStore((s) => s.upsertDelta)
  const upsertFinal = useStore((s) => s.upsertFinal)
  const clear = useStore((s) => s.clear)

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const clientRef = useRef<RealtimeClient | null>(null)

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
    void window.api.getSettings().then(setSettings)
    const setAnalysisProgress = useStore.getState().setAnalysisProgress
    return window.api.onAnalyzeProgress((p) => {
      setAnalysisProgress(p.mode, p.phase, p.outputChars, p.partialResult ?? null)
    })
  }, [])

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
        onUserTranscriptCompleted: upsertFinal
      },
      {
        instructions: settings.instructions,
        language: settings.language,
        autoCreateResponse: false
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

  const isActive = status === 'connecting' || status === 'connected' || status === 'paused'
  const isPaused = status === 'paused'

  return (
    <div className="app">
      <header className="header">
        <h1>Meeting Assistant</h1>
        <div className="header-actions">
          <span className={`status status-${status}`}>{statusLabel(status)}</span>
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
          <TranscriptList />
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
