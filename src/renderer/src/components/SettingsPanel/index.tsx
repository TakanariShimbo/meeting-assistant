import { useEffect, useState } from 'react'
import type { AppSettings, AudioMode, LanguageCode } from '@shared/types'
import { enumerateAudioInputs } from '../../audio'
import { AnalysisModeSection, type AnalysisModeValue } from './sections/AnalysisModeSection'
import { AudioSection } from './sections/Audio'
import { GeneralSection } from './sections/General'
import { TranscriptionSection } from './sections/Transcription'

interface Props {
  settings: AppSettings
  onSaved: () => Promise<void> | void
  onClose: () => void
}

export function SettingsPanel({ settings, onSaved, onClose }: Props): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [instructions, setInstructions] = useState(settings.instructions)
  const [language, setLanguage] = useState<LanguageCode>(settings.language)
  const [audioMode, setAudioMode] = useState<AudioMode>(settings.audioMode)
  const [micDeviceId, setMicDeviceId] = useState<string>(settings.micDeviceId ?? '')
  const [systemDeviceId, setSystemDeviceId] = useState<string>(settings.systemDeviceId ?? '')
  const [liveAnalysis, setLiveAnalysis] = useState<AnalysisModeValue>({
    model: settings.liveModel,
    reasoningEffort: settings.liveReasoningEffort,
    webSearch: settings.liveWebSearch
  })
  const [finalAnalysis, setFinalAnalysis] = useState<AnalysisModeValue>({
    model: settings.finalModel,
    reasoningEffort: settings.finalReasoningEffort,
    webSearch: settings.finalWebSearch
  })
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
        liveModel: liveAnalysis.model,
        liveReasoningEffort: liveAnalysis.reasoningEffort,
        liveWebSearch: liveAnalysis.webSearch,
        finalModel: finalAnalysis.model,
        finalReasoningEffort: finalAnalysis.reasoningEffort,
        finalWebSearch: finalAnalysis.webSearch
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

  return (
    <section className="settings">
      <div className="settings-header">
        <h2>設定</h2>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>

      <GeneralSection
        hasApiKey={settings.hasApiKey}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
      />

      <TranscriptionSection
        language={language}
        onLanguageChange={setLanguage}
        instructions={instructions}
        onInstructionsChange={setInstructions}
      />

      <AudioSection
        audioMode={audioMode}
        onAudioModeChange={setAudioMode}
        micDeviceId={micDeviceId}
        onMicDeviceIdChange={setMicDeviceId}
        systemDeviceId={systemDeviceId}
        onSystemDeviceIdChange={setSystemDeviceId}
        devices={devices}
        devicesLoading={devicesLoading}
        onRefreshDevices={refreshDevices}
      />

      <AnalysisModeSection
        title="ライブ分析"
        storageKey="live"
        webSearchLabel="Web 検索ツールを使う (固有名詞・最新動向の確認、コスト/レイテンシ増)"
        value={liveAnalysis}
        onChange={setLiveAnalysis}
      />

      <AnalysisModeSection
        title="ファイナル分析"
        storageKey="final"
        webSearchLabel="Web 検索ツールを使う (確定版なので質優先で ON 推奨)"
        value={finalAnalysis}
        onChange={setFinalAnalysis}
      />

      <div className="settings-actions">
        <button type="button" className="primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        {message && <span className="message">{message}</span>}
      </div>
    </section>
  )
}
