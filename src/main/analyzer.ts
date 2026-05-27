import {
  FINAL_ANALYSIS_SCHEMA,
  LIVE_ANALYSIS_SCHEMA,
  type AnalysisMode,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type FinalAnalysis,
  type LiveAnalysis
} from '@shared/analysis'
import type { ReasoningEffort } from '@shared/types'
import { getApiKey, getAppSettings } from './settings'
import { getAttachmentsForAnalyzer } from './attachments'

/**
 * Progress event emitted to the renderer while a streaming analyze call
 * is in flight. Allows the UI to show a live activity indicator, the
 * accumulated text length, and — when possible — the current best-effort
 * partial result so cards fill in as the model writes them.
 */
export interface AnalysisProgress {
  mode: AnalysisMode
  /** 'reasoning' (model is thinking) or 'output' (text is streaming). */
  phase: 'reasoning' | 'output'
  /** Characters of output text streamed so far (always 0 during reasoning). */
  outputChars: number
  /** Best-effort partial parse, with missing fields filled with defaults. */
  partialResult?: LiveAnalysis | FinalAnalysis
}

type ProgressEmitter = (p: AnalysisProgress) => void

let emitProgress: ProgressEmitter = () => {
  /* default no-op; main wires up the real emitter at startup */
}

export function setProgressEmitter(fn: ProgressEmitter): void {
  emitProgress = fn
}

const RESPONSES_URL = 'https://api.openai.com/v1/responses'

// Both Live and Final model + reasoning effort come from user settings.
// Defaults: Live = gpt-5-mini + low (speed), Final = gpt-5 + medium (quality).

const SHARED_GUIDELINES = `分析の思考手順（必ずこの順序で）:
1. まず「整理」系の項目を文字起こしから埋める（何が起きているか・何が論点か・何が事実か・何が決まったか）。
2. その整理結果を **根拠** として「アクション」系の項目を導出する（要確認・提案・決定・アクション・アジェンダ）。
3. アクション系の各項目の \`reason\` フィールドには、整理結果のどの観点（どの論点・事実・流れ）を根拠としたかを明示する。
4. 文字起こしに無いことを推測で書かない。曖昧な点は要確認に回す。
5. previous_analysis があれば、それを土台として更新する（ゼロから作り直さない）。new_transcript は前回分析以降の追加発話。
6. new_transcript には未確定（発話途中）の partial transcript も含まれます。文章として意味が取れない断片は無理に解釈せず、確実な部分だけを採用してください。
7. すべて日本語で回答（固有名詞・引用はそのままで OK）。

視認性ガイド（絵文字で一目でわかるように）:
- **配列フィールド（箇条書きになるもの）の各要素は、内容に合った絵文字を 1 個冒頭に付ける**。
  対象: currentTopics, keyFacts, discussionFlow[].step, minutes[].points,
        notableQuotes[].quote, confirmationNeeded[].point, nextSuggestions[].topic,
        decisions[].decision, actionItems[].what (または .who 側でも可), nextAgenda[].topic
- 文章フィールド（briefStatus, summary, meetingPurpose）では強調したい部分のみ控えめに 1〜2 個。
- reason フィールドには基本付けない（補足説明なので）。
- 絵文字目安:
  - 💰 金額・コスト  📅 日付・期限  👤 人名・役職  🏢 組織・会社
  - ✅ 決定・確定  ❓ 要確認・曖昧  ⚠️ 注意・リスク  💡 提案・アイデア
  - 💬 引用・発言  ▶ 進行中・現在  📝 議事録セクション  🎯 目的・ゴール
  - 🔧 ツール・技術  📊 数値・指標  🗓 スケジュール  🤝 合意  🚧 ブロッカー
- 同じ絵文字ばかりにならないよう、内容に応じて使い分ける。判別不能なら付けなくて良い。
`

