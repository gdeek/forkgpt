const anthropicBase = (): string => (import.meta && (import.meta as any).env && (import.meta as any).env.DEV ? '/anthropic' : 'https://api.anthropic.com')

export const generateSessionTitle = async (apiKey: string, userQuestion: string, model: string): Promise<string> => {
  if (model.startsWith('claude-')) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
    }
    if ((import.meta as any)?.env?.DEV) headers['anthropic-dangerous-direct-browser-access'] = 'true'

    const res = await fetch(`${anthropicBase()}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        system: 'you generate concise chat titles. respond with a 3-6 word title without punctuation.',
        messages: [
          { role: 'user', content: [{ type: 'text', text: `Create a very short title for this question:\n\n${userQuestion}` }] },
        ],
        temperature: 0.5,
        max_tokens: 24,
        stream: false,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(()=> '')
      throw new Error(txt || `Title request failed: ${res.status}`)
    }
    const json = await res.json()
    const blocks: any[] = Array.isArray(json?.content) ? json.content : []
    const title = blocks.filter(b=>b?.type==='text').map(b=>b.text??'').join('').trim()
    return title ? title.slice(0, 60) : 'New Session'
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'You generate concise chat titles. Respond with a 3-6 word title without punctuation.' }] },
        { role: 'user', content: [{ type: 'input_text', text: `Create a very short title for this question:\n\n${userQuestion}` }] },
      ],
      temperature: 0.5,
      max_output_tokens: 24,
      stream: false,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(()=> '')
    throw new Error(txt || `Title request failed: ${res.status}`)
  }
  const json = await res.json()
  let title: string | undefined = (json.output_text ?? json.output?.[0]?.content?.[0]?.text ?? '').trim?.()
  if (!title) title = (json.response?.output_text ?? '').trim?.()
  return (title && title.length > 0) ? title.slice(0, 60) : 'New Session'
}
