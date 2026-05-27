export const IPC = {
  SettingsGet: 'settings:get',
  SettingsSave: 'settings:save',
  RealtimeExchangeSdp: 'realtime:exchange-sdp',
  Analyze: 'analyze',
  LinuxAudioStatus: 'linux-audio:status',
  LinuxAudioSetup: 'linux-audio:setup',
  LinuxAudioTeardown: 'linux-audio:teardown',
  LinuxAudioSetCaptureDefault: 'linux-audio:set-capture-default',
  ClipboardWriteText: 'clipboard:write-text',
  AnalyzeProgress: 'analyze:progress',
  AttachmentList: 'attachment:list',
  AttachmentAdd: 'attachment:add',
  AttachmentRemove: 'attachment:remove',
  AttachmentClear: 'attachment:clear',
  Chat: 'chat',
  ChatProgress: 'chat:progress',
  ChatCancel: 'chat:cancel'
} as const
