// Builds the multipart-ish `messages` array + Responses API body. Kept
// separate so the orchestrator can stay short and the prompts / schemas can
// be changed without touching the transport layer.

import {
  FINAL_ANALYSIS_SCHEMA,
  LIVE_ANALYSIS_SCHEMA,
  type AnalyzeRequest
} from '@shared/analysis'
import type { ReasoningEffort } from '@shared/types'
import { getAttachmentsForAnalyzer } from '../attachments'
import { LIVE_SYSTEM, FINAL_SYSTEM, WEB_SEARCH_NOTE } from './prompts'

type ContentBlock =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; filename: string; file_data: string }

interface InputMessage {
  role: 'system' | 'user'
  content: string | ContentBlock[]
}

export interface ResponsesApiBody {
  model: string
  reasoning: { effort: ReasoningEffort }
  input: InputMessage[]
  text: {
    format: {
      type: 'json_schema'
      name: string
      schema: unknown
      strict: true
    }
  }
  tools?: Array<{ type: string }>
  stream?: boolean
}

export interface BuildBodyOptions {
  req: AnalyzeRequest
  model: string
  effort: ReasoningEffort
  webSearch: boolean
}

export function buildResponsesBody({ req, model, effort, webSearch }: BuildBodyOptions): ResponsesApiBody {
  const transcriptText = req.newSegments.map((s) => s.text).join('\n')
  const previousJson = req.previous ? JSON.stringify(req.previous, null, 2) : 'なし（初回分析）'
  const userPrompt = `[previous_analysis]
${previousJson}

[new_transcript]
${transcriptText || '（新規発話なし）'}
`

  const baseSystem = req.mode === 'live' ? LIVE_SYSTEM : FINAL_SYSTEM
  const systemContent = webSearch ? `${baseSystem}\n\n${WEB_SEARCH_NOTE}` : baseSystem
  const messages: InputMessage[] = [{ role: 'system', content: systemContent }]

  // Attachments live in their own user message so they form a stable prefix
  // across runs — OpenAI's prompt cache can then reuse the encoded content
  // for free on subsequent analyses with the same files.
  const attachments = getAttachmentsForAnalyzer()
  if (attachments.length > 0) {
    const blocks: ContentBlock[] = [
      {
        type: 'input_text',
        text: '以下は会議の参考資料です。背景情報として活用してください（文字起こしと矛盾する場合は文字起こしを優先）。'
      }
    ]
    for (const a of attachments) {
      if (a.kind === 'text') {
        blocks.push({
          type: 'input_text',
          text: `--- 添付テキスト: ${a.filename} ---\n${a.payload}`
        })
      } else if (a.kind === 'image') {
        blocks.push({
          type: 'input_image',
          image_url: `data:${a.mime};base64,${a.payload}`
        })
      } else {
        blocks.push({
          type: 'input_file',
          filename: a.filename,
          file_data: `data:${a.mime};base64,${a.payload}`
        })
      }
    }
    messages.push({ role: 'user', content: blocks })
  }
  messages.push({ role: 'user', content: userPrompt })

  return {
    model,
    reasoning: { effort },
    input: messages,
    text: {
      format: {
        type: 'json_schema',
        name: req.mode === 'live' ? 'live_analysis' : 'final_analysis',
        schema: req.mode === 'live' ? LIVE_ANALYSIS_SCHEMA : FINAL_ANALYSIS_SCHEMA,
        strict: true
      }
    },
    stream: true,
    ...(webSearch ? { tools: [{ type: 'web_search' }] } : {})
  }
}

