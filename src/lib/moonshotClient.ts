import type { ChatMessage } from './contextBuilder'
import type { ReasoningEffortValue } from '../types'
import { streamOpenAiCompat } from './openAiCompatClient'

export interface StreamOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  reasoningEffort?: ReasoningEffortValue
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

const moonshotBase = (): string => ((import.meta as any)?.env?.DEV ? '/moonshot/v1' : 'https://api.moonshot.ai/v1')

const mapThinkingType = (effort?: ReasoningEffortValue): 'enabled' | 'disabled' => {
  if (effort === 'disabled' || effort === 'none') return 'disabled'
  return 'enabled'
}

export const streamResponse = async (opts: StreamOptions): Promise<void> => {
  const { apiKey, model, messages, maxTokens, reasoningEffort, onDelta, signal } = opts
  await streamOpenAiCompat({
    apiKey,
    baseUrl: moonshotBase(),
    model,
    messages,
    maxTokens,
    reasoningEffort,
    onDelta,
    signal,
    buildProviderPayload: (effort) => ({ thinking: { type: mapThinkingType(effort) } }),
  })
}
