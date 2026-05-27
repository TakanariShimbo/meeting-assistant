export type AttachmentKind = 'text' | 'image' | 'pdf'

export interface AttachmentMeta {
  id: string
  filename: string
  kind: AttachmentKind
  mime: string
  /** Original (decoded) byte size for display. */
  byteSize: number
  addedAt: number
}

/** Payload shape sent over IPC when adding an attachment. */
export interface AttachmentInput {
  filename: string
  kind: AttachmentKind
  mime: string
  /** Text payload for kind='text', base64-encoded bytes for image/pdf. */
  payload: string
}

/** What the renderer can show in the list. */
export type AttachmentListResponse = AttachmentMeta[]

/** Per-file cap before we even send over IPC (large blobs choke the bridge). */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024 // 20 MB

/**
 * `accept` attribute for <input type="file">. We enumerate explicit MIMEs for
 * the gpt-5 image set and PDF, plus `text/*` and a handful of common text
 * extensions as a hint. Beyond those, anything that's not image/pdf is
 * treated as text at runtime (see guessKind in AttachmentsPanel) — we don't
 * try to enumerate every text-ish extension that exists.
 */
export const ACCEPT_ATTRIBUTES = [
  // text (hint; runtime falls back to text for anything non-binary anyway)
  'text/*',
  '.txt', '.md', '.csv', '.json', '.log', '.yaml', '.yml', '.tsv',
  '.html', '.htm', '.xml', '.css', '.js', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
  '.sh', '.toml', '.ini', '.env', '.sql',
  // image (gpt-5 vision supported set only)
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  // pdf
  '.pdf', 'application/pdf'
].join(',')

export const SUPPORTED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
])

export const SUPPORTED_IMAGE_EXTS = /\.(png|jpe?g|gif|webp)$/
