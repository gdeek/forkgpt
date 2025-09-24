import type { ChatMessage } from './contextBuilder'
import { supportsWebSearch } from './models'

export interface StreamOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  enableWebSearch?: boolean
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

export const streamResponse = async (opts: StreamOptions): Promise<void> => {
  const { apiKey, model, messages, temperature, maxTokens, reasoningEffort, enableWebSearch, onDelta, signal } = opts

  // Convert ChatMessage[] to Responses API `input` format.
  // Map old Chat Completions parts to Responses input types.
  const toResponsesPart = (part: any, role: 'system' | 'user' | 'assistant') => {
    const textPart = (t: string, kind: 'input_text' | 'output_text') => ({ type: kind, text: t })
    if (!part || typeof part !== 'object') {
      return role === 'assistant' ? textPart(String(part ?? ''), 'output_text') : textPart(String(part ?? ''), 'input_text')
    }
    if (part.type === 'text') return role === 'assistant' ? textPart(part.text, 'output_text') : textPart(part.text, 'input_text')
    if (part.type === 'image_url') {
      // Images are only valid on the input side
      if (role === 'assistant') return textPart('[image omitted]', 'output_text')
      return { type: 'input_image', image_url: part.image_url }
    }
    if (part.type === 'input_text' || part.type === 'input_image' || part.type === 'output_text') return part
    // Fallback to text
    return role === 'assistant' ? textPart(JSON.stringify(part), 'output_text') : textPart(JSON.stringify(part), 'input_text')
  }
  const input = messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content.map(p => toResponsesPart(p, m.role))
      : [toResponsesPart({ type: 'text', text: String(m.content) }, m.role)]
  }))

  const payload: Record<string, any> = {
    model,
    input,
    stream: true,
  }
  if (typeof temperature === 'number') payload.temperature = temperature
  if (typeof maxTokens === 'number') payload.max_output_tokens = maxTokens
  if (reasoningEffort && (model === 'gpt-5' || model.startsWith('o3') || model.startsWith('o1'))) {
    payload.reasoning = { effort: reasoningEffort }
  }
  if (enableWebSearch && supportsWebSearch(model)) {
    payload.tools = [{ type: 'web_search' }]
    // tool_choice defaults to 'auto'
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
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
        // Responses API streaming events
        const t = json.type as string | undefined
        if (t === 'response.output_text.delta' && typeof json.delta === 'string') {
          onDelta(json.delta)
        } else if (t === 'response.delta' && typeof json.delta === 'string') {
          onDelta(json.delta)
        } else if (t === 'message.delta' && typeof json.delta === 'string') {
          onDelta(json.delta)
        }
        // Ignore other event types (tool calls, done, etc.)
      } catch {
        // ignore malformed chunk
      }
    }
  }
}
