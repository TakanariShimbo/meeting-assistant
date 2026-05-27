// Domain-shape view components. Each takes one of the analysis sub-types
// (DiscussionStep[], MinutesSection[], etc.) and renders it.
//
// ReasonedItemsView is the DRY consolidation of four near-identical
// "title + reason" lists in the original AnalysisPanel — confirmations,
// suggestions, decisions, agenda — each of which only differed by which
// field name held the title. They now share one component with a `titleKey`
// prop.

import type {
  ActionItem,
  AgendaItem,
  ConfirmationNeeded,
  DecisionItem,
  DiscussionStep,
  MinutesSection,
  NextSuggestion,
  NotableQuote
} from '@shared/analysis'
import { BulletList } from './cards'

export function DiscussionFlowView({ steps }: { steps: DiscussionStep[] }): JSX.Element {
  if (steps.length === 0) return <p className="muted">—</p>
  return (
    <ol className="flow-list">
      {steps.map((s, i) => (
        <li key={i} className={s.isCurrent ? 'flow-step current' : 'flow-step'}>
          <span className="flow-marker">{i + 1}</span>
          <span className="flow-text">{s.step}</span>
          {s.isCurrent && <span className="flow-now">いまここ</span>}
        </li>
      ))}
    </ol>
  )
}

export function MinutesView({ sections }: { sections: MinutesSection[] }): JSX.Element {
  if (sections.length === 0) return <p className="muted">まだ無し</p>
  return (
    <div className="minutes-list">
      {sections.map((m, i) => (
        <div key={i} className="minutes-item">
          <div className="minutes-item-title">{m.section}</div>
          <BulletList items={m.points} emptyHint="—" />
        </div>
      ))}
    </div>
  )
}

export function QuotesView({ quotes }: { quotes: NotableQuote[] }): JSX.Element {
  if (quotes.length === 0) return <p className="muted">無し</p>
  return (
    <div className="mini-cards">
      {quotes.map((q, i) => (
        <div key={i} className="mini-card quote-card">
          <div className="quote-text">「{q.quote}」</div>
          <div className="quote-meta">
            {q.speaker && <span className="quote-speaker">{q.speaker}</span>}
            <span className="reason-line">{q.reason}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

interface ReasonedItem {
  reason: string
}

function ReasonedItemsView<T extends ReasonedItem, K extends keyof T>({
  items,
  titleKey,
  emptyHint
}: {
  items: T[]
  titleKey: K
  emptyHint: string
}): JSX.Element {
  if (items.length === 0) return <p className="muted">{emptyHint}</p>
  return (
    <div className="mini-cards">
      {items.map((item, i) => (
        <div key={i} className="mini-card action-mini">
          <div className="mini-card-title">{String(item[titleKey])}</div>
          <div className="reason-line">根拠: {item.reason}</div>
        </div>
      ))}
    </div>
  )
}

export function ConfirmationsView({ items }: { items: ConfirmationNeeded[] }): JSX.Element {
  return <ReasonedItemsView items={items} titleKey="point" emptyHint="無し" />
}

export function SuggestionsView({ items }: { items: NextSuggestion[] }): JSX.Element {
  return <ReasonedItemsView items={items} titleKey="topic" emptyHint="提案なし" />
}

export function DecisionsView({ items }: { items: DecisionItem[] }): JSX.Element {
  return <ReasonedItemsView items={items} titleKey="decision" emptyHint="無し" />
}

export function AgendaView({ items }: { items: AgendaItem[] }): JSX.Element {
  return <ReasonedItemsView items={items} titleKey="topic" emptyHint="無し" />
}

export function ActionItemsView({ items }: { items: ActionItem[] }): JSX.Element {
  if (items.length === 0) return <p className="muted">無し</p>
  return (
    <div className="mini-cards">
      {items.map((a, i) => (
        <div key={i} className="mini-card action-card">
          <div className="action-head">
            <span className="action-who">{a.who}</span>
            {a.by && <span className="action-by">期限: {a.by}</span>}
          </div>
          <div className="action-what">{a.what}</div>
          <div className="reason-line">根拠: {a.reason}</div>
        </div>
      ))}
    </div>
  )
}
