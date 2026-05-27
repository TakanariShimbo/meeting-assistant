// OpenAI API endpoints.
export const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'
export const RESPONSES_URL = 'https://api.openai.com/v1/responses'

// PulseAudio module names used by the Linux audio helper. Keep in sync with
// scripts/setup-linux-audio.sh — the regex matchers and string formatters in
// services/linuxAudio.ts depend on these exact spellings.
export const SINK_NAME = 'meeting_assistant'
export const CAPTURE_SOURCE_NAME = 'meeting_assistant_capture'
export const SINK_DESCRIPTION = 'MeetingAssistant_Sink'
export const CAPTURE_DESCRIPTION = 'MeetingAssistant_Capture'

// Streaming analyzer: how often we re-parse the accumulated text and emit
// a `partialResult` progress event. 150ms keeps the UI feeling live without
// burning CPU on every SSE delta.
export const ANALYZER_PARTIAL_THROTTLE_MS = 150

// BrowserWindow geometry for the main window. Keeping the layout numbers here
// (rather than inline in index.ts) makes them easy to tweak in one place.
export const MAIN_WINDOW = {
  width: 1360,
  height: 820,
  minWidth: 900,
  minHeight: 600,
  title: 'Meeting Assistant'
} as const
