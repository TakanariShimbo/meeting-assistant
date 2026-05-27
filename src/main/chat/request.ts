// Builds the Responses API body for the chat assistant.
//
// The message order is chosen so OpenAI's prompt cache can reuse as much
// content as possible across turns:
//   1. system prompt (stable)
//   2. attachments  (stable across turns until the user adds/removes)
//   3. transcript snapshot (grows as the meeting goes on; cache hits on the prefix)
//   4. chat history (grows as the user converses)
//   5. new user message (always the last item from `req.messages`)
//
// The transcript is passed as a single user message containing all final +
// partial segments joined with newlines — same shape the analyzer uses.

import type { ReasoningEffort } from '@shared/types'
import type { ChatRequest } from '@shared/chat'
import { getAttachmentsForAnalyzer } from '../attachments'
import { CHAT_SYSTEM, CHAT_WEB_SEARCH_NOTE } from './prompts'

type ContentBlock =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; filename: string; file_data: string }

interface InputMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface ChatResponsesBody {
  model: string
  reasoning: { effort: ReasoningEffort }
  input: InputMessage[]
  tools?: Array<{ type: string }>
  stream?: boolean
}

export interface BuildChatBodyOptions {
  req: ChatRequest
  model: string
  effort: ReasoningEffort
  webSearch: boolean
}

export function buildChatBody({
  req,
  model,
  effort,
  webSearch
}: BuildChatBodyOptions): ChatResponsesBody {
  const messages: InputMessage[] = []

  const systemContent = webSearch ? `${CHAT_SYSTEM}\n\n${CHAT_WEB_SEARCH_NOTE}` : CHAT_SYSTEM
  messages.push({ role: 'system', content: systemContent })

  const attachments = getAttachmentsForAnalyzer()
  if (attachments.length > 0) {
    const blocks: ContentBlock[] = [
      {
        type: 'input_text',
        text: '以下は会議の参考資料です。質問への回答で必要に応じて参照してください（文字起こしと矛盾する場合は文字起こしを優先）。'
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

  const transcriptText = req.transcript.map((s) => s.text).join('\n')
  messages.push({
    role: 'user',
    content: `[transcript]\n${transcriptText || '（まだ発話なし）'}`
  })

  // Chat history. The last item is the user's latest message; everything
  // before it is prior turns (user + assistant alternating).
  for (const m of req.messages) {
    messages.push({ role: m.role, content: m.text })
  }

  return {
    model,
    reasoning: { effort },
    input: messages,
    stream: true,
    ...(webSearch ? { tools: [{ type: 'web_search' }] } : {})
  }
}
