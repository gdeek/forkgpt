import type { ChatMessage } from './contextBuilder'
import type { ReasoningEffortValue } from '../types'
import { streamOpenAiCompat } from './openAiCompatClient'
import { buildBasetenProviderPayload } from './basetenPayload'

export { buildBasetenProviderPayload } from './basetenPayload'

export interface StreamOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  reasoningEffort?: ReasoningEffortValue
  onDelta: (delta: string) => void
  onReasoningDelta?: (delta: string) => void
  signal?: AbortSignal
}

const basetenBase = (): string => ((import.meta as any)?.env?.DEV ? '/baseten/v1' : 'https://inference.baseten.co/v1')

export const streamResponse = async (opts: StreamOptions): Promise<void> => {
  await streamOpenAiCompat({
    ...opts,
    baseUrl: basetenBase(),
    preserveReasoningContent: true,
    buildProviderPayload: effort => buildBasetenProviderPayload(opts.model, effort),
  })
}
