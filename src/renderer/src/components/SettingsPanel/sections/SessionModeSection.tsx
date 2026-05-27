import { SESSION_MODE_LABELS, SESSION_MODES, type SessionMode } from '@shared/types'
import { Section } from '../Section'

interface Props {
  value: SessionMode
  onChange: (next: SessionMode) => void
}

/**
 * Default Realtime session mode used when Start is pressed. The header
 * toggle can override per-session via `session.update`, so this is just
 * the starting point.
 */
export function SessionModeSection({ value, onChange }: Props): JSX.Element {
  return (
    <Section title="Realtime セッション" storageKey="realtime-session" defaultOpen={false}>
      <label>
        デフォルトの返答モード
        <select value={value} onChange={(e) => onChange(e.target.value as SessionMode)}>
          {SESSION_MODES.map((m) => (
            <option key={m} value={m}>
              {SESSION_MODE_LABELS[m]}
            </option>
          ))}
        </select>
        <p className="hint">
          手動返答: 「返答要求」を押したときだけ AI が応答 (会議メモ用途のデフォルト)。
          <br />
          自動返答: 発話の切れ目で AI が自動応答 (Realtime API の server VAD で turn 検知)。
          <br />
          セッション中もヘッダーのトグルで切り替え可。
        </p>
      </label>
    </Section>
  )
}
