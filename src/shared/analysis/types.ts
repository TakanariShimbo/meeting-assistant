export type AnalysisMode = 'live' | 'final'

export const MEETING_CATEGORIES = [
  'hearing',
  'ideation',
  'interview',
  'progress-check',
  '1on1',
  'other'
] as const
export type MeetingCategory = (typeof MEETING_CATEGORIES)[number]

export const MEETING_PHASES = [
  '導入',
  '議論中',
  '論点整理',
  '結論模索',
  'クロージング'
] as const
export type MeetingPhase = (typeof MEETING_PHASES)[number]

export type ConfidenceLevel = 'low' | 'med' | 'high'

// --- 個別アイテム型 ---

export interface DiscussionStep {
  step: string
  isCurrent: boolean
}

export interface MinutesSection {
  section: string
  points: string[]
}

export interface NotableQuote {
  quote: string
  /** 識別できれば話者名、無ければ null。マイクが1本なので推測ベース。 */
  speaker: string | null
  reason: string
}

export interface ConfirmationNeeded {
  point: string
  reason: string
}

export interface NextSuggestion {
  topic: string
  reason: string
}

export interface DecisionItem {
  decision: string
  reason: string
}

export interface ActionItem {
  who: string
  what: string
  /** 期限が明示されていれば文字列、無ければ null。 */
  by: string | null
  reason: string
}

export interface AgendaItem {
  topic: string
  reason: string
}

// --- 結果型 ---

export interface LiveAnalysis {
  // 整理
  category: MeetingCategory
  categoryConfidence: ConfidenceLevel
  phase: MeetingPhase
  briefStatus: string
  discussionFlow: DiscussionStep[]
  currentTopics: string[]
  keyFacts: string[]
  meetingPurpose: string | null
  summary: string
  minutes: MinutesSection[]
  notableQuotes: NotableQuote[]
  // アクション
  confirmationNeeded: ConfirmationNeeded[]
  nextSuggestions: NextSuggestion[]
  decisions: DecisionItem[]
  actionItems: ActionItem[]
}

export interface FinalAnalysis {
  // 整理
  category: MeetingCategory
  meetingPurpose: string | null
  summary: string
  minutes: MinutesSection[]
  keyFacts: string[]
  notableQuotes: NotableQuote[]
  // アクション
  decisions: DecisionItem[]
  actionItems: ActionItem[]
  nextAgenda: AgendaItem[]
}

export interface TranscriptSegment {
  itemId: string
  text: string
}

export interface AnalyzeRequest {
  mode: AnalysisMode
  newSegments: TranscriptSegment[]
  previous: LiveAnalysis | FinalAnalysis | null
}

export type AnalyzeResponse =
  | { ok: true; mode: 'live'; result: LiveAnalysis }
  | { ok: true; mode: 'final'; result: FinalAnalysis }
  | { ok: false; error: string }
