import {
  REALTIME_MODEL,
  TRANSCRIPTION_MODEL,
  VOICE,
  type LanguageCode
} from '@shared/types'

export interface RealtimeClientCallbacks {
  onStatus: (status: 'connecting' | 'connected' | 'closed' | 'error', detail?: string) => void
  onUserTranscriptDelta: (itemId: string, delta: string) => void
  onUserTranscriptCompleted: (itemId: string, text: string) => void
  onEvent?: (event: unknown) => void
}

export interface RealtimeClientOptions {
  instructions: string
  /** ISO-639-1 hint for the transcription model. '' = auto-detect. */
  language: LanguageCode
  /**
   * Auto-trigger assistant response after user turn ends. Default false for
   * transcription-only meetings; flip to true to get conversational replies
   * without changing the rest of the session config.
   */
  autoCreateResponse?: boolean
}

/**
 * Browser-side WebRTC client for OpenAI's Realtime API.
 *
 * Mirrors RealtimeRG's host/transport (RtcTransport.kt + Signaling.kt) +
 * host/protocol (EventCodec.kt):
 *   - mic over `oai-mic` audio track, sendrecv transceiver
 *   - JSON events over `oai-events` ordered data channel
 *   - initial session config sent inline at SDP exchange time (multipart),
 *     so no follow-up `session.update` is needed
 *   - reasoning.effort=low + server_vad + interrupt_response=true mirror
 *     SessionDriver.configFor()
 *
 * Transcription-only mode is `autoCreateResponse=false`. The session is still
 * a full conversation session, so flipping `autoCreateResponse` to true (and
 * sending an explicit `response.create` event) starts producing replies
 * without re-architecting the transport.
 */
export class RealtimeClient {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private stream: MediaStream | null = null
  /** Stops mic/system tracks and tears down any AudioContext used for mixing. */
  private streamCleanup: (() => void) | null = null

  constructor(
    private readonly cb: RealtimeClientCallbacks,
    private readonly opts: RealtimeClientOptions
  ) {}

  /**
   * Caller is responsible for building the audio source (mic / system audio /
   * mixed) and passing the resulting stream + cleanup. Lifecycle ownership
   * transfers to this client until `stop()` is called.
   */
  async start(audio: { stream: MediaStream; cleanup: () => void }): Promise<void> {
    this.cb.onStatus('connecting')

    this.stream = audio.stream
    this.streamCleanup = audio.cleanup

    const pc = new RTCPeerConnection()
    this.pc = pc

    const [track] = this.stream.getAudioTracks()
    pc.addTransceiver(track, { direction: 'sendrecv', streams: [this.stream] })

    // Inbound assistant audio is ignored in transcription mode but the SDP
    // direction stays sendrecv so flipping to reply mode later needs no
    // re-negotiation.
    pc.ontrack = () => {
      /* no-op */
    }

    const dc = pc.createDataChannel('oai-events', { ordered: true })
    this.dc = dc

    dc.onopen = () => this.cb.onStatus('connected')
    dc.onclose = () => this.cb.onStatus('closed')
    dc.onerror = (e) => this.cb.onStatus('error', String(e))
    dc.onmessage = (ev) => this.handleServerEvent(ev.data)

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.cb.onStatus('error', `peer connection ${pc.connectionState}`)
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)
    const offerSdp = pc.localDescription?.sdp ?? offer.sdp ?? ''

    const result = await window.api.exchangeSdp({
      offerSdp,
      sessionJson: this.buildSessionJson()
    })
    if (!result.ok) {
      this.cb.onStatus('error', result.error)
      await this.stop()
      throw new Error(result.error)
    }

    await pc.setRemoteDescription({ type: 'answer', sdp: result.answerSdp })
  }

  async stop(): Promise<void> {
    this.dc?.close()
    this.dc = null
    this.pc?.close()
    this.pc = null
    this.streamCleanup?.()
    this.streamCleanup = null
    this.stream = null
    this.cb.onStatus('closed')
  }

  /** Mirrors EventCodec.initialSessionConfigJson() in RealtimeRG. */
  private buildSessionJson(): string {
    const autoCreate = this.opts.autoCreateResponse ?? false
    const transcription: Record<string, string> = { model: TRANSCRIPTION_MODEL }
    // Soft hint — empty string means auto-detect; same convention as
    // whisper-anywhere/src/main/realtimeClient.ts.
    if (this.opts.language) transcription.language = this.opts.language

    const session = {
      type: 'realtime',
      model: REALTIME_MODEL,
      output_modalities: ['audio'],
      instructions: this.opts.instructions,
      audio: {
        input: {
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: autoCreate,
            interrupt_response: true
          },
          transcription
        },
        output: {
          voice: VOICE
        }
      },
      reasoning: { effort: 'low' }
    }
    return JSON.stringify(session)
  }

  private handleServerEvent(raw: unknown): void {
    if (typeof raw !== 'string') return
    let event: { type?: string; [k: string]: unknown }
    try {
      event = JSON.parse(raw)
    } catch {
      return
    }
    this.cb.onEvent?.(event)

    const type = event.type
    if (type === 'conversation.item.input_audio_transcription.delta') {
      const itemId = String(event.item_id ?? '')
      const delta = String(event.delta ?? '')
      if (itemId && delta) this.cb.onUserTranscriptDelta(itemId, delta)
    } else if (type === 'conversation.item.input_audio_transcription.completed') {
      const itemId = String(event.item_id ?? '')
      const transcript = String(event.transcript ?? '')
      if (itemId) this.cb.onUserTranscriptCompleted(itemId, transcript)
    } else if (type === 'error') {
      const err = event.error as { message?: string } | undefined
      this.cb.onStatus('error', err?.message ?? 'unknown error')
    }
  }
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const check = (): void => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', check)
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check)
      resolve()
    }, 2000)
  })
}
