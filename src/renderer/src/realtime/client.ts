import {
  REALTIME_MODEL,
  TRANSCRIPTION_MODEL,
  VOICE,
  type LanguageCode,
  type SessionMode
} from '@shared/types'

export interface RealtimeClientCallbacks {
  onStatus: (
    status: 'connecting' | 'connected' | 'paused' | 'closed' | 'error',
    detail?: string
  ) => void
  onUserTranscriptDelta: (itemId: string, delta: string) => void
  onUserTranscriptCompleted: (itemId: string, text: string) => void
  /** Inbound assistant transcript chunks (conversation mode). responseId is keyed per response. */
  onAssistantTranscriptDelta?: (responseId: string, delta: string) => void
  onAssistantTranscriptCompleted?: (responseId: string, text: string) => void
  /** Toggled true on first delta of a response, false on response.done. */
  onAssistantSpeakingChange?: (speaking: boolean) => void
  /** Inbound audio stream from the assistant — caller attaches to an <audio> element. */
  onRemoteAudio?: (stream: MediaStream) => void
  onEvent?: (event: unknown) => void
}

export interface RealtimeClientOptions {
  instructions: string
  /** ISO-639-1 hint for the transcription model. '' = auto-detect. */
  language: LanguageCode
  /** Initial session mode. `meeting` = transcription only; `conversation` = auto-replies. */
  sessionMode: SessionMode
}

/**
 * Browser-side WebRTC client for OpenAI's Realtime API.
 *
 * Mirrors RealtimeRG (host/transport/RtcTransport.kt + Signaling.kt +
 * host/protocol/EventCodec.kt + host/mode/SessionDriver.kt):
 *   - mic over `oai-mic` audio track, sendrecv transceiver
 *   - JSON events over `oai-events` ordered data channel
 *   - initial session config sent inline at SDP exchange time (multipart),
 *     so no follow-up `session.update` is needed for first-time config
 *   - server_vad with interrupt_response=true; create_response toggles
 *     between modes (false=meeting, true=conversation)
 *
 * Mid-session mode flips ride on `session.update`; `response.create` lets
 * the user force a reply in either mode.
 */
export class RealtimeClient {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private stream: MediaStream | null = null
  /** Stops mic/system tracks and tears down any AudioContext used for mixing. */
  private streamCleanup: (() => void) | null = null
  private currentMode: SessionMode

  constructor(
    private readonly cb: RealtimeClientCallbacks,
    private readonly opts: RealtimeClientOptions
  ) {
    this.currentMode = opts.sessionMode
  }

  async start(audio: { stream: MediaStream; cleanup: () => void }): Promise<void> {
    this.cb.onStatus('connecting')

    this.stream = audio.stream
    this.streamCleanup = audio.cleanup

    const pc = new RTCPeerConnection()
    this.pc = pc

    const [track] = this.stream.getAudioTracks()
    pc.addTransceiver(track, { direction: 'sendrecv', streams: [this.stream] })

    // Inbound audio is the assistant's voice in conversation mode. We hand
    // the MediaStream up to the caller so they can attach it to a hidden
    // <audio> element and (optionally) setSinkId() to bypass any virtual
    // sink that would feed the audio back into our own mic input.
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) this.cb.onRemoteAudio?.(stream)
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

  /**
   * Mute every outgoing audio track so the server VAD stops hearing speech
   * and no new transcripts are generated. The peer connection + data channel
   * stay open, so `resume()` is instant (no SDP re-negotiation, no new
   * session config). Encoded silence on the wire is tiny — Opus collapses
   * to a few bytes per frame for muted input. With server_vad, the official
   * docs guarantee silence isn't tokenized — pause is effectively free.
   */
  pause(): void {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = false))
    this.cb.onStatus('paused')
  }

  resume(): void {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = true))
    this.cb.onStatus('connected')
  }

  /**
   * Switch the session's turn-detection behavior mid-flight. Sends
   * `session.update` with the new `create_response` value while keeping
   * server_vad + interrupt_response intact. No-op if the data channel
   * isn't open yet.
   */
  setSessionMode(mode: SessionMode): void {
    if (this.currentMode === mode) return
    this.currentMode = mode
    if (this.dc?.readyState !== 'open') return
    const update = {
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: {
          input: {
            turn_detection: this.turnDetectionJson(mode)
          }
        }
      }
    }
    this.dc.send(JSON.stringify(update))
  }

  /**
   * Manually trigger an assistant response. Works in both modes — in
   * meeting mode this is the only way to get a reply; in conversation
   * mode it lets the user force a response even when VAD hasn't fired
   * (e.g. when the user types-paused without a clean silence cue).
   */
  requestResponse(): void {
    if (this.dc?.readyState !== 'open') return
    this.dc.send(JSON.stringify({ type: 'response.create' }))
  }

  /** Mirrors EventCodec.initialSessionConfigJson() in RealtimeRG. */
  private buildSessionJson(): string {
    const transcription: Record<string, string> = { model: TRANSCRIPTION_MODEL }
    // Soft hint — empty string means auto-detect.
    if (this.opts.language) transcription.language = this.opts.language

    const session = {
      type: 'realtime',
      model: REALTIME_MODEL,
      output_modalities: ['audio'],
      instructions: this.opts.instructions,
      audio: {
        input: {
          turn_detection: this.turnDetectionJson(this.currentMode),
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

  private turnDetectionJson(mode: SessionMode): {
    type: 'server_vad'
    threshold: number
    prefix_padding_ms: number
    silence_duration_ms: number
    create_response: boolean
    interrupt_response: boolean
  } {
    return {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
      create_response: mode === 'conversation',
      interrupt_response: true
    }
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
    } else if (
      type === 'response.audio_transcript.delta' ||
      type === 'response.output_audio_transcript.delta'
    ) {
      const responseId = String(event.response_id ?? '')
      const delta = String(event.delta ?? '')
      if (responseId && delta) this.cb.onAssistantTranscriptDelta?.(responseId, delta)
      this.cb.onAssistantSpeakingChange?.(true)
    } else if (
      type === 'response.audio_transcript.done' ||
      type === 'response.output_audio_transcript.done'
    ) {
      const responseId = String(event.response_id ?? '')
      const text = String(event.transcript ?? event.text ?? '')
      if (responseId) this.cb.onAssistantTranscriptCompleted?.(responseId, text)
    } else if (type === 'response.done') {
      this.cb.onAssistantSpeakingChange?.(false)
    } else if (type === 'input_audio_buffer.speech_started') {
      // User started talking — server will auto-interrupt the assistant
      // (interrupt_response=true). Drop the speaking flag immediately so
      // the UI reflects it without waiting for response.done.
      this.cb.onAssistantSpeakingChange?.(false)
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
