import type { ChatMessage } from './contextBuilder'
import type { ReasoningEffortValue } from '../types'
import { streamOpenAiCompat } from './openAiCompatClient'

export interface StreamOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  reasoningEffort?: ReasoningEffortValue
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

const geminiBase = (): string => ((import.meta as any)?.env?.DEV ? '/gemini/v1beta/openai' : 'https://generativelanguage.googleapis.com/v1beta/openai')

const mapReasoningEffort = (model: string, effort?: ReasoningEffortValue): 'minimal' | 'low' | 'medium' | 'high' | undefined => {
  if (!effort) return undefined
  if (model === 'gemini-3.6-flash' && effort === 'minimal') return 'minimal'
  if (effort === 'minimal') return 'low'
  if (effort === 'medium') return 'medium'
  if (effort === 'high' || effort === 'xhigh') return 'high'
  if (effort === 'low') return 'low'
  return undefined
}

export const streamResponse = async (opts: StreamOptions): Promise<void> => {
  const { apiKey, model, messages, temperature, maxTokens, reasoningEffort, onDelta, signal } = opts
  await streamOpenAiCompat({
    apiKey,
    baseUrl: geminiBase(),
    model,
    messages,
    temperature,
    maxTokens,
    reasoningEffort,
    onDelta,
    signal,
    buildProviderPayload: (effort) => {
      const mapped = mapReasoningEffort(model, effort)
      return mapped ? { reasoning_effort: mapped } : undefined
    },
  })
}
