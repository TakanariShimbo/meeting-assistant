import { create } from 'zustand'
import type {
  AnalysisMode,
  FinalAnalysis,
  LiveAnalysis,
  TranscriptSegment
} from '@shared/analysis'
import type { ChatMessage } from '@shared/chat'
import type { SessionMode } from '@shared/types'

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'paused' | 'error'

export type TranscriptRole = 'user' | 'assistant'

export interface TranscriptItem {
  id: string
  /** 'user' for human transcripts, 'assistant' for AI replies in conversation mode. */
  role: TranscriptRole
  text: string
  isFinal: boolean
  createdAt: number
}

export type AnalysisStatus = 'idle' | 'running' | 'ready' | 'error'

interface ModeState<T> {
  status: AnalysisStatus
  result: T | null
  errorMessage: string | null
  lastRunAt: number | null
  /** Item id we've already fed into the analyzer; next run sends items after this. */
  analyzedThroughItemId: string | null
  /** Live progress from the Responses API stream (only meaningful while running). */
  progressPhase: 'reasoning' | 'output' | null
  progressChars: number
  /** Best-effort partial parse during streaming; cards render from this when set. */
  progressPartial: T | null
}

export interface ChatSlice {
  /** Committed messages (user + completed assistant turns). */
  messages: ChatMessage[]
  /** While streaming, the in-progress assistant text not yet committed. */
  streamingText: string
  streaming: boolean
  errorMessage: string | null
}

interface State {
  status: SessionStatus
  errorMessage: string | null
  items: TranscriptItem[]
  live: ModeState<LiveAnalysis>
  final: ModeState<FinalAnalysis>
  chat: ChatSlice
  /** Realtime session mode currently in effect (mirrors what client sent). */
  sessionMode: SessionMode
  /** True while assistant audio is playing back. */
  assistantSpeaking: boolean

  setStatus: (s: SessionStatus, err?: string | null) => void
  upsertDelta: (id: string, delta: string) => void
  upsertFinal: (id: string, text: string) => void
  /** Assistant transcript streaming (conversation mode). Same upsert semantics as user. */
  upsertAssistantDelta: (id: string, delta: string) => void
  upsertAssistantFinal: (id: string, text: string) => void
  setSessionMode: (mode: SessionMode) => void
  setAssistantSpeaking: (speaking: boolean) => void
  clear: () => void

  appendChatMessage: (msg: ChatMessage) => void
  setChatStreaming: (streaming: boolean) => void
  setChatStreamingText: (text: string) => void
  setChatError: (err: string | null) => void
  clearChat: () => void

  /** Final items after the given cutoff (null = from the start). */
  getSegmentsSince: (cutoffItemId: string | null) => TranscriptSegment[]
  /** Returns the last final item id (or null if no final items yet). */
  getLastFinalItemId: () => string | null

  setAnalysisRunning: (mode: AnalysisMode) => void
  setAnalysisResult: (
    mode: AnalysisMode,
    result: LiveAnalysis | FinalAnalysis,
    throughItemId: string | null
  ) => void
  setAnalysisError: (mode: AnalysisMode, error: string) => void
  setAnalysisProgress: (
    mode: AnalysisMode,
    phase: 'reasoning' | 'output',
    chars: number,
    partial: LiveAnalysis | FinalAnalysis | null
  ) => void
}

const initialModeState = <T,>(): ModeState<T> => ({
  status: 'idle',
  result: null,
  errorMessage: null,
  lastRunAt: null,
  analyzedThroughItemId: null,
  progressPhase: null,
  progressChars: 0,
  progressPartial: null
})

const initialChat: ChatSlice = {
  messages: [],
  streamingText: '',
  streaming: false,
  errorMessage: null
}

/**
 * Upsert a transcript item. Either `delta` (append-and-leave-partial) or
 * `final` (replace-text-mark-final) must be supplied. The role is preserved
 * across updates — a streaming `assistant` item never gets re-classified.
 */
function upsertItem(
  items: TranscriptItem[],
  id: string,
  role: TranscriptRole,
  payload: { delta?: string; final?: string }
): TranscriptItem[] {
  const idx = items.findIndex((i) => i.id === id)
  if (idx === -1) {
    return [
      ...items,
      {
        id,
        role,
        text: payload.final ?? payload.delta ?? '',
        isFinal: payload.final !== undefined,
        createdAt: Date.now()
      }
    ]
  }
  const next = items.slice()
  const prev = next[idx]
  if (payload.final !== undefined) {
    next[idx] = { ...prev, text: payload.final, isFinal: true }
  } else {
    next[idx] = { ...prev, text: prev.text + (payload.delta ?? '') }
  }
  return next
}

