import type { ChatRequest, ChatResponse } from '@shared/chat'
import { RESPONSES_URL } from '../constants'
import { getApiKey, getAppSettings } from '../settings'
import { buildChatBody } from './request'
import { consumeChatStream } from './stream'

export type ChatTextEmitter = (text: string) => void

let emitText: ChatTextEmitter = () => {
  /* default no-op; main wires up the real emitter at startup */
}

export function setChatTextEmitter(fn: ChatTextEmitter): void {
  emitText = fn
}

// Only one chat request can be in flight at a time. Holding the controller
// here (rather than passing it around) keeps the renderer's cancel call
// dead simple — no request ID bookkeeping.
let inflight: AbortController | null = null

export function cancelChat(): void {
  inflight?.abort()
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const apiKey = await getApiKey()
  if (!apiKey) return { ok: false, error: 'OpenAI API キーが未設定です' }

  if (req.messages.length === 0) {
    return { ok: false, error: 'メッセージが空です' }
  }

  const settings = await getAppSettings()
  const body = buildChatBody({
    req,
    model: settings.chatModel,
    effort: settings.chatReasoningEffort,
    webSearch: settings.chatWebSearch
  })

  // Replace any previous in-flight request — single concurrent chat at a time.
  inflight?.abort()
  const controller = new AbortController()
  inflight = controller

  let resp: Response
  try {
    resp = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (err) {
    inflight = null
    if (controller.signal.aborted) return { ok: false, error: '中断されました' }
    return { ok: false, error: `Responses API request failed: ${(err as Error).message}` }
  }

  if (!resp.ok) {
    inflight = null
    const errText = await resp.text().catch(() => '')
    return { ok: false, error: `Responses API HTTP ${resp.status}: ${errText}` }
  }
  if (!resp.body) {
    inflight = null
    return { ok: false, error: 'Responses API returned no streaming body' }
  }

  let text: string
  try {
    text = await consumeChatStream(resp.body, emitText, controller.signal)
  } catch (err) {
    inflight = null
    if (controller.signal.aborted) {
      return { ok: false, error: '中断されました', partialText: undefined }
    }
    return { ok: false, error: `Stream read failed: ${(err as Error).message}` }
  } finally {
    if (inflight === controller) inflight = null
  }

  if (controller.signal.aborted) {
    return { ok: false, error: '中断されました', partialText: text || undefined }
  }
  if (!text) {
    return { ok: false, error: 'Responses API stream produced no output text' }
  }
  return { ok: true, text }
}
