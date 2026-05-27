import type {
  ActionItem,
  AgendaItem,
  ConfirmationNeeded,
  DecisionItem,
  DiscussionStep,
  FinalAnalysis,
  LiveAnalysis,
  MinutesSection,
  NextSuggestion,
  NotableQuote
} from '@shared/analysis'
import type { TranscriptItem } from '../store'

const CATEGORY_LABEL: Record<string, string> = {
  hearing: 'ヒアリング',
  ideation: '案だし',
  interview: '面接',
  'progress-check': '進捗確認',
  '1on1': '1on1',
  other: 'その他'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// --- transcript ---

export function serializeTranscriptItem(item: TranscriptItem): string {
  // No speaker label for user-side audio: a single mic may capture multiple
  // people in a real meeting, so attributing the speech to "self" or "user"
  // would be misleading. Assistant lines stay explicitly tagged.
  const prefix = item.role === 'assistant' ? 'AI: ' : ''
  return `[${formatTime(item.createdAt)}] ${prefix}${item.text}`
}

export function serializeTranscript(items: TranscriptItem[]): string {
  return items
    .filter((i) => i.text.trim().length > 0)
    .map(serializeTranscriptItem)
    .join('\n')
}

// --- analysis primitives ---

export function bullets(items: string[], emptyHint = '（無し）'): string {
  if (items.length === 0) return emptyHint
  return items.map((i) => `- ${i}`).join('\n')
}

export function serializeDiscussionFlow(steps: DiscussionStep[]): string {
  if (steps.length === 0) return '（無し）'
  return steps
    .map((s, i) => `${i + 1}. ${s.step}${s.isCurrent ? ' ← いまここ' : ''}`)
    .join('\n')
}

export function serializeMinutes(sections: MinutesSection[]): string {
  if (sections.length === 0) return '（無し）'
  return sections
    .map((s) => `### ${s.section}\n${bullets(s.points)}`)
    .join('\n\n')
}

export function serializeQuotes(quotes: NotableQuote[]): string {
  if (quotes.length === 0) return '（無し）'
  return quotes
    .map((q) => {
      const speaker = q.speaker ? ` — ${q.speaker}` : ''
      return `> 「${q.quote}」${speaker}\n> _理由: ${q.reason}_`
    })
    .join('\n\n')
}

export function serializeConfirmations(items: ConfirmationNeeded[]): string {
  if (items.length === 0) return '（無し）'
  return items.map((c) => `- **${c.point}**\n  - 根拠: ${c.reason}`).join('\n')
}

export function serializeSuggestions(items: NextSuggestion[]): string {
  if (items.length === 0) return '（無し）'
  return items.map((s) => `- **${s.topic}**\n  - 根拠: ${s.reason}`).join('\n')
}

export function serializeDecisions(items: DecisionItem[]): string {
  if (items.length === 0) return '（無し）'
  return items.map((d) => `- **${d.decision}**\n  - 根拠: ${d.reason}`).join('\n')
}

export function serializeActionItems(items: ActionItem[]): string {
  if (items.length === 0) return '（無し）'
  return items
    .map((a) => {
      const by = a.by ? ` (期限: ${a.by})` : ''
      return `- **${a.who}**: ${a.what}${by}\n  - 根拠: ${a.reason}`
    })
    .join('\n')
}

export function serializeAgenda(items: AgendaItem[]): string {
  if (items.length === 0) return '（無し）'
  return items.map((a) => `- **${a.topic}**\n  - 根拠: ${a.reason}`).join('\n')
}

// --- whole analyses ---

export function serializeLiveAnalysis(r: LiveAnalysis): string {
  const parts: string[] = []
  parts.push('# ライブ分析')
  parts.push(
    [
      '## 現状',
      `- カテゴリ: ${CATEGORY_LABEL[r.category] ?? r.category} (確信度: ${r.categoryConfidence})`,
      `- フェーズ: ${r.phase}`,
      `- 状況: ${r.briefStatus}`
    ].join('\n')
  )
  if (r.meetingPurpose) parts.push(`## 会議の目的\n${r.meetingPurpose}`)
  parts.push(`## 議論の流れ\n${serializeDiscussionFlow(r.discussionFlow)}`)
  parts.push(`## 現在の論点\n${bullets(r.currentTopics, '（特になし）')}`)
  parts.push(`## 重要事実\n${bullets(r.keyFacts, '（まだ無し）')}`)
  parts.push(`## ここまでの要約\n${r.summary || '（無し）'}`)
  parts.push(`## ここまでの議事録\n${serializeMinutes(r.minutes)}`)
  parts.push(`## 重要発言\n${serializeQuotes(r.notableQuotes)}`)
  parts.push(`## 要確認\n${serializeConfirmations(r.confirmationNeeded)}`)
  parts.push(`## 次の話題の提案\n${serializeSuggestions(r.nextSuggestions)}`)
  parts.push(`## ここまでの決定事項\n${serializeDecisions(r.decisions)}`)
  parts.push(`## ここまでのアクションアイテム\n${serializeActionItems(r.actionItems)}`)
  return parts.join('\n\n')
}

export function serializeFinalAnalysis(r: FinalAnalysis): string {
  const parts: string[] = []
  parts.push('# 議事録')
  parts.push(`カテゴリ: ${CATEGORY_LABEL[r.category] ?? r.category}`)
  if (r.meetingPurpose) parts.push(`## 会議の目的\n${r.meetingPurpose}`)
  parts.push(`## 要約\n${r.summary || '（無し）'}`)
  parts.push(`## 重要事実\n${bullets(r.keyFacts)}`)
  parts.push(`## 議事録（時系列）\n${serializeMinutes(r.minutes)}`)
  parts.push(`## 重要発言\n${serializeQuotes(r.notableQuotes)}`)
  parts.push(`## 決定事項\n${serializeDecisions(r.decisions)}`)
  parts.push(`## アクションアイテム\n${serializeActionItems(r.actionItems)}`)
  parts.push(`## 次回アジェンダ案\n${serializeAgenda(r.nextAgenda)}`)
  return parts.join('\n\n')
}