const LIVE_SYSTEM = `あなたは会議をリアルタイムで観察し、進行を補助するアシスタントです。
与えられた文字起こしを読み、JSON スキーマに沿った "ここまでの会議の draft 版" を返してください。

${SHARED_GUIDELINES}

ライブ分析特有のガイドライン:
- category は強い根拠が揃うまで categoryConfidence を low/med に。途中で確信が変われば変更してよい。
- discussionFlow は会議の遷移を 3〜7 ステップで。現在のステップは isCurrent=true、それ以前は false。
- currentTopics は「いま議論されている論点」3〜5 個。解決済みは入れない。
- keyFacts は聞き逃したくないファクト（数字・期限・人名・組織・約束など）を箇条書き。
- briefStatus は「いま何をしている会議か」を 1 行で。
- summary は "ここまでの会議" を 2〜4 文で（更新可能な draft 感）。
- minutes は "ここまでの議事録" を時系列セクションで。会議が進むにつれセクションが増えていく前提。
- notableQuotes は印象的な発言を 0〜3 件。speaker は推測できれば名前、不明なら null。
- confirmationNeeded は「今すぐ聞き返したい曖昧点」。
  **point は、ユーザーがそのまま会議で口に出して聞ける形の日本語文** で書く（疑問形・依頼形が基本、です/ます調）。
  名詞句や見出し的な表現は禁止。
  - ✅ 「『フィルム部』というのは部署名でしょうか、それともプロジェクト名でしょうか？」
  - ✅ 「『来年』というのは来年度（4 月始まり）と来年 1 月、どちらの意味でしょうか？」
  - ❌ 「『フィルム部』が何を指すか不明」（名詞句で読み上げできない）
  reason に「どこが曖昧か / なぜ確認が必要か」を書く。

- nextSuggestions は進行を前進させる次トピック 2〜3 個。
  **topic は、ユーザーがそのまま会議で口に出して提案できる形の日本語文** で書く（依頼形・提案形・疑問形、です/ます調）。
  名詞句や見出し的な表現は禁止。
  - ✅ 「実機を一度見せていただけますか？着用感や主な機能をライブで確認したいです」
  - ✅ 「翻訳・ナビ・録音・カメラなど、メインで使う機能を一通り整理しませんか？」
  - ❌ 「実機デモ（着用感・主要機能のライブ確認）」（見出し風で読み上げできない）
  reason に「現在の論点や流れのどこを踏まえてこの提案か」。
- decisions / actionItems は "ここまでに確定したもの" のみ。途中で変わりそうなものは含めない。
`

const FINAL_SYSTEM = `あなたは会議終了後の議事録 AI です。
全体の文字起こしを読み、JSON スキーマに沿った確定版の議事録を返してください。

${SHARED_GUIDELINES}

入力について:
- new_transcript は **会議全体の文字起こし全文** です（Final モードは差分ではなく全文を受け取ります）。
  ground truth として扱い、previous_analysis に齟齬があれば文字起こしを優先して訂正してください。
- previous_analysis は「前回の Final 整理結果」または「Live モードの最新整理結果」のどちらか、
  もしくは null（初回）です。これは draft / hint として扱い、土台にしつつ全文と照合して補強・訂正します。
  - Live のスキーマは Final と一部異なります (例: discussionFlow / currentTopics / phase 等は Live のみ)。
    共通フィールド (category, meetingPurpose, summary, minutes, keyFacts, notableQuotes,
    decisions, actionItems) は Live から引き継ぎ・補強し、Live に無い Final 固有フィールド
    (nextAgenda) を新たに導出してください。

ファイナル分析特有のガイドライン:
- meetingPurpose は冒頭で示された目的があれば抽出、無ければ null。推測しない。
- summary は会議の目的・流れ・結論を 3〜6 文のパラグラフで。
- minutes は時系列セクションに分け、各セクションに要点を箇条書きで。
- keyFacts は会議全体で出てきた重要ファクト（数字・期限・人名・組織・約束）。
- notableQuotes は印象的な発言 1〜3 件。reason に「なぜこの発言が会議の本質を表しているか」を書く。
- decisions は会議内で明確に決まった事項のみ。reason に「どんな議論を経て決まったか」。
- actionItems は誰が・何を・いつまでに。reason に「なぜこのアクションが必要か」。by が明示されていなければ null。
- nextAgenda は次回扱うべきテーマ。reason に「なぜ次回扱うべきか（今回の積み残し or 派生論点）」。
`

type ContentBlock =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; filename: string; file_data: string }

interface InputMessage {
  role: 'system' | 'user'
  content: string | ContentBlock[]
}

interface ResponsesApiBody {
  model: string
  reasoning: { effort: ReasoningEffort }
  input: InputMessage[]
  text: {
    format: {
      type: 'json_schema'
      name: string
      schema: unknown
      strict: true
    }
  }
  tools?: Array<{ type: string }>
  stream?: boolean
}

const WEB_SEARCH_NOTE = `Web 検索ツールが利用可能です。以下のケースで活用してください:
- 文字起こしに登場した固有名詞（会社名・人名・製品名）の表記揺れや基本情報の確認
- 最新の業界動向・統計・ニュースなどの背景情報の補完
- 添付資料に無い外部知識のファクトチェック

ただし以下には使わないでください:
- 文字起こし内の発言内容そのもの（ground truth は文字起こし）
- 推測・創作の根拠付け
- 個人を特定するセンシティブな検索

検索結果は分析に活用するだけで、出力 JSON のスキーマは変えないでください。`

