import type { ReactNode } from 'react'
import type {
  ActionItem,
  AgendaItem,
  AnalysisMode,
  ConfidenceLevel,
  ConfirmationNeeded,
  DecisionItem,
  DiscussionStep,
  FinalAnalysis,
  LiveAnalysis,
  MinutesSection,
  NextSuggestion,
  NotableQuote
} from '@shared/analysis'
import { useStore } from '../store'
import { CopyButton } from './CopyButton'
import { ErrorBoundary } from './ErrorBoundary'
import {
  bullets,
  serializeActionItems,
  serializeAgenda,
  serializeConfirmations,
  serializeDecisions,
  serializeDiscussionFlow,
  serializeFinalAnalysis,
  serializeLiveAnalysis,
  serializeMinutes,
  serializeQuotes,
  serializeSuggestions
} from '../utils/serialize'

const CATEGORY_LABEL: Record<string, string> = {
  hearing: 'ヒアリング',
  ideation: '案だし',
  interview: '面接',
  'progress-check': '進捗確認',
  '1on1': '1on1',
  other: 'その他'
}

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: '低',
  med: '中',
  high: '高'
}

interface AnalysisPanelProps {
  width: number
}

export function AnalysisPanel({ width }: AnalysisPanelProps): JSX.Element {
  const live = useStore((s) => s.live)
  const final = useStore((s) => s.final)
  const items = useStore((s) => s.items)
  const getSegmentsSince = useStore((s) => s.getSegmentsSince)
  const getLastFinalItemId = useStore((s) => s.getLastFinalItemId)
  const setAnalysisRunning = useStore((s) => s.setAnalysisRunning)
  const setAnalysisResult = useStore((s) => s.setAnalysisResult)
  const setAnalysisError = useStore((s) => s.setAnalysisError)

  const hasAnyItems = items.some((i) => i.text.trim().length > 0)

  /** Continue from the latest available baseline for this mode. */
  const runIncremental = async (mode: AnalysisMode): Promise<void> => {
    if (mode === 'live') {
      // Live runs frequently — keep it cheap with diff transcript.
      await runAnalysis('live', live.result, getSegmentsSince(live.analyzedThroughItemId))
      return
    }

    // Final runs once — afford the full transcript so we can verify the
    // previous draft (Live or prior Final) against ground truth. previous
    // is used as a hint, but full text takes precedence on conflicts.
    let previous: LiveAnalysis | FinalAnalysis | null = null
    if (final.result) previous = final.result
    else if (live.result) previous = live.result
    await runAnalysis('final', previous, getSegmentsSince(null))
  }

  /** Throw away the previous baseline and re-run on the full transcript. */
  const runFresh = async (mode: AnalysisMode): Promise<void> => {
    await runAnalysis(mode, null, getSegmentsSince(null))
  }

  const runAnalysis = async (
    mode: AnalysisMode,
    previous: LiveAnalysis | FinalAnalysis | null,
    segments: ReturnType<typeof getSegmentsSince>
  ): Promise<void> => {
    if (segments.length === 0 && !previous) return
    setAnalysisRunning(mode)
    const throughItemId = getLastFinalItemId()
    const resp = await window.api.analyze({ mode, newSegments: segments, previous })
    if (!resp.ok) {
      setAnalysisError(mode, resp.error)
      return
    }
    setAnalysisResult(mode, resp.result, throughItemId)
  }

  return (
    <aside className="analysis-panel" style={{ width, flex: 'none' }}>
      <div className="panel-actions-grid">
        <div className="action-col">
          <button
            type="button"
            className="primary"
            onClick={() => void runIncremental('live')}
            disabled={live.status === 'running' || !hasAnyItems}
            title="前回の Live 結果に新規発話を足して更新"
          >
            {live.status === 'running' ? <RunningLabel state={live} kind="live" /> : 'ライブ整理'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void runFresh('live')}
            disabled={live.status === 'running' || !hasAnyItems}
            title="前回結果を破棄して全文で再分析"
          >
            ↻ 全文で再整理
          </button>
        </div>
        <div className="action-col">
          <button
            type="button"
            onClick={() => void runIncremental('final')}
            disabled={final.status === 'running' || !hasAnyItems}
            title="Final or Live の最新結果に新規発話を足して確定版を作成"
          >
            {final.status === 'running' ? <RunningLabel state={final} kind="final" /> : '会議を締める'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void runFresh('final')}
            disabled={final.status === 'running' || !hasAnyItems}
            title="前回結果を破棄して全文で確定版を作成"
          >
            ↻ 全文で再まとめ
          </button>
        </div>
      </div>

      {live.errorMessage && <div className="panel-error">live: {live.errorMessage}</div>}
      {final.errorMessage && <div className="panel-error">final: {final.errorMessage}</div>}

      <div className="group">
        <div className="group-header">
          <span className="group-title">ライブ分析</span>
          {live.lastRunAt && <span className="group-meta">{formatTime(live.lastRunAt)}</span>}
          <div className="group-spacer" />
          {live.result && (
            <CopyButton text={serializeLiveAnalysis(live.result)} label="全文コピー" />
          )}
        </div>
        {(() => {
          // Prefer the streaming partial whenever it exists so the panel
          // shows progressive fill while running AND retains whatever was
          // generated even if the final parse errors out. setAnalysisResult
          // clears progressPartial on success → falls through to `result`.
          const display = live.progressPartial ?? live.result
          if (display)
            return (
              <ErrorBoundary label="ライブ分析">
                <LiveView result={display} />
              </ErrorBoundary>
            )
          return (
            <p className="muted-center">
              未実行。発話が溜まったら「ライブ整理」を押してください。
            </p>
          )
        })()}
      </div>

      <div className="group">
        <div className="group-header">
          <span className="group-title">ファイナル分析</span>
          {final.lastRunAt && <span className="group-meta">{formatTime(final.lastRunAt)}</span>}
          <div className="group-spacer" />
          {final.result && (
            <CopyButton text={serializeFinalAnalysis(final.result)} label="全文コピー" />
          )}
        </div>
        {(() => {
          const display = final.progressPartial ?? final.result
          if (display)
            return (
              <ErrorBoundary label="ファイナル分析">
                <FinalView result={display} />
              </ErrorBoundary>
            )
          return (
            <p className="muted-center">
              未実行。会議終了時に「会議を締める」を押してください。
            </p>
          )
        })()}
      </div>
    </aside>
  )
}

