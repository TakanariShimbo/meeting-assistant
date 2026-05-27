import { useEffect, useRef } from 'react'
import { SESSION_MODE_LABELS, SESSION_MODES, type SessionMode } from '@shared/types'
import { useStore } from '../store'
import { CopyButton } from './CopyButton'
import { serializeTranscript, serializeTranscriptItem } from '../utils/serialize'

interface Props {
  sessionMode: SessionMode
  onChangeMode: (next: SessionMode) => void
  onRequestReply: () => void
  /** Reply request only makes sense once the data channel is open. */
  canRequestReply: boolean
}

export function TranscriptList({
  sessionMode,
  onChangeMode,
  onRequestReply,
  canRequestReply
}: Props): JSX.Element {
  const items = useStore((s) => s.items)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [items])

  return (
    <div className="transcript-wrap">
      <div className="transcript-toolbar">
        <span className="transcript-label">文字起こし ({items.length})</span>
        <div className="transcript-toolbar-spacer" />
        <select
          className="mode-select"
          value={sessionMode}
          onChange={(e) => onChangeMode(e.target.value as SessionMode)}
          title="手動返答: 返事リクエストを押したときだけ AI が応答 / 自動返答: 発話の切れ目で AI が自動応答"
        >
          {SESSION_MODES.map((m) => (
            <option key={m} value={m}>
              {SESSION_MODE_LABELS[m]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRequestReply}
          disabled={!canRequestReply}
          title="AI に今すぐ返事をリクエスト"
        >
          返事リクエスト
        </button>
        <CopyButton text={serializeTranscript(items)} label="全文コピー" />
      </div>
      {items.length === 0 ? (
        <p className="empty">マイクから話すと文字起こしがここに表示されます。</p>
      ) : (
        <div className="transcript">
          {items.map((item) => {
            const isAssistant = item.role === 'assistant'
            const roleClass = isAssistant ? 'turn-assistant' : 'turn-user'
            const stateClass = item.isFinal ? 'final' : 'partial'
            return (
              <div key={item.id} className={`turn ${roleClass} ${stateClass}`}>
                {/* Speaker for user-side audio is unknown (multi-person meeting),
                    so no role label — distinguish from AI replies via color only. */}
                {isAssistant && <span className="turn-role">🤖 AI</span>}
                <span className="text">{item.text || '…'}</span>
                {item.text.trim().length > 0 && (
                  <CopyButton text={serializeTranscriptItem(item)} className="turn-copy" />
                )}
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
      )}
    </div>
  )
}
