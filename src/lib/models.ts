export type UiModelId = 'gpt-4o' | 'gpt-5' | 'o3'

export const UI_MODELS: { id: UiModelId; label: string }[] = [
  { id: 'gpt-4o', label: 'gpt-4o' },
  { id: 'gpt-5', label: 'gpt-5' },
  { id: 'o3', label: 'o3' },
]

export const mapUiModelToApi = (id: UiModelId | string): string => {
  switch (id) {
    case 'gpt-4o':
      return 'gpt-4o'
    case 'gpt-5':
      return 'gpt-5'
    case 'o3':
      return 'o3'
    default:
      return id
  }
}

// Helper function to check if a model supports reasoning effort
export const supportsReasoningEffort = (model: string): boolean => {
  const apiModel = mapUiModelToApi(model)
  // Only o1-series, o3-series, and gpt-5 models support reasoning effort
  // gpt-4o and other standard models do NOT support this parameter
  return apiModel.startsWith('o1') || apiModel.startsWith('o3') || apiModel === 'gpt-5'
}

// Helper function to check if a model supports temperature
export const supportsTemperature = (model: string): boolean => {
  const apiModel = mapUiModelToApi(model)
  // o1-series, o3-series, and gpt-5 models do NOT support temperature
  // Only standard models like gpt-4o support temperature
  return !apiModel.startsWith('o1') && !apiModel.startsWith('o3') && apiModel !== 'gpt-5'
}

// Helper for multimodal image support
export const supportsImages = (model: string): boolean => {
  const apiModel = mapUiModelToApi(model)
  // Per user decision, gpt-4o, gpt-5 and o3 all support images
  return apiModel === 'gpt-4o' || apiModel === 'gpt-5' || apiModel.startsWith('o3')
}

export type WebSearchApiStyle = 'responses' | 'chat-search-preview' | 'none'

// Returns whether a model supports first‑party Web Search and how to enable it
export const webSearchSupport = (model: string): { supported: boolean; style: WebSearchApiStyle } => {
  const apiModel = mapUiModelToApi(model)
  // Our UI models (gpt-4o, gpt-5, o3) all support Web Search via Responses API
  if (apiModel === 'gpt-4o' || apiModel === 'gpt-5' || apiModel.startsWith('o3')) {
    return { supported: true, style: 'responses' }
  }
  return { supported: false, style: 'none' }
}

export const supportsWebSearch = (model: string): boolean => webSearchSupport(model).supported
