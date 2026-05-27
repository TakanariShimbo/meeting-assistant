import type { FinalAnalysis } from '@shared/analysis'
import {
  bullets,
  serializeActionItems,
  serializeAgenda,
  serializeDecisions,
  serializeMinutes,
  serializeQuotes
} from '../../utils/serialize'
import { Card, SectionHeader, BulletList } from './cards'
import { CATEGORY_LABEL } from './labels'
import {
  ActionItemsView,
  AgendaView,
  DecisionsView,
  MinutesView,
  QuotesView
} from './views'

export function FinalView({ result }: { result: FinalAnalysis }): JSX.Element {
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
