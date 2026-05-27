// The schema is fully-required (strict mode). Partial parses (from the
// streaming SSE consumer) may be missing fields OR contain items with
// missing inner fields (e.g. a `minutes` section streamed before its
// `points` array arrived). We deep-validate every nested item so the UI
// can `.length` / `.map` freely without crashing.

import type { FinalAnalysis, LiveAnalysis } from '@shared/analysis'
import {
  asBoolean,
  asObject,
  asString,
  asStringArray,
  asStringOrNull,
  asUnknownArray
} from '../utils/safeJson'

function safeDiscussionStep(v: unknown): LiveAnalysis['discussionFlow'][number] {
  const o = asObject(v)
  return { step: asString(o.step), isCurrent: asBoolean(o.isCurrent) }
}

function safeMinutesSection(v: unknown): LiveAnalysis['minutes'][number] {
  const o = asObject(v)
  return { section: asString(o.section), points: asStringArray(o.points) }
}

function safeNotableQuote(v: unknown): LiveAnalysis['notableQuotes'][number] {
  const o = asObject(v)
  return {
    quote: asString(o.quote),
    speaker: asStringOrNull(o.speaker),
    reason: asString(o.reason)
  }
}

function safeConfirmationNeeded(v: unknown): LiveAnalysis['confirmationNeeded'][number] {
  const o = asObject(v)
  return { point: asString(o.point), reason: asString(o.reason) }
}

function safeNextSuggestion(v: unknown): LiveAnalysis['nextSuggestions'][number] {
  const o = asObject(v)
  return { topic: asString(o.topic), reason: asString(o.reason) }
}

function safeDecision(v: unknown): LiveAnalysis['decisions'][number] {
  const o = asObject(v)
  return { decision: asString(o.decision), reason: asString(o.reason) }
}

function safeActionItem(v: unknown): LiveAnalysis['actionItems'][number] {
  const o = asObject(v)
  return {
    who: asString(o.who),
    what: asString(o.what),
    by: asStringOrNull(o.by),
    reason: asString(o.reason)
  }
}

function safeAgenda(v: unknown): FinalAnalysis['nextAgenda'][number] {
  const o = asObject(v)
  return { topic: asString(o.topic), reason: asString(o.reason) }
}

export function fillLiveDefaults(p: Record<string, unknown>): LiveAnalysis {
  return {
    category: (p.category as LiveAnalysis['category']) ?? 'other',
    categoryConfidence: (p.categoryConfidence as LiveAnalysis['categoryConfidence']) ?? 'low',
    phase: (p.phase as LiveAnalysis['phase']) ?? '導入',
    briefStatus: asString(p.briefStatus),
    discussionFlow: asUnknownArray(p.discussionFlow).map(safeDiscussionStep),
    currentTopics: asStringArray(p.currentTopics),
    keyFacts: asStringArray(p.keyFacts),
    meetingPurpose: asStringOrNull(p.meetingPurpose),
    summary: asString(p.summary),
    minutes: asUnknownArray(p.minutes).map(safeMinutesSection),
    notableQuotes: asUnknownArray(p.notableQuotes).map(safeNotableQuote),
    confirmationNeeded: asUnknownArray(p.confirmationNeeded).map(safeConfirmationNeeded),
    nextSuggestions: asUnknownArray(p.nextSuggestions).map(safeNextSuggestion),
    decisions: asUnknownArray(p.decisions).map(safeDecision),
    actionItems: asUnknownArray(p.actionItems).map(safeActionItem)
  }
}

export function fillFinalDefaults(p: Record<string, unknown>): FinalAnalysis {
  return {
    category: (p.category as FinalAnalysis['category']) ?? 'other',
    meetingPurpose: asStringOrNull(p.meetingPurpose),
    summary: asString(p.summary),
    minutes: asUnknownArray(p.minutes).map(safeMinutesSection),
    keyFacts: asStringArray(p.keyFacts),
    notableQuotes: asUnknownArray(p.notableQuotes).map(safeNotableQuote),
    decisions: asUnknownArray(p.decisions).map(safeDecision),
    actionItems: asUnknownArray(p.actionItems).map(safeActionItem),
    nextAgenda: asUnknownArray(p.nextAgenda).map(safeAgenda)
  }
}
