import { REALTIME_MODEL, type SdpExchangeRequest, type SdpExchangeResponse } from '@shared/types'
import { getApiKey } from './settings'

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

/**
 * Forwards the renderer's WebRTC offer + initial session config to OpenAI's
 * Realtime API and returns the answer SDP. Mirrors RealtimeRG's
 * `Signaling.exchangeSdp` (host/transport/Signaling.kt): multipart form with
 * `sdp` + `session`, so the session is provisioned in the same round-trip
 * (no follow-up `session.update` needed for first-time config).
 *
 * Keeping the call in the main process means the API key never reaches
 * renderer-side JavaScript.
 */
export async function exchangeSdp(req: SdpExchangeRequest): Promise<SdpExchangeResponse> {
  const apiKey = await getApiKey()
  if (!apiKey) return { ok: false, error: 'OpenAI API キーが未設定です' }

  const url = `${REALTIME_CALLS_URL}?model=${encodeURIComponent(REALTIME_MODEL)}`

  const form = new FormData()
  form.append('sdp', req.offerSdp)
  form.append('session', req.sessionJson)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
        // Note: omit Content-Type — fetch sets it (with boundary) from FormData.
      },
      body: form
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      return { ok: false, error: `SDP exchange failed: HTTP ${resp.status} ${body}` }
    }
    const answerSdp = await resp.text()
    return { ok: true, answerSdp }
  } catch (err) {
    return { ok: false, error: `SDP exchange error: ${(err as Error).message}` }
  }
}
