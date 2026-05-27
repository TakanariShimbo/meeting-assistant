import type { ConfidenceLevel } from '@shared/analysis'

export const CATEGORY_LABEL: Record<string, string> = {
  hearing: 'ヒアリング',
  ideation: '案だし',
  interview: '面接',
  'progress-check': '進捗確認',
  '1on1': '1on1',
  other: 'その他'
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: '低',
  med: '中',
  high: '高'
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
