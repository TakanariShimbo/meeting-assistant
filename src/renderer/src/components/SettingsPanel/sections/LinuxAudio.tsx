import { useEffect, useState } from 'react'

interface Props {
  onChanged: () => void
}

export function LinuxAudioSetup({ onChanged }: Props): JSX.Element {
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof window.api.linuxAudioStatus>
  > | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await window.api.linuxAudioStatus())
    } catch (err) {
      setError(`状態取得失敗: ${(err as Error).message}`)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  /** Run an action, refresh status, and notify the parent — all with the
   *  busy spinner held for the duration. */
  const wrap = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!status) return <p className="hint">音声セットアップ状態を確認中…</p>

  if (!status.pactlAvailable) {
    return (
      <div className="linux-setup">
        <p className="setup-warning">
          <code>pactl</code> が見つかりません。先に
          <code>sudo apt install pulseaudio-utils</code> を実行してください。
        </p>
      </div>
    )
  }

  return (
    <div className="linux-setup">
      <div className="setup-row">
        <span className="setup-label">仮想シンク</span>
        <span className={`status-dot ${status.ready ? 'ok' : 'off'}`}>
          {status.ready ? '✓ 設定済み' : '未設定'}
        </span>
        {status.ready ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void wrap(window.api.linuxAudioTeardown)}
          >
            解除
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void wrap(window.api.linuxAudioSetup)}
          >
            {busy ? '設定中…' : 'セットアップ'}
          </button>
        )}
      </div>

      {status.ready && (
        <>
          <div className="setup-row">
            <span className="setup-label">現在のデフォルト出力</span>
            <code className="default-sink">{status.defaultSink ?? '不明'}</code>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={status.isCapturingDefault}
              disabled={busy}
              onChange={(e) =>
                void wrap(() => window.api.linuxAudioSetCaptureDefault(e.target.checked))
              }
            />
            全アプリの音声を自動キャプチャ（デフォルト出力を MeetingAssistant_Sink に切替）
          </label>
          {!status.isCapturingDefault && (
            <p className="hint">
              OFF の場合は <code>pavucontrol</code> で個別アプリの出力を
              <code> MeetingAssistant_Sink</code> に振り向けてください。
            </p>
          )}
        </>
      )}

      {error && <p className="setup-warning">{error}</p>}

      <details className="manual-cmds">
        <summary>手動コマンドを表示</summary>
        <pre className="cmd-block">{LINUX_SETUP_CMD}</pre>
      </details>
    </div>
  )
}

const LINUX_SETUP_CMD = `# 仮想スピーカー
pactl load-module module-null-sink \\
  sink_name=meeting_assistant \\
  sink_properties=device.description=MeetingAssistant_Sink

# モニターを「通常入力」のフリで露出 (これが一覧に出ます)
pactl load-module module-remap-source \\
  source_name=meeting_assistant_capture \\
  master=meeting_assistant.monitor \\
  source_properties=device.description=MeetingAssistant_Capture

# 音を耳でも聞きたい場合
pactl load-module module-loopback \\
  source=meeting_assistant.monitor \\
  latency_msec=1`
