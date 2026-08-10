import {
  UI_MODEL_GROUPS,
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
      'o3',
      'gpt-5.6-sol',
      'gpt-5.6-luna',
      'claude-opus-5',
      'claude-sonnet-5',
      'gemini-3.1-pro-preview',
      'gemini-3.6-flash',
      'kimi-k3',
      'glm-5.2',
      'deepseek-v4-flash-0731',
    ])
  })

  test('maps ui aliases to provider api model ids', () => {
    expect(mapUiModelToApi('claude-sonnet-5')).toBe('claude-sonnet-5')
    expect(mapUiModelToApi('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview')
    expect(mapUiModelToApi('kimi-k3')).toBe('moonshotai/Kimi-K3')
    expect(mapUiModelToApi('glm-5.2')).toBe('zai-org/GLM-5.2')
    expect(mapUiModelToApi('deepseek-v4-flash-0731')).toBe('deepseek-ai/DeepSeek-V4-Flash-0731')
  })

  test('returns provider for ui and api model values', () => {
    expect(getProviderForModel('claude-sonnet-5')).toBe('anthropic')
    expect(getProviderForModel('gemini-3.1-pro-preview')).toBe('gemini')
    expect(getProviderForModel('moonshotai/Kimi-K3')).toBe('baseten')
    expect(getProviderForModel('zai-org/GLM-5.2')).toBe('baseten')
    expect(getProviderForModel('deepseek-ai/DeepSeek-V4-Flash-0731')).toBe('baseten')
    expect(getProviderForModel('kimi-k2.5')).toBe('unsupported')
  })

  test('returns model specific reasoning options', () => {
    expect(getReasoningEffortOptions('o3')).toEqual(['low', 'medium', 'high'])
    expect(getReasoningEffortOptions('gpt-5.6-sol')).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(getReasoningEffortOptions('gpt-5.6-luna')).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(getReasoningEffortOptions('gemini-3.1-pro-preview')).toEqual(['low', 'medium', 'high'])
    expect(getReasoningEffortOptions('gemini-3.6-flash')).toEqual(['minimal', 'low', 'medium', 'high'])
    expect(getReasoningEffortOptions('claude-opus-5')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(getReasoningEffortOptions('claude-sonnet-5')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(getReasoningEffortOptions('kimi-k3')).toEqual(['low', 'high', 'max'])
    expect(getReasoningEffortOptions('glm-5.2')).toEqual(['enabled', 'disabled'])
    expect(getReasoningEffortOptions('deepseek-v4-flash-0731')).toEqual(['disabled', 'high', 'max'])
  })

  test('coerces unsupported reasoning values to model defaults', () => {
    expect(getReasoningEffortForModel('claude-sonnet-5', undefined)).toBe('high')
    expect(getReasoningEffortForModel('gpt-5.6-sol', 'xhigh')).toBe('xhigh')
    expect(getReasoningEffortForModel('gemini-3.6-flash', 'minimal')).toBe('minimal')
    expect(getReasoningEffortForModel('gemini-3.1-pro-preview', 'medium')).toBe('medium')
    expect(getReasoningEffortForModel('gemini-3.1-pro-preview', 'minimal')).toBe('low')
    expect(getReasoningEffortForModel('gemini-3.1-pro-preview', 'x-high')).toBe('high')
    expect(getReasoningEffortForModel('kimi-k3', 'high')).toBe('high')
    expect(getReasoningEffortForModel('glm-5.2', 'off')).toBe('disabled')
    expect(getReasoningEffortForModel('deepseek-v4-flash-0731', 'xhigh')).toBe('max')
    expect(getReasoningEffortForModel('claude-sonnet-5', 'x-high')).toBe('xhigh')
  })

  test('applies model feature flags', () => {
    expect(supportsReasoningEffort('kimi-k3')).toBe(true)
    expect(supportsTemperature('kimi-k3')).toBe(false)
    expect(supportsTemperature('claude-sonnet-5')).toBe(false)
  })

  test('groups models by company', () => {
    expect(UI_MODEL_GROUPS.map(group => group.company)).toEqual(['OpenAI', 'Anthropic', 'Google', 'Moonshot AI', 'Z.AI', 'DeepSeek'])
    expect(UI_MODEL_GROUPS.find(group => group.company === 'Moonshot AI')?.models.map(model => model.id)).toEqual(['kimi-k3'])
  })

  test('keeps Kimi K2.5 unavailable', () => {
    expect(UI_MODELS.some(model => (model.id as string) === 'kimi-k2.5')).toBe(false)
    expect(supportsReasoningEffort('kimi-k2.5')).toBe(false)
  })
})
