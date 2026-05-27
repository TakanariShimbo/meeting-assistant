// Shared atomic components for the analysis panel. Nothing in here knows
// about LiveAnalysis / FinalAnalysis; they're plain reusable building blocks
// that the view files compose into mode-specific UIs.

import type { ReactNode } from 'react'
import type { ConfidenceLevel } from '@shared/analysis'
import { CopyButton } from '../CopyButton'
import { CATEGORY_LABEL, CONFIDENCE_LABEL } from './labels'

export function Card({
  title,
  count,
  copyText,
  children
}: {
  title: string
  count?: number
  /** When set, a small copy button appears in the card header. */
  copyText?: string
  children: ReactNode
}): JSX.Element {
  return (
    <section className="card">
      <header className="card-header">
        <span className="card-title">{title}</span>
        {count !== undefined && <span className="count-badge">{count}</span>}
        <div className="card-header-spacer" />
        {copyText && <CopyButton text={`## ${title}\n${copyText}`} />}
      </header>
      <div className="card-body">{children}</div>
    </section>
  )
}

export function BulletList({
  items,
  emptyHint
}: {
  items: string[] | undefined
  emptyHint: string
}): JSX.Element {
  // Defensive: streaming partials can hand us a minutes section whose
  // `points` array hasn't arrived yet. `.length` on undefined would crash.
  const safe = Array.isArray(items) ? items : []
  if (safe.length === 0) return <p className="muted">{emptyHint}</p>
  return (
    <ul className="bullet-list">
      {safe.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

export function SectionHeader({
  label,
  variant
}: {
  label: string
  variant: 'organize' | 'action'
}): JSX.Element {
  return (
    <div className={`section-header section-${variant}`}>
      <span className="section-label">{label}</span>
    </div>
  )
}

export function StatusChips({
  category,
  categoryConfidence,
  phase
}: {
  category: string
  categoryConfidence: ConfidenceLevel
  phase: string
}): JSX.Element {
  return (
    <div className="chip-row">
      <span className={`chip chip-category cat-${category}`}>
        {CATEGORY_LABEL[category] ?? category}
      </span>
      <span className="chip chip-phase">{phase}</span>
      <span className={`chip chip-conf chip-conf-${categoryConfidence}`}>
        確信度 {CONFIDENCE_LABEL[categoryConfidence]}
      </span>
    </div>
  )
}

export function RunningLabel({
  state,
  kind
}: {
  state: { progressPhase: 'reasoning' | 'output' | null; progressChars: number }
  kind: 'live' | 'final'
}): JSX.Element {
  const verb = kind === 'live' ? '中間整理' : '最終整理'
  if (state.progressPhase === 'output') {
    return (
      <>
        {verb}生成中… <span className="prog-chars">{state.progressChars}</span>
      </>
    )
  }
  if (state.progressPhase === 'reasoning') {
    return <>推論中…<span className="dot-pulse" /></>
  }
  return <>{verb}中…<span className="dot-pulse" /></>
}
