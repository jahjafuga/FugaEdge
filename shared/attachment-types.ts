export interface AttachmentRecord {
  id: number
  trade_id: number
  filename: string         // on-disk basename; safe to use in attachment://… URLs
  original_name: string
  mime_type: string
  size_bytes: number
  created_at: string
}

export interface AddAttachmentFile {
  original_name: string
  mime_type: string
  /** Raw image bytes. Renderer fills this via File.arrayBuffer() → Uint8Array. */
  data: Uint8Array
}

export interface AddAttachmentsInput {
  trade_id: number
  files: AddAttachmentFile[]
}

export interface AddAttachmentsResult {
  added: AttachmentRecord[]
  rejected: { name: string; reason: string }[]
}
