import { useState, type KeyboardEvent } from 'react'

interface Props {
  disabled: boolean
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  onClear: () => void
  /** Disable Clear when there's nothing to clear. */
  hasHistory: boolean
}

export function InputBox({
  disabled,
  streaming,
  onSend,
  onStop,
  onClear,
  hasHistory
}: Props): JSX.Element {
  const [text, setText] = useState('')

  const trySend = (): void => {
    const trimmed = text.trim()
    if (!trimmed || disabled || streaming) return
    onSend(trimmed)
    setText('')
  }

  // Enter sends, Shift+Enter inserts a newline — same convention as most
  // chat apps. Cmd/Ctrl+Enter is also accepted for users who train on IDEs.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      trySend()
    }
  }

  return (
    <div className="chat-input">
      <textarea
        rows={3}
        placeholder={
          disabled
            ? '送信できません (API キーや接続を確認してください)'
            : 'メッセージを入力 (Enter で送信 / Shift+Enter で改行)'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
      />
      <div className="chat-input-actions">
        {streaming ? (
          <button type="button" className="primary" onClick={onStop}>
            停止
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={trySend}
            disabled={disabled || !text.trim()}
          >
            送信
          </button>
        )}
        <button type="button" onClick={onClear} disabled={streaming || !hasHistory}>
          履歴クリア
        </button>
      </div>
    </div>
  )
}
