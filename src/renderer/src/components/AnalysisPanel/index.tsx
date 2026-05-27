import type {
  AnalysisMode,
  FinalAnalysis,
  LiveAnalysis,
  TranscriptSegment
} from '@shared/analysis'
import { useStore } from '../../store'
import { serializeFinalAnalysis, serializeLiveAnalysis } from '../../utils/serialize'
import { CopyButton } from '../CopyButton'
import { ErrorBoundary } from '../ErrorBoundary'
import { RunningLabel } from './cards'
import { FinalView } from './FinalView'
import { formatTime } from './labels'
import { LiveView } from './LiveView'

export function AnalysisPanel(): JSX.Element {
  const live = useStore((s) => s.live)
  const final = useStore((s) => s.final)
  const items = useStore((s) => s.items)
  const getSegmentsSince = useStore((s) => s.getSegmentsSince)
  const getLastFinalItemId = useStore((s) => s.getLastFinalItemId)
  const setAnalysisRunning = useStore((s) => s.setAnalysisRunning)
  const setAnalysisResult = useStore((s) => s.setAnalysisResult)
  const setAnalysisError = useStore((s) => s.setAnalysisError)

  const hasAnyItems = items.some((i) => i.text.trim().length > 0)

  const runAnalysis = async (
    mode: AnalysisMode,
    previous: LiveAnalysis | FinalAnalysis | null,
    segments: TranscriptSegment[]
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
    const previous: LiveAnalysis | FinalAnalysis | null = final.result ?? live.result ?? null
    await runAnalysis('final', previous, getSegmentsSince(null))
  }

  /** Throw away the previous baseline and re-run on the full transcript. */
  const runFresh = async (mode: AnalysisMode): Promise<void> => {
    await runAnalysis(mode, null, getSegmentsSince(null))
  }

  return (
    <div className="analysis-panel">
      <div className="panel-actions-grid">
        <ModeActions
          mode="live"
          state={live}
          hasAnyItems={hasAnyItems}
          runLabel="中間整理"
          freshLabel="↻ 全文で再整理"
          runTitle="前回の中間整理に新規発話を足して更新"
          freshTitle="前回結果を破棄して全文で再分析"
          onRun={() => void runIncremental('live')}
          onFresh={() => void runFresh('live')}
        />
        <ModeActions
          mode="final"
          state={final}
          hasAnyItems={hasAnyItems}
          runLabel="最終整理"
          freshLabel="↻ 全文で再最終化"
          runTitle="中間整理 or 前回の最終整理を土台に、確定版を作成"
          freshTitle="前回結果を破棄して全文で確定版を作成"
          onRun={() => void runIncremental('final')}
          onFresh={() => void runFresh('final')}
          runPrimary={false}
        />
      </div>

      {live.errorMessage && <div className="panel-error">live: {live.errorMessage}</div>}
      {final.errorMessage && <div className="panel-error">final: {final.errorMessage}</div>}

      {/* Only this wrapper scrolls — the action grid + errors above stay
          pinned, so the run buttons remain reachable as analyses grow. */}
      <div className="analysis-content">
        <AnalysisGroup
          title="中間整理"
          lastRunAt={live.lastRunAt}
          result={live.progressPartial ?? live.result}
          serialize={serializeLiveAnalysis}
          empty="未実行。発話が溜まったら「中間整理」を押してください。"
          boundaryLabel="中間整理"
          renderView={(r) => <LiveView result={r as LiveAnalysis} />}
        />
        <AnalysisGroup
          title="最終整理"
          lastRunAt={final.lastRunAt}
          result={final.progressPartial ?? final.result}
          serialize={serializeFinalAnalysis as (r: LiveAnalysis | FinalAnalysis) => string}
          empty="未実行。会議終了時に「最終整理」を押してください。"
          boundaryLabel="最終整理"
          renderView={(r) => <FinalView result={r as FinalAnalysis} />}
        />
      </div>
    </div>
  )
}

interface ModeActionsProps {
  mode: 'live' | 'final'
  state: { status: 'idle' | 'running' | 'ready' | 'error'; progressPhase: 'reasoning' | 'output' | null; progressChars: number }
  hasAnyItems: boolean
  runLabel: string
  freshLabel: string
  runTitle: string
  freshTitle: string
  onRun: () => void
  onFresh: () => void
  /** Live's primary is the visual emphasis (className="primary"); Final is secondary. */
  runPrimary?: boolean
}

// The run/cancel button toggles role based on `state.status`:
//   - idle/ready/error: clickable to start the analysis
//   - running:          clickable to cancel; label shows progress to make
//                       clear the request is alive and click will abort it
function ModeActions({
  mode,
  state,
  hasAnyItems,
  runLabel,
  freshLabel,
  runTitle,
  freshTitle,
  onRun,
  onFresh,
  runPrimary = true
}: ModeActionsProps): JSX.Element {
  const running = state.status === 'running'
  const onCancel = (): void => {
    void window.api.cancelAnalyze(mode)
  }
  return (
    <div className="action-col">
      <button
        type="button"
        className={running ? 'danger' : runPrimary ? 'primary' : ''}
        onClick={running ? onCancel : onRun}
        disabled={!running && !hasAnyItems}
        title={running ? 'クリックで中断' : runTitle}
      >
        {running ? (
          <>
            中断 <RunningLabel state={state} kind={mode} />
          </>
        ) : (
          runLabel
        )}
      </button>
      <button
        type="button"
        className="secondary"
        onClick={onFresh}
        disabled={running || !hasAnyItems}
        title={freshTitle}
      >
        {freshLabel}
      </button>
    </div>
  )
}

interface AnalysisGroupProps<R> {
  title: string
  lastRunAt: number | null
  result: R | null
  serialize: (r: R) => string
  empty: string
  boundaryLabel: string
  renderView: (r: R) => JSX.Element
}

// One mode (Live or Final) — header + copy button + body or empty hint.
// Prefer the streaming partial whenever it exists so the panel shows
// progressive fill while running AND retains whatever was generated even
// if the final parse errors out (setAnalysisResult clears progressPartial
// on success, falling through to `result`).
function AnalysisGroup<R>({
  title,
  lastRunAt,
  result,
  serialize,
  empty,
  boundaryLabel,
  renderView
}: AnalysisGroupProps<R>): JSX.Element {
  return (
    <div className="group">
      <div className="group-header">
        <span className="group-title">{title}</span>
        {lastRunAt && <span className="group-meta">{formatTime(lastRunAt)}</span>}
        <div className="group-spacer" />
        {result && <CopyButton text={serialize(result)} label="全文コピー" />}
      </div>
      {result ? (
        <ErrorBoundary label={boundaryLabel}>{renderView(result)}</ErrorBoundary>
      ) : (
        <p className="muted-center">{empty}</p>
      )}
    </div>
  )
}
