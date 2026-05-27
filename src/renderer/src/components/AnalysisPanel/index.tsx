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
            {final.status === 'running' ? (
              <RunningLabel state={final} kind="final" />
            ) : (
              '会議を締める'
            )}
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

      <AnalysisGroup
        title="ライブ分析"
        lastRunAt={live.lastRunAt}
        result={live.progressPartial ?? live.result}
        serialize={serializeLiveAnalysis}
        empty="未実行。発話が溜まったら「ライブ整理」を押してください。"
        boundaryLabel="ライブ分析"
        renderView={(r) => <LiveView result={r as LiveAnalysis} />}
      />
      <AnalysisGroup
        title="ファイナル分析"
        lastRunAt={final.lastRunAt}
        result={final.progressPartial ?? final.result}
        serialize={serializeFinalAnalysis as (r: LiveAnalysis | FinalAnalysis) => string}
        empty="未実行。会議終了時に「会議を締める」を押してください。"
        boundaryLabel="ファイナル分析"
        renderView={(r) => <FinalView result={r as FinalAnalysis} />}
      />
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
