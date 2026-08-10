import type { ReasoningEffortValue } from '../types'

export const buildBasetenProviderPayload = (model: string, effort?: ReasoningEffortValue): Record<string, unknown> | undefined => {
  if (model === 'moonshotai/Kimi-K3') return effort ? { reasoning_effort: effort } : undefined
  if (model === 'zai-org/GLM-5.2') return { thinking: { type: effort === 'disabled' ? 'disabled' : 'enabled' } }
  if (model === 'deepseek-ai/DeepSeek-V4-Flash-0731') {
    if (effort === 'disabled') return { chat_template_kwargs: { thinking: false } }
    return { chat_template_kwargs: { thinking: true, reasoning_effort: effort === 'max' ? 'max' : 'high' } }
  }
  return undefined
}
