import { create } from 'zustand'
import type {
  AnalysisMode,
  FinalAnalysis,
  LiveAnalysis,
  TranscriptSegment
} from '@shared/analysis'

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface TranscriptItem {
  id: string
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

interface State {
  status: SessionStatus
  errorMessage: string | null
  items: TranscriptItem[]
  live: ModeState<LiveAnalysis>
  final: ModeState<FinalAnalysis>

  setStatus: (s: SessionStatus, err?: string | null) => void
  upsertDelta: (id: string, delta: string) => void
  upsertFinal: (id: string, text: string) => void
  clear: () => void

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

export const useStore = create<State>((set, get) => ({
  status: 'idle',
  errorMessage: null,
  items: [],
  live: initialModeState<LiveAnalysis>(),
  final: initialModeState<FinalAnalysis>(),

  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),

  upsertDelta: (id, delta) =>
    set((s) => {
      const idx = s.items.findIndex((i) => i.id === id)
      if (idx === -1) {
        return {
          items: [...s.items, { id, text: delta, isFinal: false, createdAt: Date.now() }]
        }
      }
      const next = s.items.slice()
      next[idx] = { ...next[idx], text: next[idx].text + delta }
      return { items: next }
    }),

  upsertFinal: (id, text) =>
    set((s) => {
      const idx = s.items.findIndex((i) => i.id === id)
      if (idx === -1) {
        return {
          items: [...s.items, { id, text, isFinal: true, createdAt: Date.now() }]
        }
      }
      const next = s.items.slice()
      next[idx] = { ...next[idx], text, isFinal: true }
      return { items: next }
    }),

  clear: () =>
    set({
      items: [],
      live: initialModeState<LiveAnalysis>(),
      final: initialModeState<FinalAnalysis>()
    }),

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
