import { buildBasetenProviderPayload } from '../src/lib/basetenPayload'

describe('baseten provider payloads', () => {
  test('maps Kimi K3 reasoning modes', () => {
    expect(buildBasetenProviderPayload('moonshotai/Kimi-K3', 'max')).toEqual({ reasoning_effort: 'max' })
  })

  test('maps GLM thinking modes', () => {
    expect(buildBasetenProviderPayload('zai-org/GLM-5.2', 'enabled')).toEqual({ thinking: { type: 'enabled' } })
    expect(buildBasetenProviderPayload('zai-org/GLM-5.2', 'disabled')).toEqual({ thinking: { type: 'disabled' } })
  })

  test('maps DeepSeek thinking modes', () => {
    expect(buildBasetenProviderPayload('deepseek-ai/DeepSeek-V4-Flash-0731', 'disabled')).toEqual({ chat_template_kwargs: { thinking: false } })
    expect(buildBasetenProviderPayload('deepseek-ai/DeepSeek-V4-Flash-0731', 'max')).toEqual({ chat_template_kwargs: { thinking: true, reasoning_effort: 'max' } })
  })
})
