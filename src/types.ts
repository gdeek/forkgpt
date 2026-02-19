export type Role = 'user' | 'assistant' | 'system'
export type ReasoningEffortValue = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'none' | 'enabled' | 'disabled'

export interface Session {
  readonly id: string
  title: string
  systemPrompt?: string
  createdAt: number
  lastActiveAt: number
  temperature?: number
  reasoningEffort?: ReasoningEffortValue
  mainTurnsLimit?: number
  maxTokens?: number
}

export interface Message {
  readonly id: string
  readonly sessionId: string
  role: Role
  content: string
  model?: string
  parentId?: string
  anchorMessageId?: string
  includeInContext: boolean
  createdAt: number
  attachments?: AttachmentMeta[]
}

export interface Settings {
  apiKey?: string
  anthropicApiKey?: string
  geminiApiKey?: string
  moonshotApiKey?: string
  defaultModel?: string
  apiKeyEncrypted?: string
  anthropicApiKeyEncrypted?: string
  geminiApiKeyEncrypted?: string
  moonshotApiKeyEncrypted?: string
}

export interface UIState {
  activeSessionId?: string
  activeReplyViewerAnchorId?: string
  replyViewerWidth?: number
  theme?: 'light' | 'dark'
}

export type AttachmentKind = 'image' | 'pdf' | 'text' | 'other'

export interface AttachmentMeta {
  readonly id: string
  readonly name: string
  readonly size: number
  readonly mime: string
  readonly kind: AttachmentKind
  readonly blobKey: string
  previewDataUrl?: string
}
