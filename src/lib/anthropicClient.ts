import type { ChatMessage } from './contextBuilder'
import type { ReasoningEffortValue } from '../types'

export interface StreamOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  reasoningEffort?: ReasoningEffortValue
  enableWebSearch?: boolean
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'image'; source: { type: 'url'; url: string } }

type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicContent[] }

const parseDataUrl = (dataUrl: string): { mime: string; base64: string } | null => {
  try {
    const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
    if (!m) return null
    return { mime: m[1], base64: m[2] }
  } catch {
    return null
  }
}

const toAnthropicPayload = (messages: ChatMessage[]): { system?: string; messages: AnthropicMessage[] } => {
  let system: string | undefined
  const out: AnthropicMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      if (typeof m.content === 'string') system = m.content
      else {
        const text = (m.content as any[]).map(p => (p?.type === 'text' ? p.text : '')).join('\n').trim()
        if (text) system = text
      }
      continue
    }
    const role = m.role
    const parts: AnthropicContent[] = []
    if (typeof m.content === 'string') {
      parts.push({ type: 'text', text: m.content })
    } else {
      for (const p of m.content) {
        if (p?.type === 'text') parts.push({ type: 'text', text: p.text })
        else if (p?.type === 'image_url') {
          const url = typeof (p as any).image_url === 'string' ? (p as any).image_url : (p as any).image_url?.url
          if (typeof url === 'string') {
            if (url.startsWith('data:')) {
              const parsed = parseDataUrl(url)
              if (parsed) parts.push({ type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.base64 } })
            } else if (url.startsWith('http')) {
              parts.push({ type: 'image', source: { type: 'url', url } })
            }
          }
        }
      }
    }
    out.push({ role, content: parts })
  }
  return { system, messages: out }
}

const mapReasoningBudget = (effort?: ReasoningEffortValue): number | undefined => {
  if (!effort) return undefined
  if (effort === 'disabled' || effort === 'none') return undefined
  if (effort === 'enabled') return 4096
  if (effort === 'minimal' || effort === 'low') return 1024
  if (effort === 'medium') return 2048
  if (effort === 'high') return 4096
  if (effort === 'xhigh') return 8192
  return undefined
}

const anthropicBase = (): string => (import.meta && (import.meta as any).env && (import.meta as any).env.DEV ? '/anthropic' : 'https://api.anthropic.com')

export const streamResponse = async (opts: StreamOptions): Promise<void> => {
  const { apiKey, model, messages, temperature, maxTokens, reasoningEffort, enableWebSearch, onDelta, signal } = opts
  const { system, messages: anthropicMessages } = toAnthropicPayload(messages)
  const requestedBudget = mapReasoningBudget(reasoningEffort)
  const outputMaxTokensBase = typeof maxTokens === 'number' ? maxTokens : 8000
  const outputMaxTokens = typeof requestedBudget === 'number' && outputMaxTokensBase <= requestedBudget
    ? requestedBudget + 1
    : outputMaxTokensBase

  const body: Record<string, any> = {
    model,
    messages: anthropicMessages,
    stream: true,
    max_tokens: outputMaxTokens,
  }
  if (system) body.system = system
  if (typeof temperature === 'number') body.temperature = temperature
  if (typeof requestedBudget === 'number' && requestedBudget > 0) {
    const maxAllowed = Math.max(0, outputMaxTokens - 1)
    const budgetTokens = Math.min(requestedBudget, maxAllowed)
    if (budgetTokens >= 1024) {
      body.thinking = { type: 'enabled', budget_tokens: budgetTokens }
    }
  }
  if (enableWebSearch) {
    // anthropic web search requires versioned tool type and a name
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }]
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'Authorization': `Bearer ${apiKey}`,
    'anthropic-version': '2023-06-01',
  }
  // allow browser/dev requests explicitly when hitting anthropic from the browser via proxy
  if ((import.meta as any)?.env?.DEV) headers['anthropic-dangerous-direct-browser-access'] = 'true'

  const res = await fetch(`${anthropicBase()}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Anthropic request failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let done = false
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
      if (!data || data === '[DONE]') continue
      try {
        const evt = JSON.parse(data)
        if (evt?.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
          onDelta(evt.delta.text)
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }
}
