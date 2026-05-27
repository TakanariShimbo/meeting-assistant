import { LANGUAGE_OPTIONS, type LanguageCode } from '@shared/types'
import { Section } from '../Section'

interface Props {
  language: LanguageCode
  onLanguageChange: (next: LanguageCode) => void
  instructions: string
  onInstructionsChange: (next: string) => void
}

export function TranscriptionSection({
  language,
  onLanguageChange,
  instructions,
  onInstructionsChange
}: Props): JSX.Element {
  return (
    <Section title="文字起こし" storageKey="transcription" defaultOpen={false}>
      <label>
        言語
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as LanguageCode)}
        >
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
          onChange={(e) => onInstructionsChange(e.target.value)}
        />
        <p className="hint">
          Realtime API のセッションに渡される system prompt。文字起こし対象の文脈や言い回し
          の癖を伝えるのに使えます (例: 「会議名: 〇〇プロジェクト」など)。
        </p>
      </label>
    </Section>
  )
}
