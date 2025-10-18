export type UiModelId =
  | 'gpt-4o'
  | 'gpt-5'
  | 'o3'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-haiku-4-5-20251001'
  | 'claude-opus-4-1-20250805'

export const UI_MODELS: { id: UiModelId; label: string }[] = [
  { id: 'gpt-4o', label: 'gpt-4o' },
  { id: 'gpt-5', label: 'gpt-5' },
  { id: 'o3', label: 'o3' },
  // friendly labels for claude, ids are the anthropic api ids
  { id: 'claude-sonnet-4-5-20250929', label: 'claude-sonnet-4.5' },
  { id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4.5' },
  { id: 'claude-opus-4-1-20250805', label: 'claude-opus-4.1' },
]

export const mapUiModelToApi = (id: UiModelId | string): string => {
  switch (id) {
    case 'gpt-4o':
      return 'gpt-4o'
    case 'gpt-5':
      return 'gpt-5'
    case 'o3':
      return 'o3'
    case 'claude-sonnet-4-5-20250929':
      return 'claude-sonnet-4-5-20250929'
    case 'claude-haiku-4-5-20251001':
      return 'claude-haiku-4-5-20251001'
    case 'claude-opus-4-1-20250805':
      return 'claude-opus-4-1-20250805'
    default:
      return id
  }
}

// Helper function to check if a model supports reasoning effort
export const supportsReasoningEffort = (model: string): boolean => {
  const apiModel = mapUiModelToApi(model)
  // o1-series, o3-series, gpt-5 and claude 4.x support reasoning/thinking parameters
  return apiModel.startsWith('o1') || apiModel.startsWith('o3') || apiModel === 'gpt-5' || apiModel.startsWith('claude-')
}

// Helper function to check if a model supports temperature
export const supportsTemperature = (model: string): boolean => {
  const apiModel = mapUiModelToApi(model)
  // o1-series, o3-series, and gpt-5 models do NOT support temperature
  // Standard models like gpt-4o and all claude models support temperature
  return (!apiModel.startsWith('o1') && !apiModel.startsWith('o3') && apiModel !== 'gpt-5') || apiModel.startsWith('claude-')
}

// Helper for multimodal image support
export const supportsImages = (model: string): boolean => {
  const apiModel = mapUiModelToApi(model)
  // gpt-4o, gpt-5, o3 and claude 4.x support images
  return apiModel === 'gpt-4o' || apiModel === 'gpt-5' || apiModel.startsWith('o3') || apiModel.startsWith('claude-')
}

export type WebSearchApiStyle = 'responses' | 'chat-search-preview' | 'none'

// Returns whether a model supports first‑party Web Search and how to enable it
export const webSearchSupport = (model: string): { supported: boolean; style: WebSearchApiStyle } => {
  const apiModel = mapUiModelToApi(model)
  // Our UI models (gpt-4o, gpt-5, o3) support web search via responses api; claude supports web search via anthropic tools
  if (apiModel === 'gpt-4o' || apiModel === 'gpt-5' || apiModel.startsWith('o3') || apiModel.startsWith('claude-')) {
    return { supported: true, style: 'responses' }
  }
  return { supported: false, style: 'none' }
}

export const supportsWebSearch = (model: string): boolean => webSearchSupport(model).supported