function RunningLabel({
  state,
  kind
}: {
  state: { progressPhase: 'reasoning' | 'output' | null; progressChars: number }
  kind: 'live' | 'final'
}): JSX.Element {
  const verb = kind === 'live' ? '整理' : 'まとめ'
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

function LiveView({ result }: { result: LiveAnalysis }): JSX.Element {
  const statusText = [
    `- カテゴリ: ${CATEGORY_LABEL[result.category] ?? result.category} (確信度: ${CONFIDENCE_LABEL[result.categoryConfidence]})`,
    `- フェーズ: ${result.phase}`,
    `- 状況: ${result.briefStatus}`
  ].join('\n')

  return (
    <>
      <SectionHeader label="整理" variant="organize" />
      <div className="cards">
        <Card title="現状" copyText={statusText}>
          <StatusChips
            category={result.category}
            categoryConfidence={result.categoryConfidence}
            phase={result.phase}
          />
          <p className="brief-status">{result.briefStatus}</p>
        </Card>

        {result.meetingPurpose && (
          <Card title="会議の目的" copyText={result.meetingPurpose}>
            <p className="purpose">{result.meetingPurpose}</p>
          </Card>
        )}

        <Card
          title="議論の流れ"
          count={result.discussionFlow.length}
          copyText={serializeDiscussionFlow(result.discussionFlow)}
        >
          <DiscussionFlowView steps={result.discussionFlow} />
        </Card>

        <Card
          title="現在の論点"
          count={result.currentTopics.length}
          copyText={bullets(result.currentTopics, '（特になし）')}
        >
          <BulletList items={result.currentTopics} emptyHint="特になし" />
        </Card>

        <Card
          title="重要事実"
          count={result.keyFacts.length}
          copyText={bullets(result.keyFacts, '（まだ無し）')}
        >
          <BulletList items={result.keyFacts} emptyHint="まだ無し" />
        </Card>

        <Card title="ここまでの要約" copyText={result.summary || '（無し）'}>
          <p className="summary">{result.summary || '—'}</p>
        </Card>

        <Card
          title="ここまでの議事録"
          count={result.minutes.length}
          copyText={serializeMinutes(result.minutes)}
        >
          <MinutesView sections={result.minutes} />
        </Card>

        <Card
          title="重要発言"
          count={result.notableQuotes.length}
          copyText={serializeQuotes(result.notableQuotes)}
        >
          <QuotesView quotes={result.notableQuotes} />
        </Card>
      </div>

      <SectionHeader label="アクション" variant="action" />
      <div className="cards">
        <Card
          title="要確認"
          count={result.confirmationNeeded.length}
          copyText={serializeConfirmations(result.confirmationNeeded)}
        >
          <ConfirmationView items={result.confirmationNeeded} />
        </Card>

        <Card
          title="次の話題の提案"
          count={result.nextSuggestions.length}
          copyText={serializeSuggestions(result.nextSuggestions)}
        >
          <SuggestionsView items={result.nextSuggestions} />
        </Card>

        <Card
          title="ここまでの決定事項"
          count={result.decisions.length}
          copyText={serializeDecisions(result.decisions)}
        >
          <DecisionsView items={result.decisions} />
        </Card>

        <Card
          title="ここまでのアクションアイテム"
          count={result.actionItems.length}
          copyText={serializeActionItems(result.actionItems)}
        >
          <ActionItemsView items={result.actionItems} />
        </Card>
      </div>
    </>
  )
}

function FinalView({ result }: { result: FinalAnalysis }): JSX.Element {
  const statusText = [
    `- カテゴリ: ${CATEGORY_LABEL[result.category] ?? result.category}`,
    ...(result.meetingPurpose ? [`- 目的: ${result.meetingPurpose}`] : [])
  ].join('\n')

  return (
    <>
      <SectionHeader label="整理" variant="organize" />
      <div className="cards">
        <Card title="現状" copyText={statusText}>
          <div className="chip-row">
            <span className={`chip chip-category cat-${result.category}`}>
              {CATEGORY_LABEL[result.category] ?? result.category}
            </span>
          </div>
          {result.meetingPurpose && (
            <p className="purpose" style={{ marginTop: 10 }}>
              <strong>目的: </strong>
              {result.meetingPurpose}
            </p>
          )}
        </Card>

        <Card
          title="重要事実"
          count={result.keyFacts.length}
          copyText={bullets(result.keyFacts)}
        >
          <BulletList items={result.keyFacts} emptyHint="無し" />
        </Card>

        <Card title="要約" copyText={result.summary || '（無し）'}>
          <p className="summary">{result.summary || '—'}</p>
        </Card>

        <Card
          title="議事録（時系列）"
          count={result.minutes.length}
          copyText={serializeMinutes(result.minutes)}
        >
          <MinutesView sections={result.minutes} />
        </Card>

        <Card
          title="重要発言"
          count={result.notableQuotes.length}
          copyText={serializeQuotes(result.notableQuotes)}
        >
          <QuotesView quotes={result.notableQuotes} />
        </Card>
      </div>

      <SectionHeader label="アクション" variant="action" />
      <div className="cards">
        <Card
          title="決定事項"
          count={result.decisions.length}
          copyText={serializeDecisions(result.decisions)}
        >
          <DecisionsView items={result.decisions} />
        </Card>

        <Card
          title="アクションアイテム"
          count={result.actionItems.length}
          copyText={serializeActionItems(result.actionItems)}
        >
          <ActionItemsView items={result.actionItems} />
        </Card>

        <Card
          title="次回アジェンダ案"
          count={result.nextAgenda.length}
          copyText={serializeAgenda(result.nextAgenda)}
        >
          <AgendaView items={result.nextAgenda} />
        </Card>
      </div>
    </>
  )
}

// --- 共通レンダリングコンポーネント ---

function StatusChips({
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

function DiscussionFlowView({ steps }: { steps: DiscussionStep[] }): JSX.Element {
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

function MinutesView({ sections }: { sections: MinutesSection[] }): JSX.Element {
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

function QuotesView({ quotes }: { quotes: NotableQuote[] }): JSX.Element {
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

function ConfirmationView({ items }: { items: ConfirmationNeeded[] }): JSX.Element {
  if (items.length === 0) return <p className="muted">無し</p>
  return (
    <div className="mini-cards">
      {items.map((c, i) => (
        <div key={i} className="mini-card action-mini">
          <div className="mini-card-title">{c.point}</div>
          <div className="reason-line">根拠: {c.reason}</div>
        </div>
      ))}
    </div>
  )
}

function SuggestionsView({ items }: { items: NextSuggestion[] }): JSX.Element {
  if (items.length === 0) return <p className="muted">提案なし</p>
  return (
    <div className="mini-cards">
      {items.map((s, i) => (
        <div key={i} className="mini-card action-mini">
          <div className="mini-card-title">{s.topic}</div>
          <div className="reason-line">根拠: {s.reason}</div>
        </div>
      ))}
    </div>
  )
}

function DecisionsView({ items }: { items: DecisionItem[] }): JSX.Element {
  if (items.length === 0) return <p className="muted">無し</p>
  return (
    <div className="mini-cards">
      {items.map((d, i) => (
        <div key={i} className="mini-card action-mini">
          <div className="mini-card-title">{d.decision}</div>
          <div className="reason-line">根拠: {d.reason}</div>
        </div>
      ))}
    </div>
  )
}

function ActionItemsView({ items }: { items: ActionItem[] }): JSX.Element {
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

function AgendaView({ items }: { items: AgendaItem[] }): JSX.Element {
  if (items.length === 0) return <p className="muted">無し</p>
  return (
    <div className="mini-cards">
      {items.map((a, i) => (
        <div key={i} className="mini-card action-mini">
          <div className="mini-card-title">{a.topic}</div>
          <div className="reason-line">根拠: {a.reason}</div>
        </div>
      ))}
    </div>
  )
}

// --- 汎用 ---

function SectionHeader({
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

function Card({
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

function BulletList({
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

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