export async function analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const apiKey = await getApiKey()
  if (!apiKey) return { ok: false, error: 'OpenAI API キーが未設定です' }

  if (req.newSegments.length === 0 && !req.previous) {
    return { ok: false, error: '分析するための文字起こしがまだありません' }
  }

  const transcriptText = req.newSegments.map((s) => s.text).join('\n')
  const previousJson = req.previous ? JSON.stringify(req.previous, null, 2) : 'なし（初回分析）'

  const userPrompt = `[previous_analysis]
${previousJson}

[new_transcript]
${transcriptText || '（新規発話なし）'}
`

  const settings = await getAppSettings()
  const model = req.mode === 'live' ? settings.liveModel : settings.finalModel
  const effort =
    req.mode === 'live' ? settings.liveReasoningEffort : settings.finalReasoningEffort
  const webSearch = req.mode === 'live' ? settings.liveWebSearch : settings.finalWebSearch

  // Attachments are sent as their own user message so they form a stable
  // prefix across runs — OpenAI's prompt cache can then reuse the encoded
  // content for free on subsequent analyses with the same files.
  const baseSystem = req.mode === 'live' ? LIVE_SYSTEM : FINAL_SYSTEM
  const systemContent = webSearch ? `${baseSystem}\n\n${WEB_SEARCH_NOTE}` : baseSystem
  const messages: InputMessage[] = [{ role: 'system', content: systemContent }]
  const attachments = getAttachmentsForAnalyzer()
  if (attachments.length > 0) {
    const blocks: ContentBlock[] = [
      {
        type: 'input_text',
        text: '以下は会議の参考資料です。背景情報として活用してください（文字起こしと矛盾する場合は文字起こしを優先）。'
      }
    ]
    for (const a of attachments) {
      if (a.kind === 'text') {
        blocks.push({
          type: 'input_text',
          text: `--- 添付テキスト: ${a.filename} ---\n${a.payload}`
        })
      } else if (a.kind === 'image') {
        blocks.push({
          type: 'input_image',
          image_url: `data:${a.mime};base64,${a.payload}`
        })
      } else {
        blocks.push({
          type: 'input_file',
          filename: a.filename,
          file_data: `data:${a.mime};base64,${a.payload}`
        })
      }
    }
    messages.push({ role: 'user', content: blocks })
  }
  messages.push({ role: 'user', content: userPrompt })

  const body: ResponsesApiBody = {
    model,
    reasoning: { effort },
    input: messages,
    text: {
      format: {
        type: 'json_schema',
        name: req.mode === 'live' ? 'live_analysis' : 'final_analysis',
        schema: req.mode === 'live' ? LIVE_ANALYSIS_SCHEMA : FINAL_ANALYSIS_SCHEMA,
        strict: true
      }
    },
    stream: true,
    ...(webSearch ? { tools: [{ type: 'web_search' }] } : {})
  }

  let resp: Response
  try {
    resp = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(body)
    })
  } catch (err) {
    return { ok: false, error: `Responses API request failed: ${(err as Error).message}` }
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    return { ok: false, error: `Responses API HTTP ${resp.status}: ${errText}` }
  }

  if (!resp.body) {
    return { ok: false, error: 'Responses API returned no streaming body' }
  }

  // Kick off "thinking" phase so the UI shows immediate activity. We don't
  // know yet whether it'll be reasoning or output first; reasoning is the
  // common case for gpt-5 family.
  emitProgress({ mode: req.mode, phase: 'reasoning', outputChars: 0 })

  let jsonText: string | null
  try {
    jsonText = await consumeStream(resp.body, req.mode)
  } catch (err) {
    return { ok: false, error: `Stream read failed: ${(err as Error).message}` }
  }

  if (!jsonText) {
    return { ok: false, error: 'Responses API stream produced no output text' }
  }

  // Primary path: the stream produced complete, schema-conformant JSON.
  try {
    const result = JSON.parse(jsonText)
    if (req.mode === 'live') {
      return { ok: true, mode: 'live', result: result as LiveAnalysis }
    }
    return { ok: true, mode: 'final', result: result as FinalAnalysis }
  } catch (err) {
    // Fallback: stream ended on incomplete JSON (model cutoff, network blip,
    // budget exhausted, …). Recover whatever fields we can with the partial
    // parser so the user keeps the work the model has already done.
    const partial = tryPartialParse(jsonText)
    if (partial && typeof partial === 'object') {
      if (req.mode === 'live') {
        return { ok: true, mode: 'live', result: fillLiveDefaults(partial as Record<string, unknown>) }
      }
      return { ok: true, mode: 'final', result: fillFinalDefaults(partial as Record<string, unknown>) }
    }
    return { ok: false, error: `Structured output parse failed: ${(err as Error).message}` }
  }
}

