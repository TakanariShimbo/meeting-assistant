import { useEffect } from 'react'
import type { ChatMessage } from '@shared/chat'
import { useStore } from '../../store'
import { InputBox } from './InputBox'
import { MessageList } from './MessageList'

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function ChatPanel(): JSX.Element {
  const chat = useStore((s) => s.chat)
  const items = useStore((s) => s.items)
  const appendChatMessage = useStore((s) => s.appendChatMessage)
  const setChatStreaming = useStore((s) => s.setChatStreaming)
  const setChatStreamingText = useStore((s) => s.setChatStreamingText)
  const setChatError = useStore((s) => s.setChatError)
  const clearChat = useStore((s) => s.clearChat)

  // Subscribe to live tokens from the main-process stream consumer.
  useEffect(() => {
    return window.api.onChatProgress((p) => {
      // Always read the latest streaming flag from the store rather than
      // closing over it — the listener is registered once at mount.
      if (useStore.getState().chat.streaming) {
        setChatStreamingText(p.text)
      }
    })
  }, [setChatStreamingText])

  const onSend = async (text: string): Promise<void> => {
    const userMsg: ChatMessage = {
      id: randomId(),
      role: 'user',
      text,
      createdAt: Date.now()
    }
    appendChatMessage(userMsg)
    setChatStreaming(true)

    // Snapshot AFTER appending so the new user message is the last item.
    const messages = useStore.getState().chat.messages
    const transcript = items
      .filter((i) => i.text.trim().length > 0)
      .map((i) => ({ itemId: i.id, text: i.text }))

    const resp = await window.api.chat({ messages, transcript })

    if (resp.ok) {
      appendChatMessage({
        id: randomId(),
        role: 'assistant',
        text: resp.text,
        createdAt: Date.now()
      })
      setChatStreaming(false)
    } else if (resp.partialText) {
      // Cancelled mid-stream: keep whatever was generated as a normal
      // assistant message so the user doesn't lose the partial answer,
      // but mark it visibly so they know it was interrupted.
      appendChatMessage({
        id: randomId(),
        role: 'assistant',
        text: `${resp.partialText}\n\n_(中断されました)_`,
        createdAt: Date.now()
      })
      setChatStreaming(false)
    } else {
      setChatStreaming(false)
      setChatError(resp.error)
    }
  }

  const onStop = (): void => {
    void window.api.cancelChat()
  }

  return (
    <div className="chat-panel">
      <MessageList
        messages={chat.messages}
        streamingText={chat.streamingText}
        streaming={chat.streaming}
        errorMessage={chat.errorMessage}
      />
      <InputBox
        disabled={false}
        streaming={chat.streaming}
        onSend={(t) => void onSend(t)}
        onStop={onStop}
        onClear={clearChat}
        hasHistory={chat.messages.length > 0}
      />
    </div>
  )
}
