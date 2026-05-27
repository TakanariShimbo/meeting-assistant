import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AUDIO_MODES,
  DEFAULT_INSTRUCTIONS,
  LANGUAGE_OPTIONS,
  LIVE_MODEL_OPTIONS,
  REASONING_EFFORTS,
  SESSION_MODES,
  type AppSettings,
  type AudioMode,
  type LanguageCode,
  type LiveModel,
  type ReasoningEffort,
  type SessionMode,
  type SettingsUpdate
} from '@shared/types'

interface DiskSettings {
  apiKeyEnc?: string
  apiKey?: string
  instructions?: string
  language?: string
  audioMode?: string
  micDeviceId?: string | null
  systemDeviceId?: string | null
  liveModel?: string
  liveReasoningEffort?: string
  liveWebSearch?: boolean
  finalModel?: string
  finalReasoningEffort?: string
  finalWebSearch?: boolean
  chatModel?: string
  chatReasoningEffort?: string
  chatWebSearch?: boolean
  sessionMode?: string
}

const FILE_NAME = 'settings.json'
const VALID_LANGUAGES = new Set<string>(LANGUAGE_OPTIONS.map((o) => o.code))
const VALID_AUDIO_MODES = new Set<string>(AUDIO_MODES)
const VALID_LIVE_MODELS = new Set<string>(LIVE_MODEL_OPTIONS)
const VALID_REASONING = new Set<string>(REASONING_EFFORTS)
const VALID_SESSION_MODES = new Set<string>(SESSION_MODES)

const DEFAULT_LIVE_MODEL: LiveModel = 'gpt-5-mini'
const DEFAULT_LIVE_REASONING: ReasoningEffort = 'low'
const DEFAULT_FINAL_MODEL: LiveModel = 'gpt-5'
const DEFAULT_FINAL_REASONING: ReasoningEffort = 'low'
const DEFAULT_CHAT_MODEL: LiveModel = 'gpt-5'
const DEFAULT_CHAT_REASONING: ReasoningEffort = 'low'
const DEFAULT_CHAT_WEB_SEARCH = true
const DEFAULT_SESSION_MODE: SessionMode = 'meeting'

let cache: DiskSettings | null = null

function filePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

async function loadFromDisk(): Promise<DiskSettings> {
  if (cache) return cache
  try {
    const text = await readFile(filePath(), 'utf-8')
    cache = JSON.parse(text) as DiskSettings
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[meeting-assistant] settings.json 読み込み失敗', err)
    }
    cache = {}
  }
  return cache
}

async function persist(data: DiskSettings): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(filePath(), JSON.stringify(data, null, 2), 'utf-8')
  cache = data
}

export async function getApiKey(): Promise<string | null> {
  const data = await loadFromDisk()
  if (data.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(data.apiKeyEnc, 'base64'))
    } catch (err) {
      console.warn('[meeting-assistant] API key 復号失敗', err)
    }
  }
  if (data.apiKey) return data.apiKey
  const env = process.env.OPENAI_API_KEY?.trim()
  return env && env.length > 0 ? env : null
}

