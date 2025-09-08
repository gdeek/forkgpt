export type UiModelId = 'gpt-40' | 'gpt-5' | 'o3'

export const UI_MODELS: { id: UiModelId; label: string }[] = [
  { id: 'gpt-40', label: 'gpt-40' },
  { id: 'gpt-5', label: 'gpt-5' },
  { id: 'o3', label: 'o3' },
]

export const mapUiModelToApi = (id: UiModelId | string): string => {
  switch (id) {
    case 'gpt-40':
      return 'gpt-4o-search-preview'
    case 'gpt-5':
      return 'gpt-5'
    case 'o3':
      return 'o3'
    default:
      return id
  }
}

