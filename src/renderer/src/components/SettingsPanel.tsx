import { useEffect, useState, type ReactNode } from 'react'
import {
  AUDIO_MODE_LABELS,
  LANGUAGE_OPTIONS,
  LIVE_MODEL_LABELS,
  LIVE_MODEL_OPTIONS,
  REASONING_EFFORTS,
  REASONING_LABELS,
  type AppSettings,
  type AudioMode,
  type LanguageCode,
  type LiveModel,
  type ReasoningEffort
} from '@shared/types'
import { enumerateAudioInputs } from '../audio'

interface Props {
  settings: AppSettings
  onSaved: () => Promise<void> | void
  onClose: () => void
}

const SECTION_KEY_PREFIX = 'meeting-assistant:settings-section:'

function Section({
  title,
  storageKey,
  defaultOpen = true,
  children
}: {
  title: string
  storageKey: string
  defaultOpen?: boolean
  children: ReactNode
}): JSX.Element {
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(SECTION_KEY_PREFIX + storageKey)
    if (v === '1') return true
    if (v === '0') return false
    return defaultOpen
  })

  useEffect(() => {
    localStorage.setItem(SECTION_KEY_PREFIX + storageKey, open ? '1' : '0')
  }, [open, storageKey])

  return (
    <div className={`settings-section ${open ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="section-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="section-chevron">{open ? '▼' : '▶'}</span>
        <span className="section-title">{title}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

export function SettingsPanel({ settings, onSaved, onClose }: Props): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [instructions, setInstructions] = useState(settings.instructions)
  const [language, setLanguage] = useState<LanguageCode>(settings.language)
  const [audioMode, setAudioMode] = useState<AudioMode>(settings.audioMode)
  const [micDeviceId, setMicDeviceId] = useState<string>(settings.micDeviceId ?? '')
  const [systemDeviceId, setSystemDeviceId] = useState<string>(settings.systemDeviceId ?? '')
  const [liveModel, setLiveModel] = useState<LiveModel>(settings.liveModel)
  const [liveReasoningEffort, setLiveReasoningEffort] = useState<ReasoningEffort>(
    settings.liveReasoningEffort
  )
  const [liveWebSearch, setLiveWebSearch] = useState<boolean>(settings.liveWebSearch)
  const [finalModel, setFinalModel] = useState<LiveModel>(settings.finalModel)
  const [finalReasoningEffort, setFinalReasoningEffort] = useState<ReasoningEffort>(
    settings.finalReasoningEffort
  )
  const [finalWebSearch, setFinalWebSearch] = useState<boolean>(settings.finalWebSearch)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refreshDevices = async (): Promise<void> => {
    setDevicesLoading(true)
    try {
      setDevices(await enumerateAudioInputs())
    } catch (err) {
      setMessage(`デバイス取得失敗: ${(err as Error).message}`)
    } finally {
      setDevicesLoading(false)
    }
  }

  useEffect(() => {
    void refreshDevices()
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.saveSettings({
        apiKey: apiKey.trim() ? apiKey : undefined,
        instructions,
        language,
        audioMode,
        micDeviceId: micDeviceId || null,
        systemDeviceId: systemDeviceId || null,
        liveModel,
        liveReasoningEffort,
        liveWebSearch,
        finalModel,
        finalReasoningEffort,
        finalWebSearch
      })
      setApiKey('')
      setMessage('保存しました')
      await onSaved()
    } catch (err) {
      setMessage(`保存失敗: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const showMicPicker = audioMode === 'mic' || audioMode === 'mixed'
  const showSystemPicker = audioMode === 'system' || audioMode === 'mixed'

  return (
    <section className="settings">
      <div className="settings-header">
        <h2>設定</h2>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>

      <Section title="一般" storageKey="general" defaultOpen={!settings.hasApiKey}>
        <label>
          OpenAI API キー
          <input
            type="password"
            placeholder={settings.hasApiKey ? '設定済み (変更する場合のみ入力)' : 'sk-...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </label>
      </Section>

      <Section title="文字起こし" storageKey="transcription" defaultOpen={false}>
        <label>
          言語
          <select value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="instructions-field">
          Instructions (system prompt)
          <textarea
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <p className="hint">
            Realtime API のセッションに渡される system prompt。文字起こし対象の文脈や言い回し
            の癖を伝えるのに使えます (例: 「会議名: 〇〇プロジェクト」など)。
          </p>
        </label>
      </Section>

      <Section title="音声入力" storageKey="audio" defaultOpen={false}>
        <label>
          音声入力モード
          <select value={audioMode} onChange={(e) => setAudioMode(e.target.value as AudioMode)}>
            {(Object.entries(AUDIO_MODE_LABELS) as [AudioMode, string][]).map(([mode, label]) => (
              <option key={mode} value={mode}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="device-section">
          <div className="device-section-header">
            <span className="device-section-title">入力デバイス</span>
            <button type="button" onClick={() => void refreshDevices()} disabled={devicesLoading}>
              {devicesLoading ? '取得中…' : '再読込'}
            </button>
          </div>

          {showMicPicker && (
            <label>
              マイク
              <select value={micDeviceId} onChange={(e) => setMicDeviceId(e.target.value)}>
                <option value="">既定のマイク</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `device:${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          {showSystemPicker && (
            <label>
              PC音声（ループバック/モニター）
              <select
                value={systemDeviceId}
                onChange={(e) => setSystemDeviceId(e.target.value)}
              >
                <option value="">— 選択してください —</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `device:${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              <p className="hint">
                ヒント: Linux なら「Monitor of …」、Windows なら「ステレオミキサー」、macOS は
                BlackHole 等のループバック仮想デバイスを選択。
              </p>
            </label>
          )}

          {showSystemPicker && window.api.platform === 'linux' && (
            <LinuxAudioSetup onChanged={() => void refreshDevices()} />
          )}
        </div>
      </Section>

      <Section title="ライブ分析" storageKey="live" defaultOpen={false}>
        <label>
          モデル
          <select value={liveModel} onChange={(e) => setLiveModel(e.target.value as LiveModel)}>
            {LIVE_MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {LIVE_MODEL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label>
          reasoning 強度
          <select
            value={liveReasoningEffort}
            onChange={(e) => setLiveReasoningEffort(e.target.value as ReasoningEffort)}
          >
            {REASONING_EFFORTS.map((r) => (
              <option key={r} value={r}>
                {REASONING_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={liveWebSearch}
            onChange={(e) => setLiveWebSearch(e.target.checked)}
          />
          <span>Web 検索ツールを使う (固有名詞・最新動向の確認、コスト/レイテンシ増)</span>
        </label>
      </Section>

      <Section title="ファイナル分析" storageKey="final" defaultOpen={false}>
        <label>
          モデル
          <select value={finalModel} onChange={(e) => setFinalModel(e.target.value as LiveModel)}>
            {LIVE_MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {LIVE_MODEL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label>
          reasoning 強度
          <select
            value={finalReasoningEffort}
            onChange={(e) => setFinalReasoningEffort(e.target.value as ReasoningEffort)}
          >
            {REASONING_EFFORTS.map((r) => (
              <option key={r} value={r}>
                {REASONING_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={finalWebSearch}
            onChange={(e) => setFinalWebSearch(e.target.checked)}
          />
          <span>Web 検索ツールを使う (確定版なので質優先で ON 推奨)</span>
        </label>
      </Section>

      <div className="settings-actions">
        <button type="button" className="primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        {message && <span className="message">{message}</span>}
      </div>
    </section>
  )
}

function LinuxAudioSetup({
  onChanged
}: {
  onChanged: () => void
}): JSX.Element {
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
          <button type="button" disabled={busy} onClick={() => void wrap(window.api.linuxAudioTeardown)}>
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