export const useStore = create<State>((set, get) => ({
  status: 'idle',
  errorMessage: null,
  items: [],
  live: initialModeState<LiveAnalysis>(),
  final: initialModeState<FinalAnalysis>(),
  chat: initialChat,
  sessionMode: 'meeting',
  assistantSpeaking: false,

  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),

  upsertDelta: (id, delta) =>
    set((s) => ({ items: upsertItem(s.items, id, 'user', { delta }) })),

  upsertFinal: (id, text) =>
    set((s) => ({ items: upsertItem(s.items, id, 'user', { final: text }) })),

  upsertAssistantDelta: (id, delta) =>
    set((s) => ({ items: upsertItem(s.items, id, 'assistant', { delta }) })),

  upsertAssistantFinal: (id, text) =>
    set((s) => ({ items: upsertItem(s.items, id, 'assistant', { final: text }) })),

  setSessionMode: (sessionMode) => set({ sessionMode }),

  setAssistantSpeaking: (assistantSpeaking) => set({ assistantSpeaking }),

  clear: () =>
    set({
      items: [],
      live: initialModeState<LiveAnalysis>(),
      final: initialModeState<FinalAnalysis>(),
      chat: initialChat,
      assistantSpeaking: false
    }),

  appendChatMessage: (msg) =>
    set((s) => ({ chat: { ...s.chat, messages: [...s.chat.messages, msg] } })),

  setChatStreaming: (streaming) =>
    set((s) => ({
      chat: {
        ...s.chat,
        streaming,
        // Starting fresh streaming run — clear any previous error so the UI
        // doesn't show a stale message above the live tokens.
        errorMessage: streaming ? null : s.chat.errorMessage,
        streamingText: streaming ? '' : s.chat.streamingText
      }
    })),

  setChatStreamingText: (text) =>
    set((s) => ({ chat: { ...s.chat, streamingText: text } })),

  setChatError: (errorMessage) => set((s) => ({ chat: { ...s.chat, errorMessage } })),

  clearChat: () => set({ chat: initialChat }),

  getSegmentsSince: (cutoffItemId) => {
    // Include partial (still-streaming) items too — Live analysis benefits
    // from seeing the latest in-progress speech. Each partial gets re-sent
    // on the next run once it becomes final, so any text drift from sending
    // it half-formed is naturally corrected next time.
    const all = get().items.filter((i) => i.text.trim().length > 0)
    if (!cutoffItemId) return all.map((i) => ({ itemId: i.id, text: i.text }))
    const cutIdx = all.findIndex((i) => i.id === cutoffItemId)
    const after = cutIdx === -1 ? all : all.slice(cutIdx + 1)
    return after.map((i) => ({ itemId: i.id, text: i.text }))
  },

  getLastFinalItemId: () => {
    const finals = get().items.filter((i) => i.isFinal)
    return finals.length > 0 ? finals[finals.length - 1].id : null
  },

  setAnalysisRunning: (mode) =>
    set(
      (s) =>
        ({
          [mode]: {
            ...s[mode],
            status: 'running',
            errorMessage: null,
            progressPhase: null,
            progressChars: 0,
            progressPartial: null
          }
        }) as Partial<State>
    ),

  setAnalysisResult: (mode, result, throughItemId) =>
    set(
      (s) =>
        ({
          [mode]: {
            ...s[mode],
            status: 'ready',
            // Result type narrowing is safe — caller passes matching mode.
            result: result as never,
            errorMessage: null,
            lastRunAt: Date.now(),
            analyzedThroughItemId: throughItemId ?? s[mode].analyzedThroughItemId,
            progressPhase: null,
            progressChars: 0,
            progressPartial: null
          }
        }) as Partial<State>
    ),

  setAnalysisError: (mode, error) =>
    set(
      (s) =>
        ({
          [mode]: {
            ...s[mode],
            status: 'error',
            errorMessage: error,
            progressPhase: null,
            progressChars: 0
            // Intentionally NOT clearing progressPartial — the user keeps
            // whatever fields the stream had managed to deliver so the panel
            // doesn't go blank when the final parse fails.
          }
        }) as Partial<State>
    ),

  setAnalysisProgress: (mode, phase, chars, partial) =>
    set(
      (s) =>
        ({
          [mode]: {
            ...s[mode],
            progressPhase: phase,
            progressChars: chars,
            // Keep the previous partial if no new one came in (e.g., emit
            // happened before the throttle window).
            progressPartial: partial ?? s[mode].progressPartial
          }
        }) as Partial<State>
    )
}))
