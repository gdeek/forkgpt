import { streamOpenAiCompat } from '../src/lib/openAiCompatClient'

describe('openai-compatible streaming', () => {
  test('preserves hidden reasoning content and emits reasoning deltas separately', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\ndata: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: [DONE]\n\n'))
          controller.close()
        },
      }),
    } as Response)
    const onDelta = jest.fn()
    const onReasoningDelta = jest.fn()

    await streamOpenAiCompat({
      apiKey: 'baseten-test-key',
      baseUrl: 'https://inference.baseten.co/v1',
      model: 'moonshotai/Kimi-K3',
      messages: [{ role: 'assistant', content: 'answer', reasoningContent: 'prior thought' }],
      reasoningEffort: 'high',
      onDelta,
      onReasoningDelta,
      preserveReasoningContent: true,
      buildProviderPayload: effort => ({ reasoning_effort: effort }),
    })

    const request = fetchMock.mock.calls[0]?.[1]
    const payload = JSON.parse(String(request?.body))
    expect(payload.messages[0]).toEqual({ role: 'assistant', content: 'answer', reasoning_content: 'prior thought' })
    expect(payload.reasoning_effort).toBe('high')
    expect(onReasoningDelta).toHaveBeenCalledWith('think')
    expect(onDelta).toHaveBeenCalledWith('answer')
    fetchMock.mockRestore()
  })
})
