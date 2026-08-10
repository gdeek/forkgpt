import type { ReasoningEffortValue } from '../types'

export type ModelProvider = 'openai' | 'anthropic' | 'gemini' | 'baseten' | 'unsupported'
export type ModelCompany = 'OpenAI' | 'Anthropic' | 'Google' | 'Moonshot AI' | 'Z.AI' | 'DeepSeek'

export type UiModelId =
  | 'o3'
  | 'gpt-5.6-sol'
  | 'gpt-5.6-luna'
  | 'claude-opus-5'
  | 'claude-sonnet-5'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.6-flash'
  | 'kimi-k3'
  | 'glm-5.2'
  | 'deepseek-v4-flash-0731'

type ModelConfig = {
  id: UiModelId
  label: string
  company: ModelCompany
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
    id: 'o3',
    label: 'o3',
    company: 'OpenAI',
    apiModel: 'o3',
    provider: 'openai',
    reasoningOptions: ['low', 'medium', 'high'],
    defaultReasoning: 'medium',
    temperature: false,
    images: true,
    webSearch: true,
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    company: 'OpenAI',
    apiModel: 'gpt-5.6-sol',
    provider: 'openai',
    reasoningOptions: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoning: 'medium',
    temperature: false,
    images: true,
    webSearch: true,
  },
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    company: 'OpenAI',
    apiModel: 'gpt-5.6-luna',
    provider: 'openai',
    reasoningOptions: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoning: 'medium',
    temperature: false,
    images: true,
    webSearch: true,
  },
  {
    id: 'claude-opus-5',
    label: 'claude-opus-5',
    company: 'Anthropic',
    apiModel: 'claude-opus-5',
    provider: 'anthropic',
    reasoningOptions: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoning: 'high',
    temperature: false,
    images: true,
    webSearch: true,
  },
  {
    id: 'claude-sonnet-5',
    label: 'claude-sonnet-5',
    company: 'Anthropic',
    apiModel: 'claude-sonnet-5',
    provider: 'anthropic',
    reasoningOptions: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoning: 'high',
    temperature: false,
    images: true,
    webSearch: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'gemini-3.1-pro-preview',
    company: 'Google',
    apiModel: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    reasoningOptions: ['low', 'medium', 'high'],
    defaultReasoning: 'high',
    temperature: true,
    images: false,
    webSearch: false,
  },
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    company: 'Google',
    apiModel: 'gemini-3.6-flash',
    provider: 'gemini',
    reasoningOptions: ['minimal', 'low', 'medium', 'high'],
    defaultReasoning: 'medium',
    temperature: false,
    images: true,
    webSearch: false,
  },
  {
    id: 'kimi-k3',
    label: 'Kimi K3',
    company: 'Moonshot AI',
    apiModel: 'moonshotai/Kimi-K3',
    provider: 'baseten',
    reasoningOptions: ['low', 'high', 'max'],
    defaultReasoning: 'max',
    temperature: false,
    images: true,
    webSearch: false,
  },
  {
    id: 'glm-5.2',
    label: 'GLM-5.2',
    company: 'Z.AI',
    apiModel: 'zai-org/GLM-5.2',
    provider: 'baseten',
    reasoningOptions: ['enabled', 'disabled'],
    defaultReasoning: 'enabled',
    temperature: true,
    images: false,
    webSearch: false,
  },
  {
    id: 'deepseek-v4-flash-0731',
    label: 'DeepSeek V4 Flash 0731',
    company: 'DeepSeek',
    apiModel: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    provider: 'baseten',
    reasoningOptions: ['disabled', 'high', 'max'],
    defaultReasoning: 'high',
    temperature: false,
    images: false,
    webSearch: false,
  },
]

const COMPANY_ORDER: ModelCompany[] = ['OpenAI', 'Anthropic', 'Google', 'Moonshot AI', 'Z.AI', 'DeepSeek']

export const UI_MODELS: { id: UiModelId; label: string }[] = MODEL_CATALOG.map(({ id, label }) => ({ id, label }))

export const UI_MODEL_GROUPS: { company: ModelCompany; models: { id: UiModelId; label: string }[] }[] = COMPANY_ORDER.map(company => ({
  company,
  models: MODEL_CATALOG.filter(model => model.company === company).map(({ id, label }) => ({ id, label })),
}))

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

  if (model.startsWith('claude-opus-5')) return MODEL_CATALOG.find(m => m.id === 'claude-opus-5')
  if (model.startsWith('claude-sonnet-5')) return MODEL_CATALOG.find(m => m.id === 'claude-sonnet-5')
  if (model.startsWith('gpt-5.6-sol')) return MODEL_CATALOG.find(m => m.id === 'gpt-5.6-sol')
  if (model.startsWith('gpt-5.6-luna')) return MODEL_CATALOG.find(m => m.id === 'gpt-5.6-luna')
  if (model.startsWith('o3')) return MODEL_CATALOG.find(m => m.id === 'o3')
  if (model.startsWith('gemini-3.6-flash')) return MODEL_CATALOG.find(m => m.id === 'gemini-3.6-flash')
  if (model.startsWith('gemini-3.1-pro')) return MODEL_CATALOG.find(m => m.id === 'gemini-3.1-pro-preview')
  if (model.startsWith('moonshotai/Kimi-K3')) return MODEL_CATALOG.find(m => m.id === 'kimi-k3')
  if (model.startsWith('zai-org/GLM-5.2')) return MODEL_CATALOG.find(m => m.id === 'glm-5.2')
  if (model.startsWith('deepseek-ai/DeepSeek-V4-Flash-0731')) return MODEL_CATALOG.find(m => m.id === 'deepseek-v4-flash-0731')
  return undefined
}

export const mapUiModelToApi = (id: UiModelId | string): string => configFor(id)?.apiModel ?? id

export const getProviderForModel = (model: string): ModelProvider => {
  const cfg = configFor(model)
  if (cfg) return cfg.provider
  if (model === 'kimi-k2.5') return 'unsupported'
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gemini-')) return 'gemini'
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
  if (normalized === 'xhigh' && options.includes('max')) return 'max'
  if ((normalized === 'xhigh' || normalized === 'high') && options.includes('high')) return 'high'
  if ((normalized === 'minimal' || normalized === 'low' || normalized === 'medium') && options.includes('low')) return 'low'
  if ((normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'xhigh') && options.includes('high')) return 'high'
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
