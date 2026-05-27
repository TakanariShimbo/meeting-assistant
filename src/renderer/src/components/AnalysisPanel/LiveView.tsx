import type { LiveAnalysis } from '@shared/analysis'
import {
  bullets,
  serializeActionItems,
  serializeConfirmations,
  serializeDecisions,
  serializeDiscussionFlow,
  serializeMinutes,
  serializeQuotes,
  serializeSuggestions
} from '../../utils/serialize'
import { Card, SectionHeader, StatusChips, BulletList } from './cards'
import { CATEGORY_LABEL, CONFIDENCE_LABEL } from './labels'
import {
  ActionItemsView,
  ConfirmationsView,
  DecisionsView,
  DiscussionFlowView,
  MinutesView,
  QuotesView,
  SuggestionsView
} from './views'

export function LiveView({ result }: { result: LiveAnalysis }): JSX.Element {
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
          <ConfirmationsView items={result.confirmationNeeded} />
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