/**
 * Consumes a Responses API SSE stream, accumulates the structured-output text
 * deltas, and emits progress events (with a best-effort partial parse) along
 * the way. Returns the full JSON string when the stream completes.
 *
 * SSE wire format from /v1/responses:
 *   event: response.output_text.delta
 *   data: {"type":"response.output_text.delta","delta":"...","sequence_number":N,...}
 *
 * We watch `response.output_text.delta` for content and try parsing the
 * accumulated text every ~150ms; whatever fields are complete get sent to the
 * renderer so the UI cards fill in progressively. Reasoning events are
 * ignored beyond the "we're alive" signal.
 */
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  mode: AnalysisMode
): Promise<string | null> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let accumulated = ''
  let lastPartialAt = 0
  const PARTIAL_THROTTLE_MS = 150

  const emitPartial = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastPartialAt < PARTIAL_THROTTLE_MS) {
      emitProgress({ mode, phase: 'output', outputChars: accumulated.length })
      return
    }
    lastPartialAt = now
    const parsed = tryPartialParse(accumulated)
    const partialResult =
      parsed && typeof parsed === 'object'
        ? mode === 'live'
          ? fillLiveDefaults(parsed as Record<string, unknown>)
          : fillFinalDefaults(parsed as Record<string, unknown>)
        : undefined
    emitProgress({ mode, phase: 'output', outputChars: accumulated.length, partialResult })
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      // SSE events are separated by blank lines (\n\n). Process all complete
      // events in the buffer and keep the trailing partial event.
      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const rawEvent = buf.slice(0, sep)
        buf = buf.slice(sep + 2)

        const lines = rawEvent.split('\n')
        let dataLine: string | null = null
        for (const line of lines) {
          if (line.startsWith('data: ')) dataLine = line.slice(6)
          else if (line.startsWith('data:')) dataLine = line.slice(5).trimStart()
        }
        if (!dataLine || dataLine === '[DONE]') continue

        try {
          const evt = JSON.parse(dataLine) as {
            type?: string
            delta?: string
            text?: string
          }
          if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
            accumulated += evt.delta
            emitPartial()
          } else if (evt.type === 'response.output_text.done' && typeof evt.text === 'string') {
            // Some streams send the full text on done; prefer it if longer.
            if (evt.text.length > accumulated.length) accumulated = evt.text
          }
        } catch {
          /* skip malformed event */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return accumulated || null
}

// ---------- partial JSON parsing ----------

/**
 * Best-effort partial JSON parser. Closes open strings, balances braces,
 * and walks back to safe delimiter positions if the immediate completion
 * doesn't parse. Returns `null` if nothing remotely parseable can be found.
 */
function tryPartialParse(text: string): unknown | null {
  const t = text.trimStart()
  if (!t.startsWith('{')) return null

  const fullCandidate = closeBalanced(t)
  if (fullCandidate) {
    try {
      return JSON.parse(fullCandidate)
    } catch {
      /* fall through to truncation attempts */
    }
  }

  // Walk back through string-aware delimiter positions, retrying.
  const delims = findSafeDelimiters(t)
  // Bound iterations to keep parsing cheap on long responses.
  const MAX_ATTEMPTS = 30
  const start = Math.max(0, delims.length - MAX_ATTEMPTS)
  for (let i = delims.length - 1; i >= start; i--) {
    const { pos, kind } = delims[i]
    const cut = kind === 'comma' ? pos : pos + 1
    const sub = t.slice(0, cut).trimEnd()
    const candidate = closeBalanced(sub)
    if (!candidate) continue
    try {
      return JSON.parse(candidate)
    } catch {
      /* try the next earlier delimiter */
    }
  }
  return null
}

function findSafeDelimiters(text: string): Array<{ pos: number; kind: 'comma' | 'open' }> {
  const out: Array<{ pos: number; kind: 'comma' | 'open' }> = []
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === ',') out.push({ pos: i, kind: 'comma' })
    else if (c === '{' || c === '[') out.push({ pos: i, kind: 'open' })
  }
  return out
}

