// OpenAI structured-output strict form: all properties must be listed in
// `required`; nullable fields use type tuples like `["string","null"]`.

import { MEETING_CATEGORIES, MEETING_PHASES } from './types'

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
