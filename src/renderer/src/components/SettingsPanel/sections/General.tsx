import { Section } from '../Section'

interface Props {
  hasApiKey: boolean
  apiKey: string
  onApiKeyChange: (next: string) => void
}

export function GeneralSection({ hasApiKey, apiKey, onApiKeyChange }: Props): JSX.Element {
  return (
    <Section title="一般" storageKey="general" defaultOpen={!hasApiKey}>
      <label>
        OpenAI API キー
        <input
          type="password"
          placeholder={hasApiKey ? '設定済み (変更する場合のみ入力)' : 'sk-...'}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          autoComplete="off"
        />
      </label>
    </Section>
  )
}
