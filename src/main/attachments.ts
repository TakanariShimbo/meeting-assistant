import { randomUUID } from 'node:crypto'
import type {
  AttachmentInput,
  AttachmentKind,
  AttachmentMeta
} from '@shared/attachments'

/**
 * Full attachment record with payload. Kept in main-process memory only so
 * the renderer never holds large blobs in JS heap, and the IPC bridge only
 * carries lightweight metadata (or the payload once at add time).
 */
interface Attachment extends AttachmentMeta {
  /** Plain text for kind='text', base64 for image/pdf. */
  payload: string
}

const store = new Map<string, Attachment>()

function decodedByteSize(input: AttachmentInput): number {
  if (input.kind === 'text') return Buffer.byteLength(input.payload, 'utf8')
  // base64 → bytes: take padding into account
  const len = input.payload.length
  const padding = (input.payload.endsWith('==') ? 2 : input.payload.endsWith('=') ? 1 : 0)
  return Math.floor((len * 3) / 4) - padding
}

export function addAttachment(input: AttachmentInput): AttachmentMeta {
  const id = randomUUID()
  const att: Attachment = {
    id,
    filename: input.filename,
    kind: input.kind,
    mime: input.mime,
    byteSize: decodedByteSize(input),
    addedAt: Date.now(),
    payload: input.payload
  }
  store.set(id, att)
  return toMeta(att)
}

export function removeAttachment(id: string): void {
  store.delete(id)
}

export function clearAttachments(): void {
  store.clear()
}

export function listAttachments(): AttachmentMeta[] {
  return Array.from(store.values())
    .sort((a, b) => a.addedAt - b.addedAt)
    .map(toMeta)
}

/** For analyzer: full records including payload, in insertion order. */
export function getAttachmentsForAnalyzer(): Attachment[] {
  return Array.from(store.values()).sort((a, b) => a.addedAt - b.addedAt)
}

function toMeta(a: Attachment): AttachmentMeta {
  return {
    id: a.id,
    filename: a.filename,
    kind: a.kind,
    mime: a.mime,
    byteSize: a.byteSize,
    addedAt: a.addedAt
  }
}

export type { AttachmentKind }
