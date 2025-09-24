export const generateSessionTitle = async (apiKey: string, userQuestion: string): Promise<string> => {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      // provide a short instruction + question as input
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
  // Responses output_text; fall back to nested shapes if needed
  let title: string | undefined = (json.output_text ?? json.output?.[0]?.content?.[0]?.text ?? '').trim?.()
  if (!title) title = (json.response?.output_text ?? '').trim?.()
  return (title && title.length > 0) ? title.slice(0, 60) : 'New Session'
}
