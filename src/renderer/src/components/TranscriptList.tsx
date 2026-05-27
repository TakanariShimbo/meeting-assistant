import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { CopyButton } from './CopyButton'
import { serializeTranscript, serializeTranscriptItem } from '../utils/serialize'

export function TranscriptList(): JSX.Element {
  const items = useStore((s) => s.items)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [items])

  if (items.length === 0) {
    return <p className="empty">マイクから話すと文字起こしがここに表示されます。</p>
  }

  return (
    <div className="transcript-wrap">
      <div className="transcript-toolbar">
        <span className="transcript-label">文字起こし ({items.length})</span>
        <CopyButton text={serializeTranscript(items)} label="全文コピー" />
      </div>
      <div className="transcript">
        {items.map((item) => (
          <div key={item.id} className={`turn ${item.isFinal ? 'final' : 'partial'}`}>
            <span className="text">{item.text || '…'}</span>
            {item.text.trim().length > 0 && (
              <CopyButton text={serializeTranscriptItem(item)} className="turn-copy" />
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
