import {
  LIVE_MODEL_LABELS,
  LIVE_MODEL_OPTIONS,
  REASONING_EFFORTS,
  REASONING_LABELS,
  type LiveModel,
  type ReasoningEffort
} from '@shared/types'
import { Section } from '../Section'

/**
 * Both `Live` and `Final` analysis tracks share the same three knobs
 * (model + reasoning effort + web-search toggle). They used to be coded
 * twice in SettingsPanel; this is the consolidated component.
 */
export interface AnalysisModeValue {
  model: LiveModel
  reasoningEffort: ReasoningEffort
  webSearch: boolean
}

interface Props {
  title: string
  storageKey: string
  webSearchLabel: string
  value: AnalysisModeValue
  onChange: (next: AnalysisModeValue) => void
}

export function AnalysisModeSection({
  title,
  storageKey,
  webSearchLabel,
  value,
  onChange
}: Props): JSX.Element {
  const patch = (p: Partial<AnalysisModeValue>): void => onChange({ ...value, ...p })

  return (
    <Section title={title} storageKey={storageKey} defaultOpen={false}>
      <label>
        モデル
        <select
          value={value.model}
          onChange={(e) => patch({ model: e.target.value as LiveModel })}
        >
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
          value={value.reasoningEffort}
          onChange={(e) => patch({ reasoningEffort: e.target.value as ReasoningEffort })}
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
          checked={value.webSearch}
          onChange={(e) => patch({ webSearch: e.target.checked })}
        />
        <span>{webSearchLabel}</span>
      </label>
    </Section>
  )
}
