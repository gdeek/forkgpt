import {
  UI_MODELS,
  getProviderForModel,
  getReasoningEffortForModel,
  getReasoningEffortOptions,
  mapUiModelToApi,
  supportsReasoningEffort,
  supportsTemperature,
} from '../src/lib/models'

describe('models', () => {
  test('exposes the expected model list', () => {
    expect(UI_MODELS.map(m => m.id)).toEqual([
      'gpt-5.2',
      'gpt-5.2-codex',
      'o3',
      'claude-opus-4.6',
      'claude-sonnet-4.6',
      'gemini-3.1-pro-preview',
      'kimi-k2.5',
    ])
  })

  test('maps ui aliases to provider api model ids', () => {
    expect(mapUiModelToApi('claude-opus-4.6')).toBe('claude-opus-4-6')
    expect(mapUiModelToApi('claude-sonnet-4.6')).toBe('claude-sonnet-4-6')
    expect(mapUiModelToApi('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview')
    expect(mapUiModelToApi('kimi-k2.5')).toBe('kimi-k2.5')
  })

  test('returns provider for ui and api model values', () => {
    expect(getProviderForModel('gpt-5.2')).toBe('openai')
    expect(getProviderForModel('claude-opus-4-6')).toBe('anthropic')
    expect(getProviderForModel('gemini-3.1-pro-preview')).toBe('gemini')
    expect(getProviderForModel('kimi-k2.5')).toBe('moonshot')
  })

  test('returns model specific reasoning options', () => {
    expect(getReasoningEffortOptions('gpt-5.2-codex')).toEqual(['medium', 'high', 'xhigh'])
    expect(getReasoningEffortOptions('o3')).toEqual(['low', 'medium', 'high'])
    expect(getReasoningEffortOptions('gemini-3.1-pro-preview')).toEqual(['low', 'medium', 'high'])
    expect(getReasoningEffortOptions('kimi-k2.5')).toEqual(['enabled', 'disabled'])
  })

  test('coerces unsupported reasoning values to model defaults', () => {
    expect(getReasoningEffortForModel('gpt-5.2', undefined)).toBe('medium')
    expect(getReasoningEffortForModel('gemini-3.1-pro-preview', 'medium')).toBe('medium')
    expect(getReasoningEffortForModel('gemini-3.1-pro-preview', 'minimal')).toBe('low')
    expect(getReasoningEffortForModel('gemini-3.1-pro-preview', 'x-high')).toBe('high')
    expect(getReasoningEffortForModel('kimi-k2.5', 'high')).toBe('enabled')
    expect(getReasoningEffortForModel('gpt-5.2', 'x-high')).toBe('xhigh')
  })

  test('applies model feature flags', () => {
    expect(supportsReasoningEffort('kimi-k2.5')).toBe(true)
    expect(supportsTemperature('kimi-k2.5')).toBe(false)
    expect(supportsTemperature('claude-sonnet-4.6')).toBe(true)
  })
})
