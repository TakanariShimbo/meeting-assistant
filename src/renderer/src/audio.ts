import type { AudioMode } from '@shared/types'

export interface AudioCaptureOpts {
  mode: AudioMode
  micDeviceId: string | null
  systemDeviceId: string | null
}

export interface AudioCaptureResult {
  stream: MediaStream
  /** Stops every track and closes the AudioContext (if any). */
  cleanup: () => void
}

/**
 * Constraints for an actual microphone: keep AEC/NS/AGC on so our voice stays
 * clean even when the counterparty's audio is leaking from the speakers.
 */
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}

/**
 * Constraints for a loopback / monitor source: we're capturing the system's
 * own output, so AEC/NS/AGC would distort it. Mono to keep WebRTC bandwidth
 * low and match the mic side.
 */
const SYSTEM_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
}

async function getMicStream(deviceId: string | null): Promise<MediaStream> {
  const audio: MediaTrackConstraints = { ...MIC_CONSTRAINTS }
  if (deviceId) audio.deviceId = { exact: deviceId }
  return navigator.mediaDevices.getUserMedia({ audio })
}

async function getSystemStream(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { ...SYSTEM_CONSTRAINTS, deviceId: { exact: deviceId } }
  })
}

export async function buildAudioStream(opts: AudioCaptureOpts): Promise<AudioCaptureResult> {
  if (opts.mode === 'mic') {
    const stream = await getMicStream(opts.micDeviceId)
    return {
      stream,
      cleanup: () => stream.getTracks().forEach((t) => t.stop())
    }
  }

  if (opts.mode === 'system') {
    if (!opts.systemDeviceId) {
      throw new Error('PC音声デバイスが設定されていません（設定で選択してください）')
    }
    const stream = await getSystemStream(opts.systemDeviceId)
    return {
      stream,
      cleanup: () => stream.getTracks().forEach((t) => t.stop())
    }
  }

  // mixed
  if (!opts.systemDeviceId) {
    throw new Error('PC音声デバイスが設定されていません（設定で選択してください）')
  }
  const [mic, system] = await Promise.all([
    getMicStream(opts.micDeviceId),
    getSystemStream(opts.systemDeviceId)
  ])
  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  ctx.createMediaStreamSource(mic).connect(dest)
  ctx.createMediaStreamSource(system).connect(dest)
  return {
    stream: dest.stream,
    cleanup: () => {
      mic.getTracks().forEach((t) => t.stop())
      system.getTracks().forEach((t) => t.stop())
      dest.stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
  }
}

/**
 * Returns all audioinput devices. The first call also triggers a permission
 * prompt (via a throwaway getUserMedia) so the returned labels aren't empty.
 */
export async function enumerateAudioInputs(): Promise<MediaDeviceInfo[]> {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
    probe.getTracks().forEach((t) => t.stop())
  } catch {
    // permission denied — proceed; labels may be empty.
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}
