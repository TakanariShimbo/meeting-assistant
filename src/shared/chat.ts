import type { TranscriptSegment } from './analysis'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  createdAt: number
}

export interface ChatRequest {
  /** Full conversation history including the new user message at the end. */
  messages: ChatMessage[]
  /** Snapshot of the meeting transcript to feed as context. */
  transcript: TranscriptSegment[]
}

export interface ChatProgress {
  /** Text streamed so far for the in-progress assistant response. */
  text: string
}

export type ChatResponse =
  | { ok: true; text: string }
  | { ok: false; error: string; partialText?: string }
