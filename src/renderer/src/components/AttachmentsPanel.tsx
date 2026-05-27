import { useEffect, useRef, useState } from 'react'
import {
  ACCEPT_ATTRIBUTES,
  ATTACHMENT_MAX_BYTES,
  SUPPORTED_IMAGE_EXTS,
  SUPPORTED_IMAGE_MIME,
  type AttachmentInput,
  type AttachmentKind,
  type AttachmentMeta
} from '@shared/attachments'

const KIND_LABEL: Record<AttachmentKind, string> = {
  text: 'TXT',
  image: 'IMG',
  pdf: 'PDF'
}

/**
 * Categorize a file. Image and PDF are matched explicitly; anything else is
 * treated as text. Trying to enumerate every text-ish extension (html, xml,
 * py, ts, yaml, env, …) is a losing game — let the user decide and rely on
 * the NUL-byte check in `readFile` to catch obvious binary attachments.
 */
function guessKind(file: File): AttachmentKind {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (SUPPORTED_IMAGE_MIME.has(file.type) || SUPPORTED_IMAGE_EXTS.test(name)) return 'image'
  return 'text'
}

async function readFile(file: File, kind: AttachmentKind): Promise<string> {
  if (kind === 'text') {
    const text = await file.text()
    // NUL bytes are a near-certain "this is binary" signal. Reject so we
    // don't shove a garbage UTF-8 decoding of a zip/exe/mp4 into the prompt.
    if (text.indexOf('\0') >= 0) {
      throw new Error('バイナリファイルに見えるためテキストとして読めません')
    }
    return text
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
  // Strip the `data:mime;base64,` prefix; we send raw base64 + mime separately.
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function AttachmentsPanel(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AttachmentMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [showPaste, setShowPaste] = useState(false)
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')

  const refresh = async (): Promise<void> => {
    setItems(await window.api.attachmentList())
  }

  useEffect(() => {
    void refresh()
  }, [])

  const totalBytes = items.reduce((sum, i) => sum + i.byteSize, 0)

  const handleFiles = async (files: FileList | File[]): Promise<void> => {
    setBusy(true)
    setError(null)
    const skipped: string[] = []
    try {
      for (const file of Array.from(files)) {
        if (file.size > ATTACHMENT_MAX_BYTES) {
          skipped.push(`${file.name} (大きすぎ ${formatSize(file.size)})`)
          continue
        }
        const kind = guessKind(file)
        try {
          const payload = await readFile(file, kind)
          const input: AttachmentInput = {
            filename: file.name,
            kind,
            mime:
              file.type ||
              (kind === 'pdf' ? 'application/pdf' : kind === 'image' ? 'image/png' : 'text/plain'),
            payload
          }
          await window.api.attachmentAdd(input)
        } catch (err) {
          skipped.push(`${file.name} (${(err as Error).message})`)
        }
      }
      if (skipped.length > 0) setError(`スキップ: ${skipped.join(', ')}`)
      await refresh()
    } catch (err) {
      setError(`追加失敗: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files)
  }

  const onRemove = async (id: string): Promise<void> => {
    setItems(await window.api.attachmentRemove(id))
  }

  const onClear = async (): Promise<void> => {
    if (items.length === 0) return
    setItems(await window.api.attachmentClear())
  }

  const onPasteSave = async (): Promise<void> => {
    const text = pasteText.trim()
    if (!text) return
    const defaultName = `メモ ${new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    })}.txt`
    const rawName = pasteName.trim() || defaultName
    // Ensure a .txt-ish extension so it's clear this is text in the list.
    const filename = /\.[a-z0-9]{1,6}$/i.test(rawName) ? rawName : `${rawName}.txt`
    setBusy(true)
    setError(null)
    try {
      await window.api.attachmentAdd({
        filename,
        kind: 'text',
        mime: 'text/plain',
        payload: text
      })
      setPasteName('')
      setPasteText('')
      setShowPaste(false)
      await refresh()
    } catch (err) {
      setError(`追加失敗: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const cancelPaste = (): void => {
    setPasteName('')
    setPasteText('')
    setShowPaste(false)
  }

  return (
    <section className="attachments">
      <header
        className="att-header"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
      >
        <span className="att-toggle">{open ? '▼' : '▶'}</span>
        <span className="att-title">添付資料</span>
        <span className="count-badge">{items.length}</span>
        {totalBytes > 0 && <span className="att-total">{formatSize(totalBytes)}</span>}
      </header>

      {open && (
        <div
          className={`att-body ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="att-actions">
            <button
              type="button"
              className="primary"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy ? '読み込み中…' : '+ ファイル追加'}
            </button>
            <button
              type="button"
              onClick={() => setShowPaste((s) => !s)}
              disabled={busy}
            >
              {showPaste ? 'テキスト貼付を閉じる' : '+ テキスト貼付'}
            </button>
            {items.length > 0 && (
              <button type="button" onClick={() => void onClear()} disabled={busy}>
                クリア
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTES}
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files)
                e.target.value = '' // allow re-selecting the same file
              }}
            />
          </div>

          {showPaste && (
            <div className="att-paste">
              <input
                type="text"
                className="att-paste-name"
                placeholder="ファイル名 (空欄ならタイムスタンプから自動生成)"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value)}
              />
              <textarea
                className="att-paste-text"
                rows={6}
                placeholder="ここにテキストを貼り付け / 入力してください..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="att-paste-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => void onPasteSave()}
                  disabled={busy || !pasteText.trim()}
                >
                  保存
                </button>
                <button type="button" onClick={cancelPaste} disabled={busy}>
                  キャンセル
                </button>
                <span className="att-paste-meta">
                  {pasteText.length > 0 && `${pasteText.length} 文字`}
                </span>
              </div>
            </div>
          )}

          {error && <div className="att-error">{error}</div>}

          {items.length === 0 ? (
            <p className="att-empty">
              ファイルをドロップ / ファイル追加 / テキスト貼付。
              <br />
              画像 (.png / .jpg / .gif / .webp) と .pdf 以外はテキスト扱い (html / xml / コード等もOK)。
            </p>
          ) : (
            <ul className="att-list">
              {items.map((item) => (
                <li key={item.id}>
                  <span className={`att-kind att-kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                  <span className="att-name" title={item.filename}>
                    {item.filename}
                  </span>
                  <span className="att-size">{formatSize(item.byteSize)}</span>
                  <button
                    type="button"
                    className="att-remove"
                    onClick={() => void onRemove(item.id)}
                    aria-label="削除"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