function closeBalanced(text: string): string | null {
  let inString = false
  let escape = false
  const stack: string[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') stack.push('}')
    else if (c === '[') stack.push(']')
    else if (c === '}' || c === ']') {
      if (stack.length === 0) return null
      stack.pop()
    }
  }
  let body = text
  if (inString) body += '"'
  body = body.trimEnd()
  if (body.endsWith(':')) body += ' null'
  body += stack.slice().reverse().join('')
  // Remove trailing comma right before a closing brace/bracket.
  body = body.replace(/,(\s*[}\]])/g, '$1')
  return body
}

// ---------- partial-result defaulting ----------
// The schema is fully-required (strict mode). Partial parses may be missing
// fields OR have items with missing inner fields (e.g. a `minutes` section
// streamed before its `points` array arrived). We deep-validate every nested
// item so the UI can `.length` / `.map` freely without crashing.

function asString(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asBoolean(v: unknown, fb = false): boolean {
  return typeof v === 'boolean' ? v : fb
}

function asUnknownArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function asStringArray(v: unknown): string[] {
  return asUnknownArray(v).filter((x): x is string => typeof x === 'string')
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function safeDiscussionStep(v: unknown): LiveAnalysis['discussionFlow'][number] {
  const o = asObject(v)
  return { step: asString(o.step), isCurrent: asBoolean(o.isCurrent) }
}

function safeMinutesSection(v: unknown): LiveAnalysis['minutes'][number] {
  const o = asObject(v)
  return { section: asString(o.section), points: asStringArray(o.points) }
}

function safeNotableQuote(v: unknown): LiveAnalysis['notableQuotes'][number] {
  const o = asObject(v)
  return {
    quote: asString(o.quote),
    speaker: asStringOrNull(o.speaker),
    reason: asString(o.reason)
  }
}

function safeConfirmationNeeded(v: unknown): LiveAnalysis['confirmationNeeded'][number] {
  const o = asObject(v)
  return { point: asString(o.point), reason: asString(o.reason) }
}

function safeNextSuggestion(v: unknown): LiveAnalysis['nextSuggestions'][number] {
  const o = asObject(v)
  return { topic: asString(o.topic), reason: asString(o.reason) }
}

function safeDecision(v: unknown): LiveAnalysis['decisions'][number] {
  const o = asObject(v)
  return { decision: asString(o.decision), reason: asString(o.reason) }
}

function safeActionItem(v: unknown): LiveAnalysis['actionItems'][number] {
  const o = asObject(v)
  return {
    who: asString(o.who),
    what: asString(o.what),
    by: asStringOrNull(o.by),
    reason: asString(o.reason)
  }
}

function safeAgenda(v: unknown): FinalAnalysis['nextAgenda'][number] {
  const o = asObject(v)
  return { topic: asString(o.topic), reason: asString(o.reason) }
}

function fillLiveDefaults(p: Record<string, unknown>): LiveAnalysis {
  return {
    category: (p.category as LiveAnalysis['category']) ?? 'other',
    categoryConfidence: (p.categoryConfidence as LiveAnalysis['categoryConfidence']) ?? 'low',
    phase: (p.phase as LiveAnalysis['phase']) ?? '導入',
    briefStatus: asString(p.briefStatus),
    discussionFlow: asUnknownArray(p.discussionFlow).map(safeDiscussionStep),
    currentTopics: asStringArray(p.currentTopics),
    keyFacts: asStringArray(p.keyFacts),
    meetingPurpose: asStringOrNull(p.meetingPurpose),
    summary: asString(p.summary),
    minutes: asUnknownArray(p.minutes).map(safeMinutesSection),
    notableQuotes: asUnknownArray(p.notableQuotes).map(safeNotableQuote),
    confirmationNeeded: asUnknownArray(p.confirmationNeeded).map(safeConfirmationNeeded),
    nextSuggestions: asUnknownArray(p.nextSuggestions).map(safeNextSuggestion),
    decisions: asUnknownArray(p.decisions).map(safeDecision),
    actionItems: asUnknownArray(p.actionItems).map(safeActionItem)
  }
}

function fillFinalDefaults(p: Record<string, unknown>): FinalAnalysis {
  return {
    category: (p.category as FinalAnalysis['category']) ?? 'other',
    meetingPurpose: asStringOrNull(p.meetingPurpose),
    summary: asString(p.summary),
    minutes: asUnknownArray(p.minutes).map(safeMinutesSection),
    keyFacts: asStringArray(p.keyFacts),
    notableQuotes: asUnknownArray(p.notableQuotes).map(safeNotableQuote),
    decisions: asUnknownArray(p.decisions).map(safeDecision),
    actionItems: asUnknownArray(p.actionItems).map(safeActionItem),
    nextAgenda: asUnknownArray(p.nextAgenda).map(safeAgenda)
  }
}
