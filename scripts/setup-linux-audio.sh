#!/usr/bin/env bash
# Create a virtual sink + capture source so Meeting Assistant can record system
# audio on Linux (PulseAudio / PipeWire).
#
# Why three modules?
#   1. module-null-sink         → virtual speaker apps can output to
#   2. module-remap-source      → exposes the sink's monitor as a *regular*
#                                  input device (Chromium hides raw monitors)
#   3. module-loopback          → also plays the audio out so you can still
#                                  hear it through your real speakers
#
# After running this script:
#   1. Open pavucontrol → "Playback" tab.
#   2. For each app you want captured (Zoom, browser, etc.), change its
#      output to "MeetingAssistant_Sink".
#   3. In Meeting Assistant settings, click "再読込" and pick
#      "MeetingAssistant_Capture" as the PC音声 device.
#
# Modules are unloaded by closing the audio server (logout / reboot). Persist
# by adding these lines to ~/.config/pulse/default.pa instead.

set -e

if ! command -v pactl >/dev/null 2>&1; then
  echo "pactl not found. Install pulseaudio-utils or pipewire-pulse." >&2
  exit 1
fi

# Clean up any previous load from this script (idempotent re-run).
echo "Unloading previous meeting_assistant modules (if any)…"
pactl list short modules | awk '/meeting_assistant/ {print $1}' | xargs -r -I{} pactl unload-module {}

echo "1/3 null sink: MeetingAssistant_Sink"
pactl load-module module-null-sink \
  sink_name=meeting_assistant \
  sink_properties=device.description=MeetingAssistant_Sink >/dev/null

echo "2/3 remap source: MeetingAssistant_Capture (the one to pick in the app)"
pactl load-module module-remap-source \
  source_name=meeting_assistant_capture \
  master=meeting_assistant.monitor \
  source_properties=device.description=MeetingAssistant_Capture >/dev/null

echo "3/3 loopback to default sink (so you still hear the audio)"
pactl load-module module-loopback \
  source=meeting_assistant.monitor \
  latency_msec=1 >/dev/null

cat <<EOF

✓ Done. Next:
  1. Open pavucontrol → "Playback" tab → route apps to MeetingAssistant_Sink
  2. In Meeting Assistant settings → "再読込" → pick "MeetingAssistant_Capture"
EOF
