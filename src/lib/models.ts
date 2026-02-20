import type { ReasoningEffortValue } from '../types'

export type ModelProvider = 'openai' | 'anthropic' | 'gemini' | 'moonshot'

export type UiModelId =
  | 'gpt-5.2'
  | 'gpt-5.2-codex'
  | 'o3'
  | 'claude-opus-4.6'
  | 'claude-sonnet-4.6'
  | 'gemini-3.1-pro-preview'
  | 'kimi-k2.5'

type ModelConfig = {
  id: UiModelId
  label: string
  apiModel: string
  provider: ModelProvider
  reasoningOptions: ReasoningEffortValue[]
  defaultReasoning: ReasoningEffortValue
  temperature: boolean
  images: boolean
  webSearch: boolean
}

const MODEL_CATALOG: ModelConfig[] = [
  {
    id: 'gpt-5.2',
    label: 'gpt-5.2',
    apiModel: 'gpt-5.2',
    provider: 'openai',
    reasoningOptions: ['medium', 'high', 'xhigh'],
    defaultReasoning: 'medium',
    temperature: false,
    images: true,
    webSearch: true,
  },
  {
    id: 'gpt-5.2-codex',
    label: 'gpt-5.2-codex',
    apiModel: 'gpt-5.2-codex',
    provider: 'openai',
    reasoningOptions: ['medium', 'high', 'xhigh'],
    defaultReasoning: 'medium',
    temperature: false,
    images: false,
    webSearch: false,
  },
  {
    id: 'o3',
    label: 'o3',
    apiModel: 'o3',
    provider: 'openai',
    reasoningOptions: ['low', 'medium', 'high'],
    defaultReasoning: 'medium',
    temperature: false,
    images: true,
    webSearch: true,
  },
  {
    id: 'claude-opus-4.6',
    label: 'claude-opus-4.6',
    apiModel: 'claude-opus-4-6',
    provider: 'anthropic',
    reasoningOptions: ['medium', 'high', 'xhigh'],
    defaultReasoning: 'medium',
    temperature: true,
    images: true,
    webSearch: true,
  },
  {
    id: 'claude-sonnet-4.6',
    label: 'claude-sonnet-4.6',
    apiModel: 'claude-sonnet-4-6',
    provider: 'anthropic',
    reasoningOptions: ['medium', 'high', 'xhigh'],
    defaultReasoning: 'medium',
    temperature: true,
    images: true,
    webSearch: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'gemini-3.1-pro-preview',
    apiModel: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    reasoningOptions: ['low', 'medium', 'high'],
    defaultReasoning: 'high',
    temperature: true,
    images: false,
    webSearch: false,
  },
  {
    id: 'kimi-k2.5',
    label: 'kimi-k2.5',
    apiModel: 'kimi-k2.5',
    provider: 'moonshot',
    reasoningOptions: ['enabled', 'disabled'],
    defaultReasoning: 'enabled',
    temperature: false,
    images: false,
    webSearch: false,
  },
]

export const UI_MODELS: { id: UiModelId; label: string }[] = MODEL_CATALOG.map(({ id, label }) => ({ id, label }))

const normalizeReasoning = (effort?: string): ReasoningEffortValue | undefined => {
  if (!effort) return undefined
  if (effort === 'x-high' || effort === 'x_high') return 'xhigh'
  if (effort === 'on') return 'enabled'
  if (effort === 'off') return 'disabled'
  return effort as ReasoningEffortValue
}

const configFor = (model: string): ModelConfig | undefined => {
  const direct = MODEL_CATALOG.find(m => m.id === model || m.apiModel === model)
  if (direct) return direct

  if (model.startsWith('claude-opus-4-6')) return MODEL_CATALOG.find(m => m.id === 'claude-opus-4.6')
  if (model.startsWith('claude-sonnet-4-6')) return MODEL_CATALOG.find(m => m.id === 'claude-sonnet-4.6')
  if (model.startsWith('gpt-5.2-codex')) return MODEL_CATALOG.find(m => m.id === 'gpt-5.2-codex')
  if (model.startsWith('gpt-5.2')) return MODEL_CATALOG.find(m => m.id === 'gpt-5.2')
  if (model.startsWith('o3')) return MODEL_CATALOG.find(m => m.id === 'o3')
  if (model.startsWith('gemini-3.1-pro')) return MODEL_CATALOG.find(m => m.id === 'gemini-3.1-pro-preview')
  if (model.startsWith('kimi-k2.5')) return MODEL_CATALOG.find(m => m.id === 'kimi-k2.5')
  return undefined
}

export const mapUiModelToApi = (id: UiModelId | string): string => configFor(id)?.apiModel ?? id

export const getProviderForModel = (model: string): ModelProvider => {
  const cfg = configFor(model)
  if (cfg) return cfg.provider
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gemini-')) return 'gemini'
  if (model.startsWith('kimi-')) return 'moonshot'
  return 'openai'
}

export const supportsReasoningEffort = (model: string): boolean => {
  const cfg = configFor(model)
  if (cfg) return cfg.reasoningOptions.length > 0
  const apiModel = mapUiModelToApi(model)
  return apiModel.startsWith('o1') || apiModel.startsWith('o3') || apiModel.startsWith('gpt-5') || apiModel.startsWith('claude-')
}

export const getReasoningEffortOptions = (model: string): ReasoningEffortValue[] => {
  const cfg = configFor(model)
  if (cfg) return cfg.reasoningOptions
  return ['low', 'medium', 'high']
}

export const getDefaultReasoningEffort = (model: string): ReasoningEffortValue | undefined => {
  const cfg = configFor(model)
  return cfg?.defaultReasoning
}

export const getReasoningEffortForModel = (model: string, effort?: string): ReasoningEffortValue | undefined => {
  if (!supportsReasoningEffort(model)) return undefined
  const options = getReasoningEffortOptions(model)
  const normalized = normalizeReasoning(effort)
  if (normalized && options.includes(normalized)) return normalized
  if (normalized === 'xhigh' && options.includes('high')) return 'high'
  if (normalized === 'minimal' && options.includes('low')) return 'low'
  return getDefaultReasoningEffort(model) ?? options[0]
}

export const supportsTemperature = (model: string): boolean => {
  const cfg = configFor(model)
  if (cfg) return cfg.temperature
  const apiModel = mapUiModelToApi(model)
  return (!apiModel.startsWith('o1') && !apiModel.startsWith('o3') && !apiModel.startsWith('gpt-5')) || apiModel.startsWith('claude-')
}

export const supportsImages = (model: string): boolean => {
  const cfg = configFor(model)
  if (cfg) return cfg.images
  const apiModel = mapUiModelToApi(model)
  return apiModel === 'gpt-4o' || apiModel.startsWith('gpt-5') || apiModel.startsWith('o3') || apiModel.startsWith('claude-')
}

export type WebSearchApiStyle = 'responses' | 'none'

export const webSearchSupport = (model: string): { supported: boolean; style: WebSearchApiStyle } => {
  const cfg = configFor(model)
  if (cfg) return { supported: cfg.webSearch, style: cfg.webSearch ? 'responses' : 'none' }
  const apiModel = mapUiModelToApi(model)
  if (apiModel === 'gpt-4o' || apiModel.startsWith('gpt-5') || apiModel.startsWith('o3') || apiModel.startsWith('claude-')) {
    return { supported: true, style: 'responses' }
  }
  return { supported: false, style: 'none' }
}

export const supportsWebSearch = (model: string): boolean => webSearchSupport(model).supported
