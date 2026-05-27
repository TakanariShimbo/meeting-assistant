// SSE consumer for the Responses API in plain-text mode (no JSON Schema).
// Each delta is appended to the accumulator and the latest text is emitted
// to the renderer for live display. Throttled the same way as the analyzer
// stream so we don't flood the IPC bridge.
//
// Mirrors analyzer/stream.ts but specialized for plain text — no partial
// JSON parsing or defaulting needed.

import { ANALYZER_PARTIAL_THROTTLE_MS } from '../constants'

export type ChatTextEmitter = (text: string) => void

export async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  emit: ChatTextEmitter,
  signal: AbortSignal
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let accumulated = ''
  let lastEmitAt = 0

  const flush = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastEmitAt < ANALYZER_PARTIAL_THROTTLE_MS) return
    lastEmitAt = now
    emit(accumulated)
  }

  // If the request is aborted while reading, cancel the reader to release the
  // underlying socket promptly.
  const onAbort = (): void => {
    reader.cancel().catch(() => {
      /* already-closed reader; ignore */
    })
  }
  signal.addEventListener('abort', onAbort)

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
            flush()
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
    signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }

  flush(true)
  return accumulated
}
