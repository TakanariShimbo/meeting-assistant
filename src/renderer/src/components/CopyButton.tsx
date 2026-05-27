import { useState, type MouseEvent } from 'react'

interface Props {
  /** Text to copy on click. Empty disables the button. */
  text: string
  label?: string
  /** Extra CSS class for layout overrides. */
  className?: string
}

export function CopyButton({ text, label = 'コピー', className = '' }: Props): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      // Use the Electron main-process clipboard via IPC — navigator.clipboard
      // can fail silently in Electron renderers depending on focus state.
      await window.api.clipboardWriteText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('CopyButton failed:', err)
    }
  }

  return (
    <button
      type="button"
      className={`copy-btn-small ${copied ? 'copied' : ''} ${className}`}
      onClick={(e) => void copy(e)}
      disabled={!text}
      title="クリップボードにコピー"
    >
      {copied ? '✓ コピー済み' : label}
    </button>
  )
}
