export type Role = 'user' | 'assistant' | 'system'

export interface Session {
  readonly id: string
  title: string
  systemPrompt?: string
  createdAt: number
  lastActiveAt: number
  temperature?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
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
}

export interface Settings {
  apiKey?: string
  defaultModel?: string
  apiKeyEncrypted?: string
}

export interface UIState {
  activeSessionId?: string
  activeReplyViewerAnchorId?: string
  replyViewerWidth?: number
}
