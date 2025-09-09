import type { ChatMessage } from './contextBuilder'

export interface StreamOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

// Minimal client for OpenAI Chat Completions streaming
export const streamChatCompletion = async (opts: StreamOptions): Promise<void> => {
  const { apiKey, model, messages, temperature, maxTokens, reasoningEffort, onDelta, signal } = opts
  const payload: Record<string, any> = {
    model,
    messages,
    stream: true,
  }
  if (typeof temperature === 'number') payload.temperature = temperature
  if (typeof maxTokens === 'number') {
    if (model === 'gpt-5' || model.startsWith('o3')) payload.max_completion_tokens = maxTokens
    else payload.max_tokens = maxTokens
  }
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `OpenAI request failed: ${res.status}`)
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
      if (!line) continue
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length) onDelta(delta)
      } catch {
        // ignore malformed chunk
      }
    }
  }
}
