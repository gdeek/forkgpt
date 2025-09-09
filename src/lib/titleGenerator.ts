import type { ChatMessage } from './contextBuilder'

export const generateSessionTitle = async (apiKey: string, userQuestion: string): Promise<string> => {
  const system: ChatMessage = { role: 'system', content: 'You generate concise chat titles. Respond with a 3-6 word title without punctuation.' }
  const user: ChatMessage = { role: 'user', content: `Create a very short title for this question:\n\n${userQuestion}` }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [system, user],
      temperature: 0.2,
      max_tokens: 24,
      stream: false,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(()=> '')
    throw new Error(txt || `Title request failed: ${res.status}`)
  }
  const json = await res.json()
  const title = json.choices?.[0]?.message?.content?.trim?.() as string | undefined
  return (title && title.length > 0) ? title.slice(0, 60) : 'New Session'
}