export async function getAppSettings(): Promise<AppSettings> {
  const data = await loadFromDisk()
  const hasFromFile = Boolean(data.apiKeyEnc || data.apiKey)
  const hasFromEnv = Boolean(process.env.OPENAI_API_KEY?.trim())
  const lang = data.language ?? ''
  const mode = data.audioMode ?? 'mic'
  const liveModel = data.liveModel ?? DEFAULT_LIVE_MODEL
  const liveReasoning = data.liveReasoningEffort ?? DEFAULT_LIVE_REASONING
  const finalModel = data.finalModel ?? DEFAULT_FINAL_MODEL
  const finalReasoning = data.finalReasoningEffort ?? DEFAULT_FINAL_REASONING
  const chatModel = data.chatModel ?? DEFAULT_CHAT_MODEL
  const chatReasoning = data.chatReasoningEffort ?? DEFAULT_CHAT_REASONING
  const sessionMode = data.sessionMode ?? DEFAULT_SESSION_MODE
  return {
    hasApiKey: hasFromFile || hasFromEnv,
    instructions: data.instructions ?? DEFAULT_INSTRUCTIONS,
    language: VALID_LANGUAGES.has(lang) ? (lang as LanguageCode) : '',
    audioMode: VALID_AUDIO_MODES.has(mode) ? (mode as AudioMode) : 'mic',
    micDeviceId: data.micDeviceId ?? null,
    systemDeviceId: data.systemDeviceId ?? null,
    liveModel: VALID_LIVE_MODELS.has(liveModel) ? (liveModel as LiveModel) : DEFAULT_LIVE_MODEL,
    liveReasoningEffort: VALID_REASONING.has(liveReasoning)
      ? (liveReasoning as ReasoningEffort)
      : DEFAULT_LIVE_REASONING,
    liveWebSearch: Boolean(data.liveWebSearch),
    finalModel: VALID_LIVE_MODELS.has(finalModel) ? (finalModel as LiveModel) : DEFAULT_FINAL_MODEL,
    finalReasoningEffort: VALID_REASONING.has(finalReasoning)
      ? (finalReasoning as ReasoningEffort)
      : DEFAULT_FINAL_REASONING,
    finalWebSearch: Boolean(data.finalWebSearch),
    chatModel: VALID_LIVE_MODELS.has(chatModel) ? (chatModel as LiveModel) : DEFAULT_CHAT_MODEL,
    chatReasoningEffort: VALID_REASONING.has(chatReasoning)
      ? (chatReasoning as ReasoningEffort)
      : DEFAULT_CHAT_REASONING,
    // For chat, web-search defaults ON (Q&A often needs external context).
    // `??` lets explicit `false` survive; only an unsaved field falls back.
    chatWebSearch: data.chatWebSearch ?? DEFAULT_CHAT_WEB_SEARCH,
    sessionMode: VALID_SESSION_MODES.has(sessionMode)
      ? (sessionMode as SessionMode)
      : DEFAULT_SESSION_MODE
  }
}

export async function updateSettings(update: SettingsUpdate): Promise<AppSettings> {
  const data = { ...(await loadFromDisk()) }

  if (update.apiKey !== undefined) {
    if (update.apiKey === null || update.apiKey.trim() === '') {
      delete data.apiKey
      delete data.apiKeyEnc
    } else if (safeStorage.isEncryptionAvailable()) {
      data.apiKeyEnc = safeStorage.encryptString(update.apiKey).toString('base64')
      delete data.apiKey
    } else {
      console.warn('[meeting-assistant] safeStorage 不可、API key を平文保存します')
      data.apiKey = update.apiKey
      delete data.apiKeyEnc
    }
  }

  if (update.instructions !== undefined) {
    if (update.instructions.trim()) data.instructions = update.instructions
    else delete data.instructions
  }

  if (update.language !== undefined) {
    if (update.language && VALID_LANGUAGES.has(update.language)) {
      data.language = update.language
    } else {
      delete data.language
    }
  }

  if (update.audioMode !== undefined && VALID_AUDIO_MODES.has(update.audioMode)) {
    data.audioMode = update.audioMode
  }

  if (update.micDeviceId !== undefined) {
    data.micDeviceId = update.micDeviceId || null
  }

  if (update.systemDeviceId !== undefined) {
    data.systemDeviceId = update.systemDeviceId || null
  }

  if (update.liveModel !== undefined && VALID_LIVE_MODELS.has(update.liveModel)) {
    data.liveModel = update.liveModel
  }

  if (
    update.liveReasoningEffort !== undefined &&
    VALID_REASONING.has(update.liveReasoningEffort)
  ) {
    data.liveReasoningEffort = update.liveReasoningEffort
  }

  if (update.finalModel !== undefined && VALID_LIVE_MODELS.has(update.finalModel)) {
    data.finalModel = update.finalModel
  }

  if (
    update.finalReasoningEffort !== undefined &&
    VALID_REASONING.has(update.finalReasoningEffort)
  ) {
    data.finalReasoningEffort = update.finalReasoningEffort
  }

  if (update.liveWebSearch !== undefined) data.liveWebSearch = update.liveWebSearch
  if (update.finalWebSearch !== undefined) data.finalWebSearch = update.finalWebSearch

  if (update.chatModel !== undefined && VALID_LIVE_MODELS.has(update.chatModel)) {
    data.chatModel = update.chatModel
  }
  if (
    update.chatReasoningEffort !== undefined &&
    VALID_REASONING.has(update.chatReasoningEffort)
  ) {
    data.chatReasoningEffort = update.chatReasoningEffort
  }
  if (update.chatWebSearch !== undefined) data.chatWebSearch = update.chatWebSearch

  if (update.sessionMode !== undefined && VALID_SESSION_MODES.has(update.sessionMode)) {
    data.sessionMode = update.sessionMode
  }

  await persist(data)
  return getAppSettings()
}
