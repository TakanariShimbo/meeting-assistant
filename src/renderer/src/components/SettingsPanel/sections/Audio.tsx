import { AUDIO_MODE_LABELS, type AudioMode } from '@shared/types'
import { Section } from '../Section'
import { LinuxAudioSetup } from './LinuxAudio'

interface Props {
  audioMode: AudioMode
  onAudioModeChange: (next: AudioMode) => void
  micDeviceId: string
  onMicDeviceIdChange: (next: string) => void
  systemDeviceId: string
  onSystemDeviceIdChange: (next: string) => void
  devices: MediaDeviceInfo[]
  devicesLoading: boolean
  onRefreshDevices: () => Promise<void> | void
}

export function AudioSection({
  audioMode,
  onAudioModeChange,
  micDeviceId,
  onMicDeviceIdChange,
  systemDeviceId,
  onSystemDeviceIdChange,
  devices,
  devicesLoading,
  onRefreshDevices
}: Props): JSX.Element {
  const showMicPicker = audioMode === 'mic' || audioMode === 'mixed'
  const showSystemPicker = audioMode === 'system' || audioMode === 'mixed'

  return (
    <Section title="音声入力" storageKey="audio" defaultOpen={false}>
      <label>
        音声入力モード
        <select
          value={audioMode}
          onChange={(e) => onAudioModeChange(e.target.value as AudioMode)}
        >
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
          <button
            type="button"
            onClick={() => void onRefreshDevices()}
            disabled={devicesLoading}
          >
            {devicesLoading ? '取得中…' : '再読込'}
          </button>
        </div>

        {showMicPicker && (
          <DevicePicker
            label="マイク"
            value={micDeviceId}
            onChange={onMicDeviceIdChange}
            devices={devices}
            placeholder="既定のマイク"
            emptyValueLabel="既定のマイク"
          />
        )}

        {showSystemPicker && (
          <>
            <DevicePicker
              label="PC音声（ループバック/モニター）"
              value={systemDeviceId}
              onChange={onSystemDeviceIdChange}
              devices={devices}
              placeholder="— 選択してください —"
              emptyValueLabel="— 選択してください —"
            />
            <p className="hint">
              ヒント: Linux なら「Monitor of …」、Windows なら「ステレオミキサー」、macOS は
              BlackHole 等のループバック仮想デバイスを選択。
            </p>
          </>
        )}

        {showSystemPicker && window.api.platform === 'linux' && (
          <LinuxAudioSetup onChanged={() => void onRefreshDevices()} />
        )}
      </div>
    </Section>
  )
}

function DevicePicker({
  label,
  value,
  onChange,
  devices,
  emptyValueLabel
}: {
  label: string
  value: string
  onChange: (next: string) => void
  devices: MediaDeviceInfo[]
  placeholder: string
  emptyValueLabel: string
}): JSX.Element {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyValueLabel}</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `device:${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </label>
  )
}
