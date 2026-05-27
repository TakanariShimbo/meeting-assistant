import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@shared/chat'
import { CopyButton } from '../CopyButton'

interface Props {
  messages: ChatMessage[]
  /** Live-streaming assistant text shown as the trailing bubble while running. */
  streamingText: string
  streaming: boolean
  errorMessage: string | null
}

export function MessageList({
  messages,
  streamingText,
  streaming,
  errorMessage
}: Props): JSX.Element {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streamingText, streaming])

  if (messages.length === 0 && !streaming && !errorMessage) {
    return (
      <div className="chat-empty">
        <p>文字起こしと添付資料に対して自由に質問できます。</p>
        <p className="hint">
          例: 「ここまでの要点は？」 「〇〇という発言の意味を整理して」 「添付の資料と矛盾する点ある？」
        </p>
      </div>
    )
  }

  return (
    <div className="chat-messages">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {streaming && (
        <div className="chat-msg chat-msg-assistant">
          <div className="chat-msg-text">
            {streamingText || <span className="muted">思考中…</span>}
          </div>
        </div>
      )}
      {errorMessage && !streaming && <div className="chat-error">{errorMessage}</div>}
      <div ref={endRef} />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }): JSX.Element {
  return (
    <div className={`chat-msg chat-msg-${message.role}`}>
      <div className="chat-msg-head">
        <span className="chat-msg-role">{message.role === 'user' ? 'あなた' : 'AI'}</span>
        <div className="chat-msg-spacer" />
        <CopyButton text={message.text} className="chat-msg-copy" />
      </div>
      <div className="chat-msg-text">{message.text}</div>
    </div>
  )
}
