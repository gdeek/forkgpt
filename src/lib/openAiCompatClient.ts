import type { ChatMessage } from './contextBuilder'
import type { ReasoningEffortValue } from '../types'

export interface OpenAiCompatStreamOptions {
  apiKey: string
  baseUrl: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  reasoningEffort?: ReasoningEffortValue
  onDelta: (delta: string) => void
  signal?: AbortSignal
  buildProviderPayload?: (effort?: ReasoningEffortValue) => Record<string, unknown> | undefined
}

const toCompatPart = (part: any): Record<string, unknown> | null => {
  if (!part || typeof part !== 'object') return { type: 'text', text: String(part ?? '') }
  if (part.type === 'text') return { type: 'text', text: String(part.text ?? '') }
  if (part.type === 'image_url') {
    const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url
    if (!url) return null
    return { type: 'image_url', image_url: { url: String(url) } }
  }
  return null
}

const toCompatMessage = (message: ChatMessage): Record<string, unknown> => {
  if (typeof message.content === 'string') {
    return { role: message.role, content: message.content }
  }
  const parts = message.content.map(toCompatPart).filter((x): x is Record<string, unknown> => !!x)
  if (parts.length === 0) return { role: message.role, content: '' }
  return { role: message.role, content: parts }
}

export const streamOpenAiCompat = async (opts: OpenAiCompatStreamOptions): Promise<void> => {
  const { apiKey, baseUrl, model, messages, temperature, maxTokens, reasoningEffort, onDelta, signal, buildProviderPayload } = opts

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(toCompatMessage),
    stream: true,
  }
  if (typeof temperature === 'number') payload.temperature = temperature
  if (typeof maxTokens === 'number') payload.max_tokens = maxTokens
  const providerPayload = buildProviderPayload?.(reasoningEffort)
  if (providerPayload) Object.assign(payload, providerPayload)

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Provider request failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let done = false
  let buffer = ''
  while (!done) {
    const { value, done: d } = await reader.read()
    done = d
    if (value) buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line || !line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json?.choices?.[0]?.delta
        if (typeof delta?.content === 'string') {
          onDelta(delta.content)
          continue
        }
        if (Array.isArray(delta?.content)) {
          for (const part of delta.content) {
            if (typeof part?.text === 'string') onDelta(part.text)
          }
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }
}
