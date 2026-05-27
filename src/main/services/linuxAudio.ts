import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AudioSetupStatus } from '@shared/types'
import {
  CAPTURE_DESCRIPTION,
  CAPTURE_SOURCE_NAME,
  SINK_DESCRIPTION,
  SINK_NAME
} from '../constants'

const execFileP = promisify(execFile)

async function pactl(...args: string[]): Promise<string> {
  const { stdout } = await execFileP('pactl', args)
  return stdout
}

async function pactlSilent(...args: string[]): Promise<void> {
  try {
    await execFileP('pactl', args)
  } catch {
    /* swallowed — caller will refetch status */
  }
}

/**
 * The user's "real" default sink (their actual speakers / headphones), kept
 * across setup/teardown cycles so:
 *   1. teardown can restore the default if we still own it
 *   2. setCaptureAsDefault(false) can switch back
 *   3. the loopback module always plays into the real speakers and never
 *      feeds back into our own virtual sink — that's the bug fix.
 */
let savedRealSink: string | null = null

async function readDefaultSink(): Promise<string | null> {
  try {
    return (await pactl('get-default-sink')).trim() || null
  } catch {
    try {
      const info = await pactl('info')
      const m = info.match(/Default Sink:\s*(.+)/)
      return m ? m[1].trim() : null
    } catch {
      return null
    }
  }
}

export async function getAudioStatus(): Promise<AudioSetupStatus> {
  try {
    await execFileP('pactl', ['--version'])
  } catch {
    return {
      pactlAvailable: false,
      ready: false,
      sinkLoaded: false,
      captureSourceLoaded: false,
      loopbackLoaded: false,
      defaultSink: null,
      isCapturingDefault: false
    }
  }

  const modulesRaw = await pactl('list', 'short', 'modules').catch(() => '')
  const sinkLoaded = new RegExp(`module-null-sink.*sink_name=${SINK_NAME}\\b`).test(modulesRaw)
  const captureSourceLoaded = new RegExp(
    `module-remap-source.*source_name=${CAPTURE_SOURCE_NAME}\\b`
  ).test(modulesRaw)
  const loopbackLoaded = new RegExp(`module-loopback.*source=${SINK_NAME}\\.monitor\\b`).test(
    modulesRaw
  )

  const defaultSink = await readDefaultSink()

  // Opportunistically remember the real sink any time we see it. This keeps
  // savedRealSink fresh if the user changes their hardware default in the OS.
  if (defaultSink && defaultSink !== SINK_NAME) savedRealSink = defaultSink

  return {
    pactlAvailable: true,
    ready: sinkLoaded && captureSourceLoaded,
    sinkLoaded,
    captureSourceLoaded,
    loopbackLoaded,
    defaultSink,
    isCapturingDefault: defaultSink === SINK_NAME
  }
}

/**
 * Loads (or reloads) the three PulseAudio modules that make system audio
 * capture work. Idempotent — any previously loaded `meeting_assistant*`
 * modules are unloaded first.
 *
 * The loopback module is given an EXPLICIT `sink=` pointing at the real
 * speakers. Without that it follows the default sink — and once we move the
 * default sink to our own virtual sink (the "全アプリ自動キャプチャ" toggle),
 * the loopback would feed its own output back into its input, an infinite
 * audio loop. Pinning the sink prevents that.
 */
export async function setupVirtualSink(): Promise<void> {
  await teardownVirtualSink()

  // Refresh savedRealSink from the current default if possible.
  const current = await readDefaultSink()
  if (current && current !== SINK_NAME) savedRealSink = current

  await pactlSilent(
    'load-module',
    'module-null-sink',
    `sink_name=${SINK_NAME}`,
    `sink_properties=device.description=${SINK_DESCRIPTION}`
  )
  await pactlSilent(
    'load-module',
    'module-remap-source',
    `source_name=${CAPTURE_SOURCE_NAME}`,
    `master=${SINK_NAME}.monitor`,
    `source_properties=device.description=${CAPTURE_DESCRIPTION}`
  )

  const loopbackArgs = [
    'load-module',
    'module-loopback',
    `source=${SINK_NAME}.monitor`,
    'latency_msec=1'
  ]
  if (savedRealSink) loopbackArgs.push(`sink=${savedRealSink}`)
  // If we have no idea what the real sink is, skip the loopback rather than
  // load a self-referential one. User loses passthrough but capture still works.
  if (savedRealSink) await pactlSilent(...loopbackArgs)
}

export async function teardownVirtualSink(): Promise<void> {
  // If we currently own the default sink, restore the real one first so the
  // system isn't left without a default after unload.
  const defaultSink = await readDefaultSink()
  if (defaultSink === SINK_NAME && savedRealSink) {
    await pactlSilent('set-default-sink', savedRealSink)
  }

  const modulesRaw = await pactl('list', 'short', 'modules').catch(() => '')
  const ids: string[] = []
  for (const line of modulesRaw.split('\n')) {
    if (!line.includes(SINK_NAME)) continue
    const id = line.split(/\s+/)[0]
    if (id) ids.push(id)
  }
  for (const id of ids) {
    await pactlSilent('unload-module', id)
  }
}

export async function setCaptureAsDefault(enable: boolean): Promise<void> {
  if (enable) {
    const current = await readDefaultSink()
    if (current && current !== SINK_NAME) savedRealSink = current
    await pactlSilent('set-default-sink', SINK_NAME)
  } else if (savedRealSink) {
    await pactlSilent('set-default-sink', savedRealSink)
  }
}
