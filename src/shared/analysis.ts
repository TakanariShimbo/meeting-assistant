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

// --- JSON Schemas (OpenAI structured-output strict form) ---
// All properties must be in `required`; nullable fields use `["...","null"]`.

const minutesSectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['section', 'points'],
  properties: {
    section: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } }
  }
} as const

const notableQuoteSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['quote', 'speaker', 'reason'],
  properties: {
    quote: { type: 'string' },
    speaker: { type: ['string', 'null'] },
    reason: { type: 'string' }
  }
} as const

const decisionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'reason'],
  properties: {
    decision: { type: 'string' },
    reason: { type: 'string' }
  }
} as const

const actionItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['who', 'what', 'by', 'reason'],
  properties: {
    who: { type: 'string' },
    what: { type: 'string' },
    by: { type: ['string', 'null'] },
    reason: { type: 'string' }
  }
} as const

const reasonedTopicSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'reason'],
  properties: {
    topic: { type: 'string' },
    reason: { type: 'string' }
  }
} as const

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['point', 'reason'],
  properties: {
    point: { type: 'string' },
    reason: { type: 'string' }
  }
} as const

const discussionStepSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['step', 'isCurrent'],
  properties: {
    step: { type: 'string' },
    isCurrent: { type: 'boolean' }
  }
} as const

export const LIVE_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'category',
    'categoryConfidence',
    'phase',
    'briefStatus',
    'discussionFlow',
    'currentTopics',
    'keyFacts',
    'meetingPurpose',
    'summary',
    'minutes',
    'notableQuotes',
    'confirmationNeeded',
    'nextSuggestions',
    'decisions',
    'actionItems'
  ],
  properties: {
    category: { type: 'string', enum: [...MEETING_CATEGORIES] },
    categoryConfidence: { type: 'string', enum: ['low', 'med', 'high'] },
    phase: { type: 'string', enum: [...MEETING_PHASES] },
    briefStatus: { type: 'string' },
    discussionFlow: { type: 'array', items: discussionStepSchema },
    currentTopics: { type: 'array', items: { type: 'string' } },
    keyFacts: { type: 'array', items: { type: 'string' } },
    meetingPurpose: { type: ['string', 'null'] },
    summary: { type: 'string' },
    minutes: { type: 'array', items: minutesSectionSchema },
    notableQuotes: { type: 'array', items: notableQuoteSchema },
    confirmationNeeded: { type: 'array', items: confirmationSchema },
    nextSuggestions: { type: 'array', items: reasonedTopicSchema },
    decisions: { type: 'array', items: decisionSchema },
    actionItems: { type: 'array', items: actionItemSchema }
  }
} as const

export const FINAL_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'category',
    'meetingPurpose',
    'summary',
    'minutes',
    'keyFacts',
    'notableQuotes',
    'decisions',
    'actionItems',
    'nextAgenda'
  ],
  properties: {
    category: { type: 'string', enum: [...MEETING_CATEGORIES] },
    meetingPurpose: { type: ['string', 'null'] },
    summary: { type: 'string' },
    minutes: { type: 'array', items: minutesSectionSchema },
    keyFacts: { type: 'array', items: { type: 'string' } },
    notableQuotes: { type: 'array', items: notableQuoteSchema },
    decisions: { type: 'array', items: decisionSchema },
    actionItems: { type: 'array', items: actionItemSchema },
    nextAgenda: { type: 'array', items: reasonedTopicSchema }
  }
} as const
