import { useEffect, useState, type ReactNode } from 'react'

const SECTION_KEY_PREFIX = 'meeting-assistant:settings-section:'

interface Props {
  title: string
  storageKey: string
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Collapsible group with a per-section persisted open/closed state. Keying
 * to localStorage so users don't lose their preferred layout across reopen.
 */
export function Section({ title, storageKey, defaultOpen = true, children }: Props): JSX.Element {
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(SECTION_KEY_PREFIX + storageKey)
    if (v === '1') return true
    if (v === '0') return false
    return defaultOpen
  })

  useEffect(() => {
    localStorage.setItem(SECTION_KEY_PREFIX + storageKey, open ? '1' : '0')
  }, [open, storageKey])

  return (
    <div className={`settings-section ${open ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="section-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="section-chevron">{open ? '▼' : '▶'}</span>
        <span className="section-title">{title}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}
