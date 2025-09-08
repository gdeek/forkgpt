import React, { useMemo, useState } from 'react'
import { AppProvider, useApp } from './state/AppContext'
import { nanoid } from 'nanoid'
import type { Message } from './types'
import { buildMainContext, buildReplyContext } from './lib/contextBuilder'
import { streamChatCompletion } from './lib/openaiClient'
import { UI_MODELS, mapUiModelToApi } from './lib/models'

const MODELS = UI_MODELS

const AppInner: React.FC = () => {
  const { state, dispatch } = useApp()
  const [composer, setComposer] = useState('')
  const [model, setModel] = useState(MODELS[0].id)
  const [isStreaming, setIsStreaming] = useState(false)
  const [aborter, setAborter] = useState<AbortController | null>(null)

  const sessionId = state.ui.activeSessionId ?? state.sessions[0]?.id

  const session = useMemo(() => state.sessions.find(s => s.id === sessionId), [state.sessions, sessionId])
  const messages = useMemo(() => state.messages.filter(m => m.sessionId === sessionId).sort((a,b)=>a.createdAt-b.createdAt), [state.messages, sessionId])
  const anchorId = state.ui.activeReplyViewerAnchorId

  const createSession = () => dispatch({ type: 'createSession' })
  React.useEffect(()=>{ if (state.sessions.length === 0) createSession() }, [])
  const selectSession = (id: string) => dispatch({ type: 'selectSession', id })

  const onSendMain = async () => {
    if (!session || !composer.trim()) return
    if (!state.settings.apiKey) {
      alert('Set your OpenAI API key in Settings')
      return
    }
    const userMsg: Message = {
      id: nanoid(),
      sessionId: session.id,
      role: 'user',
      content: composer,
      includeInContext: true,
      createdAt: Date.now(),
    }
    dispatch({ type: 'addMessage', message: userMsg })
    setComposer('')

    const assistantMsg: Message = {
      id: nanoid(),
      sessionId: session.id,
      role: 'assistant',
      content: '',
      model,
      includeInContext: true,
      createdAt: Date.now(),
    }
    dispatch({ type: 'addMessage', message: assistantMsg })

    const ctx = buildMainContext({ session, allMessages: [...state.messages, userMsg, assistantMsg] })
    const controller = new AbortController()
    setAborter(controller)
    setIsStreaming(true)
    try {
      await streamChatCompletion({
        apiKey: state.settings.apiKey!,
        model: mapUiModelToApi(model),
        messages: [...ctx, { role: 'user', content: userMsg.content }],
        onDelta: (delta) => dispatch({ type: 'updateMessage', id: assistantMsg.id, patch: { content: (assistantMsg.content += delta) } }),
        signal: controller.signal,
      })
    } catch (e: any) {
      dispatch({ type: 'updateMessage', id: assistantMsg.id, patch: { content: assistantMsg.content + `\n\n[Error] ${e?.message ?? e}` } })
    } finally {
      setIsStreaming(false)
      setAborter(null)
    }
  }

  const stop = () => aborter?.abort()

  const onReply = (anchor: string) => dispatch({ type: 'setActiveReplyAnchor', anchorId: anchor })

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b bg-white px-4 py-2 flex items-center gap-2">
        <div className="font-semibold">ForkGPT</div>
        <div className="ml-4">
          <select className="border rounded px-2 py-1" value={sessionId} onChange={e=>selectSession(e.target.value)}>
            {state.sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <button className="ml-2 px-2 py-1 border rounded" onClick={createSession}>New Session</button>
        </div>
        <div className="ml-auto">
          <SettingsButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col">
          <div className="border-b p-3 bg-gray-50">
            <SystemPromptPanel />
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {messages.map(m => (
              <div key={m.id} className="bg-white border rounded p-3">
                <div className="text-xs text-gray-500 mb-1">{m.role}{m.model ? ` · ${m.model}` : ''}</div>
                <div className="whitespace-pre-wrap">{m.content || <span className="text-gray-400">…</span>}</div>
                {!m.anchorMessageId && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-sm flex items-center gap-1">
                      <input type="checkbox" checked={m.includeInContext} onChange={e=>dispatch({ type: 'updateMessage', id: m.id, patch: { includeInContext: e.target.checked } })} /> Include in context
                    </label>
                  </div>
                )}
                {m.role === 'assistant' && !m.anchorMessageId && (
                  <div className="mt-2">
                    <button className="text-sm px-2 py-1 border rounded" onClick={()=>onReply(m.id)}>Reply →</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="border-t p-3 flex items-center gap-2">
            <select className="border rounded px-2 py-1" value={model} onChange={e=>setModel(e.target.value)}>
              {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <textarea className="border rounded flex-1 p-2 min-h-[60px]" placeholder="Type your message" value={composer} onChange={e=>setComposer(e.target.value)} />
            {!isStreaming ? (
              <button className="px-3 py-2 bg-black text-white rounded" onClick={onSendMain}>Send</button>
            ) : (
              <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={stop}>Stop</button>
            )}
          </div>
        </main>
        <ReplyViewer />
      </div>
    </div>
  )
}

const SystemPromptPanel: React.FC = () => {
  const { state, dispatch } = useApp()
  const sessionId = state.ui.activeSessionId ?? state.sessions[0]?.id
  const session = state.sessions.find(s => s.id === sessionId)
  const [open, setOpen] = useState(true)
  if (!session) return null
  return (
    <div>
      <button className="text-sm underline" onClick={()=>setOpen(o=>!o)}>{open ? 'Hide' : 'Show'} system prompt</button>
      {open && (
        <textarea className="border rounded w-full p-2 mt-2" placeholder="System prompt" value={session.systemPrompt ?? ''} onChange={e=>dispatch({ type: 'setSystemPrompt', id: session.id, prompt: e.target.value })} />
      )}
    </div>
  )
}

const SettingsButton: React.FC = () => {
  const { state, dispatch } = useApp()
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState(state.settings.apiKey ?? '')
  return (
    <>
      <button className="px-2 py-1 border rounded" onClick={()=>setOpen(true)}>Settings</button>
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded border p-4 w-[420px]">
            <div className="font-semibold mb-2">Settings</div>
            <label className="text-sm">OpenAI API Key</label>
            <input className="border rounded w-full p-2 mt-1" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-..." />
            <div className="mt-3 flex justify-end gap-2">
              <button className="px-2 py-1" onClick={()=>setOpen(false)}>Cancel</button>
              <button className="px-2 py-1 bg-black text-white rounded" onClick={()=>{dispatch({ type: 'setSettings', settings: { apiKey } }); setOpen(false)}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const ReplyViewer: React.FC = () => {
  const { state, dispatch } = useApp()
  const anchorId = state.ui.activeReplyViewerAnchorId
  const sessionId = state.ui.activeSessionId ?? state.sessions[0]?.id
  const session = state.sessions.find(s => s.id === sessionId)
  const [replyText, setReplyText] = useState('')
  const [replyParentId, setReplyParentId] = useState<string | undefined>(undefined)
  const [isStreaming, setIsStreaming] = useState(false)
  const [aborter, setAborter] = useState<AbortController | null>(null)

  if (!anchorId || !session) return <aside className="w-0" />
  const anchor = state.messages.find(m => m.id === anchorId)
  if (!anchor) return <aside className="w-0" />

  const thread = state.messages
    .filter(m => m.anchorMessageId === anchorId)
    .sort((a, b) => a.createdAt - b.createdAt)
  const indexById = new Map(thread.map(n => [n.id, n]))
  const depthOf = (id?: string): number => {
    let d = 0
    let cur = id ? indexById.get(id) : undefined
    while (cur?.parentId) { d++; cur = indexById.get(cur.parentId) }
    return d
  }

  const onClose = () => dispatch({ type: 'setActiveReplyAnchor', anchorId: undefined })

  const toggleInclude = (id: string, next: boolean) => {
    // cascade logic will be done minimally here: if disabling, disable descendants too
    // simple pass: do multiple updates; for MVP acceptable
    const all = state.messages.filter(m => m.sessionId === session.id)
    const children = all.filter(m => m.parentId === id || m.id === id)
    if (!next) {
      // disable node and descendants
      const queue = [id]
      const toDisable = new Set<string>()
      while (queue.length) {
        const cur = queue.shift()!
        toDisable.add(cur)
        for (const m of all) if (m.parentId === cur) queue.push(m.id)
      }
      for (const d of toDisable) dispatch({ type: 'updateMessage', id: d, patch: { includeInContext: false } })
    } else {
      dispatch({ type: 'updateMessage', id, patch: { includeInContext: true } })
    }
  }

  const onSendReply = async (parentId?: string) => {
    if (!replyText.trim()) return
    if (!state.settings.apiKey) { alert('Set your OpenAI API key in Settings'); return }
    const user = {
      id: nanoid(), sessionId: session.id, role: 'user' as const, content: replyText, includeInContext: false, createdAt: Date.now(), anchorMessageId: anchorId, parentId,
    }
    dispatch({ type: 'addMessage', message: user })
    setReplyText('')
    const assistant: Message = {
      id: nanoid(), sessionId: session.id, role: 'assistant', content: '', includeInContext: false, createdAt: Date.now(), anchorMessageId: anchorId, parentId: user.id, model: anchor.model ?? 'gpt-40',
    }
    dispatch({ type: 'addMessage', message: assistant })

    const ctx = buildReplyContext({ session, allMessages: [...state.messages, user, assistant], anchorMessageId: anchorId, parentId: user.id })
    const controller = new AbortController()
    setAborter(controller)
    setIsStreaming(true)
    try {
      await streamChatCompletion({
        apiKey: state.settings.apiKey!,
        model: mapUiModelToApi(assistant.model!),
        messages: [...ctx, { role: 'user', content: user.content }],
        onDelta: (delta) => dispatch({ type: 'updateMessage', id: assistant.id, patch: { content: (assistant.content += delta) } }),
        signal: controller.signal,
      })
    } catch (e: any) {
      dispatch({ type: 'updateMessage', id: assistant.id, patch: { content: assistant.content + `\n\n[Error] ${e?.message ?? e}` } })
    } finally {
      setIsStreaming(false)
      setAborter(null)
    }
  }

  const stop = () => aborter?.abort()

  return (
    <aside className="w-[420px] border-l bg-white flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">Replying to</div>
          <div className="text-sm line-clamp-1 max-w-[320px]" title={anchor.content}>{anchor.content}</div>
        </div>
        <button className="px-2 py-1 border rounded" onClick={onClose}>Close</button>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {thread.map(n => (
          <div key={n.id} className="border rounded p-2" style={{ marginLeft: depthOf(n.id) * 12 }}>
            <div className="text-xs text-gray-500 mb-1">{n.role}</div>
            <div className="whitespace-pre-wrap">{n.content || <span className='text-gray-400'>…</span>}</div>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-sm flex items-center gap-1">
                <input type="checkbox" checked={n.includeInContext} onChange={e=>toggleInclude(n.id, e.target.checked)} /> Include in context
              </label>
              <button className="text-sm px-2 py-1 border rounded" onClick={()=>setReplyParentId(n.id)}>Reply</button>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-3 flex items-center gap-2">
        {replyParentId && (
          <div className="text-xs text-gray-600">Replying to node {replyParentId.slice(0,6)} <button className="underline" onClick={()=>setReplyParentId(undefined)}>clear</button></div>
        )}
        <textarea className="border rounded flex-1 p-2 min-h-[60px]" placeholder="Type a reply" value={replyText} onChange={e=>setReplyText(e.target.value)} />
        {!isStreaming ? (
          <button className="px-3 py-2 bg-black text-white rounded" onClick={()=>onSendReply(replyParentId)}>Send</button>
        ) : (
          <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={stop}>Stop</button>
        )}
      </div>
    </aside>
  )
}

const App: React.FC = () => (
  <AppProvider>
    <AppInner />
  </AppProvider>
)

export default App
