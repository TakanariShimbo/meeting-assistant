export interface AppSettings {
  hasApiKey: boolean
  instructions: string
  language: LanguageCode
  audioMode: AudioMode
  /** Specific mic device. null = browser default. */
  micDeviceId: string | null
  /** Specific system-audio device (monitor / loopback). null = unset. */
  systemDeviceId: string | null
  liveModel: LiveModel
  liveReasoningEffort: ReasoningEffort
  liveWebSearch: boolean
  finalModel: LiveModel
  finalReasoningEffort: ReasoningEffort
  finalWebSearch: boolean
  chatModel: LiveModel
  chatReasoningEffort: ReasoningEffort
  chatWebSearch: boolean
  /** Initial Realtime session mode when Start is pressed. Switchable mid-session via the header toggle. */
  sessionMode: SessionMode
}

export interface SettingsUpdate {
  apiKey?: string | null
  instructions?: string
  language?: LanguageCode
  audioMode?: AudioMode
  micDeviceId?: string | null
  systemDeviceId?: string | null
  liveModel?: LiveModel
  liveReasoningEffort?: ReasoningEffort
  liveWebSearch?: boolean
  finalModel?: LiveModel
  finalReasoningEffort?: ReasoningEffort
  finalWebSearch?: boolean
  chatModel?: LiveModel
  chatReasoningEffort?: ReasoningEffort
  chatWebSearch?: boolean
  sessionMode?: SessionMode
}

export const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

export const REASONING_LABELS: Record<ReasoningEffort, string> = {
  minimal: 'minimal (最速・推論ほぼ無し)',
  low: 'low (軽い推論・推奨)',
  medium: 'medium (中程度の推論)',
  high: 'high (重い推論・遅い)'
}

export const LIVE_MODEL_OPTIONS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'] as const
export type LiveModel = (typeof LIVE_MODEL_OPTIONS)[number]

export const LIVE_MODEL_LABELS: Record<LiveModel, string> = {
  'gpt-5': 'gpt-5 (高品質・遅い)',
  'gpt-5-mini': 'gpt-5-mini (バランス・推奨)',
  'gpt-5-nano': 'gpt-5-nano (最速・低品質)'
}

export const AUDIO_MODES = ['mic', 'system', 'mixed'] as const
export type AudioMode = (typeof AUDIO_MODES)[number]

/**
 * Realtime session behavior — distinguishes who triggers the assistant reply.
 *  - `meeting`:      `create_response=false`. Reply only when the user clicks
 *                    "返答要求" (= 手動返答). Default for note-taking use cases.
 *  - `conversation`: `create_response=true`. Assistant replies automatically
 *                    on every detected turn end (= 自動返答). Manual reply
 *                    request still works.
 *
 * The internal type values stay `meeting` / `conversation` for stability of
 * persisted settings; only the UI labels speak of 手動/自動 返答.
 * Mode can be switched mid-session via `session.update`.
 */
export const SESSION_MODES = ['meeting', 'conversation'] as const
export type SessionMode = (typeof SESSION_MODES)[number]

export const SESSION_MODE_LABELS: Record<SessionMode, string> = {
  meeting: '手動返答',
  conversation: '自動返答'
}

export const AUDIO_MODE_LABELS: Record<AudioMode, string> = {
  mic: 'マイクのみ',
  system: 'PC音声のみ',
  mixed: 'マイク + PC音声 結合'
}

export interface AudioSetupStatus {
  pactlAvailable: boolean
  /** All required modules loaded: null-sink + remap-source (+ loopback). */
  ready: boolean
  sinkLoaded: boolean
  captureSourceLoaded: boolean
  loopbackLoaded: boolean
  /** Currently selected system default sink (PulseAudio name). */
  defaultSink: string | null
  /** True when defaultSink === our virtual sink (= 全アプリ自動キャプチャ on). */
  isCapturingDefault: boolean
}

export interface SdpExchangeRequest {
  offerSdp: string
  /** Initial session config JSON (passed to OpenAI as the multipart `session` field). */
  sessionJson: string
}

export type SdpExchangeResponse =
  | { ok: true; answerSdp: string }
  | { ok: false; error: string }

// Fixed values — track RealtimeRG's RealtimeConfig (host/protocol/ProtocolTypes.kt).
// Hard-coded rather than user-configurable; change here when bumping models.
export const REALTIME_MODEL = 'gpt-realtime-2'
export const TRANSCRIPTION_MODEL = 'gpt-realtime-whisper'
export const VOICE = 'alloy'

export const DEFAULT_INSTRUCTIONS =
  'You are a friendly, concise voice assistant. ' +
  'Reply in Japanese unless the user speaks another language.'

/**
 * Optional ISO-639-1 transcription hint. The Realtime API treats this as a
 * soft hint — supplying it improves accuracy/latency for the expected
 * language without blocking other languages entirely. '' = auto-detect.
 */
export type LanguageCode =
  | ''
  | 'ja'
  | 'en'
  | 'zh'
  | 'ko'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'ru'

export interface LanguageOption {
  code: LanguageCode
  label: string
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: '', label: '自動検出 (Auto)' },
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' }
]
