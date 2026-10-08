export type Access = 'free' | 'plan' | 'payg' | 'family' | 'auto' | 'custom' | 'local' | 'laptop'

export interface ChatModel {
  id: string
  name: string
  access: Access
  context?: number
  vision: boolean
  tools: boolean
  reasoning: boolean
  /** false when the account cannot use it right now (e.g. PAYG model without balance); shown but not selectable */
  available: boolean
  reason?: string
  /** custom providers: the name shown as the group header */
  provider?: string
}

export interface Attachment {
  kind: 'image' | 'file'
  name: string
  mime: string
  size: number
  /** Images are sent inline (vision models). */
  dataUrl?: string
  /** Generated pictures live in a file on this phone (a chat file would be far too big to keep in the database). */
  uri?: string
  /** Documents are uploaded once; the server retrieves the relevant parts for every question. */
  fileId?: string
  status?: 'uploading' | 'processing' | 'ready' | 'failed'
  /** when this file started uploading/processing (drives the elapsed-time hint) */
  startedAt?: number
}

/** A document that belongs to a project: uploaded once, used by every chat in the project. */
export interface ProjectFile { fileId: string; name: string; mime: string; size: number; status?: 'uploading' | 'processing' | 'ready' | 'failed' }

export interface Source { title: string; url: string }

export interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** what the bubble shows when `content` is a long generated prompt (writing tools, OCR) */
  shown?: string
  reasoning?: string
  attachments?: Attachment[]
  sources?: Source[]
  searched?: string[]
  /** a Deep research report: how many searches ran and pages were read */
  research?: { searches: number; pages: number }
  model?: string
  createdAt: number
  ms?: number
  error?: string
  /** answered by a model on the user's laptop (Local mode) */
  local?: { deviceId: string; deviceName: string; model: string; modelName: string; runtime: string }
  /** an image made in chat: how it was asked (the picture itself is the message's attachment) */
  image?: { prompt: string; modelId: string; model: string; size: string; left?: string }
  /** earlier answers to the same question (regenerate); local to this device */
  variants?: Msg[]
}

export interface Conv {
  id: string
  title: string
  model: string
  system: string
  web: boolean
  createdAt: number
  updatedAt: number
  pinned?: boolean
  archived?: boolean
  /** `project` and `memory` records live next to chats (same store, same account sync) but are never listed as chats */
  kind?: 'project' | 'memory'
  /** chat: belongs to this project */
  projectId?: string
  /** project: shared documents */
  files?: ProjectFile[]
  /** memory record: short facts the user asked to remember; `system` holds the custom instructions */
  memory?: string[]
  useMemory?: boolean
  /** the title was written by the AI (or renamed by the user): do not generate it again */
  titled?: boolean
  /** Local mode chat: stays on this device, never synced to the account */
  local?: boolean
  /** temporary chat: never saved to this device or the account */
  temp?: boolean
  /** change time the server has (account sync) */
  syncedAt?: number
  messages: Msg[]
}

export type ChatErrorKind = 'auth' | 'privacy' | 'balance' | 'plan' | 'capacity' | 'too_large' | 'unavailable' | 'rejected' | 'network' | 'aborted' | 'files' | 'quota' | 'badkey'

export class ChatError extends Error {
  kind: ChatErrorKind
  status?: number
  retryAfterSeconds?: number
  constructor(kind: ChatErrorKind, opts: { status?: number; retryAfterSeconds?: number } = {}) {
    super(kind)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'ChatError'
    this.kind = kind
    this.status = opts.status
    this.retryAfterSeconds = opts.retryAfterSeconds
  }
}
