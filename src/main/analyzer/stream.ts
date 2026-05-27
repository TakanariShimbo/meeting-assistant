// SSE consumer for the Responses API. Accumulates output_text deltas,
// throttles partial-result emission, and returns the full JSON text when
// the stream completes. Doesn't know about the schema or the analyzer
// orchestrator — just text-in / text-out + progress callbacks.
//
// SSE wire format from /v1/responses:
//   event: response.output_text.delta
//   data: {"type":"response.output_text.delta","delta":"...","sequence_number":N,...}
// Events are separated by blank lines (\n\n).

import type { AnalysisMode, FinalAnalysis, LiveAnalysis } from '@shared/analysis'
import { ANALYZER_PARTIAL_THROTTLE_MS } from '../constants'
import { fillFinalDefaults, fillLiveDefaults } from './defaults'
import { tryPartialParse } from './partialJson'

export interface AnalysisProgress {
  mode: AnalysisMode
  /** 'reasoning' (model is thinking) or 'output' (text is streaming). */
  phase: 'reasoning' | 'output'
  /** Characters of output text streamed so far (0 during reasoning). */
  outputChars: number
  /** Best-effort partial parse, with missing fields filled with defaults. */
  partialResult?: LiveAnalysis | FinalAnalysis
}

export type ProgressEmitter = (p: AnalysisProgress) => void

export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  mode: AnalysisMode,
  emit: ProgressEmitter
): Promise<string | null> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let accumulated = ''
  let lastPartialAt = 0

  const emitPartial = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastPartialAt < ANALYZER_PARTIAL_THROTTLE_MS) {
      emit({ mode, phase: 'output', outputChars: accumulated.length })
      return
    }
    lastPartialAt = now
    const parsed = tryPartialParse(accumulated)
    const partialResult =
      parsed && typeof parsed === 'object'
        ? mode === 'live'
          ? fillLiveDefaults(parsed as Record<string, unknown>)
          : fillFinalDefaults(parsed as Record<string, unknown>)
        : undefined
    emit({ mode, phase: 'output', outputChars: accumulated.length, partialResult })
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const rawEvent = buf.slice(0, sep)
        buf = buf.slice(sep + 2)

        const lines = rawEvent.split('\n')
        let dataLine: string | null = null
        for (const line of lines) {
          if (line.startsWith('data: ')) dataLine = line.slice(6)
          else if (line.startsWith('data:')) dataLine = line.slice(5).trimStart()
        }
        if (!dataLine || dataLine === '[DONE]') continue

        try {
          const evt = JSON.parse(dataLine) as {
            type?: string
            delta?: string
            text?: string
          }
          if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
            accumulated += evt.delta
            emitPartial()
          } else if (evt.type === 'response.output_text.done' && typeof evt.text === 'string') {
            // Some streams send the full text on done; prefer it if longer.
            if (evt.text.length > accumulated.length) accumulated = evt.text
          }
        } catch {
          /* skip malformed event */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return accumulated || null
}
