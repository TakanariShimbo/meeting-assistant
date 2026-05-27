import { useEffect, useState } from 'react'
import { AnalysisPanel } from './AnalysisPanel'
import { ChatPanel } from './ChatPanel'

type Tab = 'analysis' | 'chat'

const TAB_KEY = 'meeting-assistant:rightPaneTab'

function loadTab(): Tab {
  const v = localStorage.getItem(TAB_KEY)
  return v === 'chat' ? 'chat' : 'analysis'
}

interface Props {
  width: number
}

/**
 * Right-hand pane with tabs to switch between Analysis and Chat. Both child
 * components stay mounted regardless of which is visible so per-tab state
 * (analysis progress, chat history, streaming) is preserved when toggling.
 */
export function RightPane({ width }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>(loadTab)

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  return (
    <aside className="right-pane" style={{ width, flex: 'none' }}>
      <div className="right-tabs" role="tablist">
        <TabButton current={tab} value="analysis" onSelect={setTab}>
          分析
        </TabButton>
        <TabButton current={tab} value="chat" onSelect={setTab}>
          チャット
        </TabButton>
      </div>
      <div className={`right-tab-body ${tab === 'analysis' ? 'show-analysis' : 'show-chat'}`}>
        <div className="tab-pane" hidden={tab !== 'analysis'}>
          <AnalysisPanel />
        </div>
        <div className="tab-pane" hidden={tab !== 'chat'}>
          <ChatPanel />
        </div>
      </div>
    </aside>
  )
}

function TabButton({
  current,
  value,
  onSelect,
  children
}: {
  current: Tab
  value: Tab
  onSelect: (v: Tab) => void
  children: string
}): JSX.Element {
  const active = current === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`right-tab ${active ? 'active' : ''}`}
      onClick={() => onSelect(value)}
    >
      {children}
    </button>
  )
}
