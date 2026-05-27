import type {
  AnalyzeRequest,
  AnalyzeResponse,
  FinalAnalysis,
  LiveAnalysis
} from '@shared/analysis'
import { RESPONSES_URL } from '../constants'
import { getApiKey, getAppSettings } from '../settings'
import { fillFinalDefaults, fillLiveDefaults } from './defaults'
import { tryPartialParse } from './partialJson'
import { buildResponsesBody } from './request'
import { consumeStream, type AnalysisProgress, type ProgressEmitter } from './stream'

export type { AnalysisProgress } from './stream'

let emitProgress: ProgressEmitter = () => {
  /* default no-op; main wires up the real emitter at startup */
}

export function setProgressEmitter(fn: ProgressEmitter): void {
  emitProgress = fn
}

export async function analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const apiKey = await getApiKey()
  if (!apiKey) return { ok: false, error: 'OpenAI API キーが未設定です' }

  if (req.newSegments.length === 0 && !req.previous) {
    return { ok: false, error: '分析するための文字起こしがまだありません' }
  }

  const settings = await getAppSettings()
  const model = req.mode === 'live' ? settings.liveModel : settings.finalModel
  const effort =
    req.mode === 'live' ? settings.liveReasoningEffort : settings.finalReasoningEffort
  const webSearch = req.mode === 'live' ? settings.liveWebSearch : settings.finalWebSearch

  const body = buildResponsesBody({ req, model, effort, webSearch })

  let resp: Response
  try {
    resp = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(body)
    })
  } catch (err) {
    return { ok: false, error: `Responses API request failed: ${(err as Error).message}` }
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    return { ok: false, error: `Responses API HTTP ${resp.status}: ${errText}` }
  }

  if (!resp.body) {
    return { ok: false, error: 'Responses API returned no streaming body' }
  }

  // Kick off "thinking" phase so the UI shows immediate activity. We don't
  // know yet whether it'll be reasoning or output first; reasoning is the
  // common case for gpt-5 family.
  emitProgress({ mode: req.mode, phase: 'reasoning', outputChars: 0 } satisfies AnalysisProgress)

  let jsonText: string | null
  try {
    jsonText = await consumeStream(resp.body, req.mode, emitProgress)
  } catch (err) {
    return { ok: false, error: `Stream read failed: ${(err as Error).message}` }
  }

  if (!jsonText) {
    return { ok: false, error: 'Responses API stream produced no output text' }
  }

  // Primary path: the stream produced complete, schema-conformant JSON.
  try {
    const result = JSON.parse(jsonText)
    if (req.mode === 'live') {
      return { ok: true, mode: 'live', result: result as LiveAnalysis }
    }
    return { ok: true, mode: 'final', result: result as FinalAnalysis }
  } catch (err) {
    // Fallback: stream ended on incomplete JSON (model cutoff, network blip,
    // budget exhausted, …). Recover whatever fields we can with the partial
    // parser so the user keeps the work the model has already done.
    const partial = tryPartialParse(jsonText)
    if (partial && typeof partial === 'object') {
      if (req.mode === 'live') {
        return { ok: true, mode: 'live', result: fillLiveDefaults(partial as Record<string, unknown>) }
      }
      return { ok: true, mode: 'final', result: fillFinalDefaults(partial as Record<string, unknown>) }
    }
    return { ok: false, error: `Structured output parse failed: ${(err as Error).message}` }
  }
}
