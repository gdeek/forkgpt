import React, { useMemo, useState } from 'react'
import { AppProvider, useApp } from './state/AppContext'
import { nanoid } from 'nanoid'
import type { Message } from './types'
import { buildMainContext, buildReplyContext } from './lib/contextBuilder'
import { streamChatCompletion } from './lib/openaiClient'
import { UI_MODELS, mapUiModelToApi, supportsReasoningEffort, supportsTemperature } from './lib/models'
import { generateSessionTitle } from './lib/titleGenerator'
import { ErrorBoundary } from './components/ErrorBoundary'
import { encryptString, decryptString } from './lib/crypto'

const MODELS = UI_MODELS

// Utility: truncate text to a maximum number of characters with ellipsis.
const truncateText = (text: string, max = 20): string => {
  const single = (text ?? '').replace(/\s+/g, ' ').trim()
  return single.length > max ? single.slice(0, max) + '…' : single
}

const AppInner: React.FC = () => {
  const { state, dispatch } = useApp()
  const [composer, setComposer] = useState('')
  const [model, setModel] = useState(MODELS[0].id)
  const [isStreaming, setIsStreaming] = useState(false)
  const [aborter, setAborter] = useState<AbortController | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [rvWidth, setRvWidth] = useState<number>(state.ui.replyViewerWidth ?? 420)
  React.useEffect(()=>{ setRvWidth(state.ui.replyViewerWidth ?? 420) }, [state.ui.replyViewerWidth])
  React.useEffect(()=>{
    if (!isResizing) return
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const right = rect.right
      const newW = Math.round(Math.min(800, Math.max(280, right - e.clientX)))
      setRvWidth(newW)
    }
    const onUp = () => { setIsResizing(false); dispatch({ type: 'setReplyViewerWidth', width: rvWidth }) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp, { once: true })
    return () => { window.removeEventListener('mousemove', onMove) }
  }, [isResizing, rvWidth])
  const startResize = (e: React.MouseEvent) => { e.preventDefault(); setIsResizing(true) }

  const sessionId = state.ui.activeSessionId ?? state.sessions[0]?.id

  const session = useMemo(() => state.sessions.find(s => s.id === sessionId), [state.sessions, sessionId])
  const messages = useMemo(() => state.messages.filter(m => m.sessionId === sessionId).sort((a,b)=>a.createdAt-b.createdAt), [state.messages, sessionId])
  const mainMessages = useMemo(() => messages.filter(m => !m.anchorMessageId), [messages])
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
    const isFirstMain = mainMessages.length === 0
    const userMsg: Message = {
      id: nanoid(),
      sessionId: session.id,
      role: 'user',
      content: composer,
      includeInContext: true,
      createdAt: Date.now(),
    }
    dispatch({ type: 'addMessage', message: userMsg })
    dispatch({ type: 'touchSession', id: session.id })
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
        temperature: supportsTemperature(model) ? session?.temperature : undefined,
        reasoningEffort: supportsReasoningEffort(model) ? session?.reasoningEffort : undefined,
        onDelta: (delta) => dispatch({ type: 'updateMessage', id: assistantMsg.id, patch: { content: (assistantMsg.content += delta) } }),
        signal: controller.signal,
      })
    } catch (e: any) {
      dispatch({ type: 'updateMessage', id: assistantMsg.id, patch: { content: assistantMsg.content + `\n\n[Error] ${e?.message ?? e}` } })
    } finally {
      setIsStreaming(false)
      setAborter(null)
    }

    // Generate session title after first exchange
    if (isFirstMain && state.settings.apiKey) {
      try {
        const title = await generateSessionTitle(state.settings.apiKey, userMsg.content)
        dispatch({ type: 'renameSession', id: session.id, title })
      } catch {
        // ignore title errors
      }
    }
  }

  const stop = () => aborter?.abort()

  const onReply = (anchor: string) => dispatch({ type: 'setActiveReplyAnchor', anchorId: anchor })

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b bg-white px-4 py-2 flex items-center gap-2">
        <div className="font-semibold">ForkGPT</div>
        <div className="ml-auto">
          <SettingsButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden" ref={containerRef}>
        <SessionSidebar />
        <main className="flex-1 flex flex-col">
          <div className="border-b p-3 bg-gray-50">
            <SystemPromptPanel currentModel={model} />
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {mainMessages.map(m => (
              <div key={m.id} className="bg-white border rounded p-3">
                <div className="text-xs text-gray-500 mb-1">{m.role}{m.model ? ` · ${m.model}` : ''}</div>
                <div className="whitespace-pre-wrap">{m.content || <span className="text-gray-400">…</span>}</div>
                {!m.anchorMessageId && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-sm flex items-center gap-1">
                      <input type="checkbox" checked={!!m.includeInContext} onChange={e=>dispatch({ type: 'updateMessage', id: m.id, patch: { includeInContext: e.target.checked } })} /> Include in context
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
        <div
          className="w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize"
          onMouseDown={startResize}
          title="Drag to resize"
        />
        <ErrorBoundary>
          <ReplyViewer width={rvWidth} />
        </ErrorBoundary>
      </div>
    </div>
  )
}

  const SystemPromptPanel: React.FC<{ currentModel: string }> = ({ currentModel }) => {
  const { state, dispatch } = useApp()
  const sessionId = state.ui.activeSessionId ?? state.sessions[0]?.id
  const session = state.sessions.find(s => s.id === sessionId)
  const [open, setOpen] = useState(true)
  if (!session) return null
  return (
    <div>
      <button className="text-sm underline" onClick={()=>setOpen(o=>!o)}>{open ? 'Hide' : 'Show'} system settings</button>
      {open && (
        <>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 items-center">
            {supportsTemperature(currentModel) && (
              <label className="text-sm flex items-center gap-2">
                <span className="whitespace-nowrap">Temperature</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={session.temperature ?? 0.7}
                  onChange={e=>dispatch({ type: 'setSessionTemperature', id: session.id, temperature: Number(e.target.value) })}
                />
                <span className="text-xs text-gray-600 w-8">{(session.temperature ?? 0.5).toFixed(1)}</span>
              </label>
            )}
            {supportsReasoningEffort(currentModel) && (
              <label className="text-sm flex items-center gap-2">
                <span className="whitespace-nowrap">Reasoning effort</span>
                <select
                  className="border rounded px-2 py-1"
                  value={session.reasoningEffort ?? 'medium'}
                  onChange={e=>dispatch({ type: 'setSessionReasoningEffort', id: session.id, effort: e.target.value as any })}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
            )}
          </div>
          <textarea className="border rounded w-full p-2 mt-2" placeholder="System prompt" value={session.systemPrompt ?? ''} onChange={e=>dispatch({ type: 'setSystemPrompt', id: session.id, prompt: e.target.value })} />
        </>
      )}
    </div>
  )
}

const SettingsButton: React.FC = () => {
  const { state, dispatch } = useApp()
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState(state.settings.apiKey ?? '')
  const hasEncrypted = !!state.settings.apiKeyEncrypted
  const locked = hasEncrypted && !state.settings.apiKey
  const [mode, setMode] = useState<'unlock' | 'set'>(locked ? 'unlock' : 'set')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button className="px-2 py-1 border rounded" onClick={()=>setOpen(true)}>Settings</button>
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded border p-4 w-[460px]">
            <div className="font-semibold mb-2">Settings</div>
            {mode === 'unlock' ? (
              <div className="space-y-2">
                <div className="text-sm text-gray-700">An encrypted API key is stored. Enter password to unlock for this session.</div>
                <label className="text-sm">Password</label>
                <input className="border rounded w-full p-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
                <div className="mt-3 flex justify-between items-center">
                  <button className="text-xs underline" onClick={()=>{ setMode('set'); setPassword('') }}>Replace key…</button>
                  <div className="flex gap-2">
                    <button className="px-2 py-1" onClick={()=>setOpen(false)}>Cancel</button>
                    <button className="px-2 py-1 bg-black text-white rounded" disabled={busy || !password} onClick={async ()=>{
                      if (!state.settings.apiKeyEncrypted) return
                      try {
                        setBusy(true)
                        const plain = await decryptString(state.settings.apiKeyEncrypted, password)
                        dispatch({ type: 'setSettings', settings: { apiKey: plain } })
                        setOpen(false); setPassword('')
                      } catch (e) {
                        alert('Decryption failed. Check password.')
                      } finally { setBusy(false) }
                    }}>Unlock</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm">OpenAI API Key</label>
                <input className="border rounded w-full p-2" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-..." />
                <label className="text-sm">Set Password (required)</label>
                <input className="border rounded w-full p-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password to encrypt key" />
                <div className="text-xs text-gray-500">Your password is not stored; losing it means re-entering the key.</div>
                <div className="mt-3 flex justify-between items-center">
                  {hasEncrypted && <button className="text-xs underline" onClick={()=>{ setMode('unlock'); setPassword('') }}>Unlock existing…</button>}
                  <div className="flex gap-2">
                    <button className="px-2 py-1" onClick={()=>setOpen(false)}>Cancel</button>
                    <button className="px-2 py-1 bg-black text-white rounded" disabled={busy || !apiKey || !password} onClick={async ()=>{
                      try {
                        setBusy(true)
                        const enc = await encryptString(apiKey, password)
                        dispatch({ type: 'setSettings', settings: { apiKeyEncrypted: enc, apiKey } })
                        setOpen(false); setPassword('')
                      } catch(e) {
                        alert('Encryption failed')
                      } finally { setBusy(false) }
                    }}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const SessionSidebar: React.FC = () => {
  const { state, dispatch } = useApp()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const sessions = [...state.sessions].sort((a,b)=> (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))
  const activeId = state.ui.activeSessionId ?? sessions[0]?.id
  const create = () => dispatch({ type: 'createSession' })
  const select = (id: string) => dispatch({ type: 'selectSession', id })
  const startRename = (id: string, current: string) => { setRenamingId(id); setRenameVal(current) }
  const applyRename = () => {
    if (renamingId) dispatch({ type: 'renameSession', id: renamingId, title: renameVal.trim() || 'Untitled' })
    setRenamingId(null); setRenameVal('')
  }
  return (
    <aside className="w-[260px] border-r bg-gray-50 flex flex-col">
      <div className="p-2 border-b flex items-center justify-between">
        <div className="text-sm font-medium">Sessions</div>
        <button className="px-2 py-1 border rounded text-sm" onClick={create}>New</button>
      </div>
      <div className="flex-1 overflow-auto">
        {sessions.map(s => (
          <div key={s.id} className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${s.id===activeId?'bg-white border-l-4 border-black':''}`} onClick={()=>select(s.id)}>
            {renamingId===s.id ? (
              <div className="flex items-center gap-2">
                <input className="border rounded px-2 py-1 flex-1" value={renameVal} onChange={e=>setRenameVal(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter') applyRename() }} />
                <button className="text-sm" onClick={applyRename}>Save</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="truncate max-w-[150px]" title={s.title}>{s.title || 'Untitled'}</div>
                <div className="flex items-center gap-2">
                  <button className="text-xs underline" onClick={(e)=>{ e.stopPropagation(); startRename(s.id, s.title || '') }}>Rename</button>
                  <button
                    className="text-xs underline text-red-600"
                    onClick={(e)=>{
                      e.stopPropagation()
                      const name = s.title || 'Untitled'
                      if (confirm(`Delete session "${name}"? This will permanently remove all messages in this session.`)) {
                        dispatch({ type: 'deleteSession', id: s.id })
                      }
                    }}
                  >Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}

const ReplyViewer: React.FC<{ width: number }> = ({ width }) => {
  const { state, dispatch } = useApp()
  const anchorId = state.ui.activeReplyViewerAnchorId
  const sessionId = state.ui.activeSessionId ?? state.sessions[0]?.id
  const session = state.sessions.find(s => s.id === sessionId)
  const [replyText, setReplyText] = useState('')
  const [replyParentId, setReplyParentId] = useState<string | undefined>(undefined)
  const [isStreaming, setIsStreaming] = useState(false)
  const [aborter, setAborter] = useState<AbortController | null>(null)
  // Hooks must be called in a consistent order across renders.
  // Keep this state above any conditional early returns.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const replyParent = replyParentId ? state.messages.find(m => m.id === replyParentId) : undefined

  if (!anchorId || !session) return <aside className="w-0" />
  const anchor = state.messages.find(m => m.id === anchorId)
  if (!anchor) return <aside className="w-0" />
  // If anchor belongs to a different session (stale UI state), close viewer
  if (anchor.sessionId !== session.id) {
    dispatch({ type: 'setActiveReplyAnchor', anchorId: undefined })
    return <aside className="w-0" />
  }

  const thread = state.messages
    .filter(m => m.sessionId === session.id && m.anchorMessageId === anchorId)
    .sort((a, b) => a.createdAt - b.createdAt)
  const byParent = new Map<string, Message[]>()
  for (const n of thread) {
    const key = n.parentId || '__root__'
    const arr = byParent.get(key) || []
    arr.push(n)
    byParent.set(key, arr)
  }
  const toggleCollapse = (id: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const renderTree = (parentId?: string, depth = 0): React.ReactNode => {
    let list: Message[]
    if (parentId === undefined) {
      // Treat both true roots (no parent) and direct children of the anchor as top-level entries
      const roots = byParent.get('__root__') || []
      const direct = byParent.get(anchorId) || []
      list = [...roots, ...direct]
    } else {
      list = byParent.get(parentId) || []
    }
    return list.map(n => (
      <div key={n.id}>
        <div className="rounded-md border border-gray-200 bg-white p-2 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <button className="h-5 w-5 grid place-items-center border rounded" onClick={()=>toggleCollapse(n.id)} aria-label={collapsed.has(n.id)?'Expand':'Collapse'}>
              {collapsed.has(n.id) ? '+' : '−'}
            </button>
            <div>{n.role}</div>
          </div>
          {!collapsed.has(n.id) && (
            <>
              <div className={`mt-1 whitespace-pre-wrap ${depth >= 1 ? 'text-[13px] leading-5' : 'text-sm leading-6'}`}>{n.content || <span className='text-gray-400'>…</span>}</div>
              <div className="mt-2 flex items-center gap-3">
                <label className="text-xs flex items-center gap-1">
                  <input type="checkbox" checked={!!n.includeInContext} onChange={e=>toggleInclude(n.id, e.target.checked)} /> Include in context
                </label>
                {n.role === 'assistant' && (
                  <button className="text-xs px-2 py-1 border rounded" onClick={()=>setReplyParentId(n.id)}>Reply</button>
                )}
              </div>
              <div className="mt-2 ml-3 pl-3 border-l border-gray-200 space-y-2">
                {renderTree(n.id, depth + 1)}
              </div>
            </>
          )}
        </div>
      </div>
    ))
  }

  const onClose = () => dispatch({ type: 'setActiveReplyAnchor', anchorId: undefined })

  const toggleInclude = (id: string, next: boolean) => {
    // operate only on this branch's messages to avoid cross-anchor changes
    const branchMessages = state.messages.filter(m => m.sessionId === session.id && m.anchorMessageId === anchorId)
    if (!next) {
      // disable node and descendants within this branch
      // build descendant set
      const queue = [id]
      const toDisable = new Set<string>()
      while (queue.length) {
        const cur = queue.shift()!
        toDisable.add(cur)
        for (const child of branchMessages) if (child.parentId === cur) queue.push(child.id)
      }
      for (const d of toDisable) dispatch({ type: 'updateMessage', id: d, patch: { includeInContext: false } })
    } else {
      dispatch({ type: 'updateMessage', id, patch: { includeInContext: true } })
    }
  }

  const onSendReply = async (parentId?: string) => {
    if (!replyText.trim()) return
    if (!state.settings.apiKey) { alert('Set your OpenAI API key in Settings'); return }
    // Guard: replies should target assistant messages. If a user node was passed,
    // walk up to the nearest assistant ancestor within this thread; otherwise fall back to root.
    if (parentId) {
      const getById = (id: string | undefined) => state.messages.find(m => m.id === id)
      let node = getById(parentId)
      let hops = 0
      while (node && node.role !== 'assistant' && hops < 50) {
        node = getById(node.parentId)
        hops += 1
      }
      parentId = node?.role === 'assistant' ? node.id : undefined
    }
    const user = {
      id: nanoid(), sessionId: session.id, role: 'user' as const, content: replyText, includeInContext: false, createdAt: Date.now(), anchorMessageId: anchorId, parentId,
    }
    dispatch({ type: 'addMessage', message: user })
    setReplyText('')
    const assistant: Message = {
      id: nanoid(), sessionId: session.id, role: 'assistant', content: '', includeInContext: false, createdAt: Date.now(), anchorMessageId: anchorId, parentId: user.id, model: anchor.model ?? 'gpt-4o',
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
        temperature: supportsTemperature(assistant.model!) ? session?.temperature : undefined,
        reasoningEffort: supportsReasoningEffort(assistant.model!) ? session?.reasoningEffort : undefined,
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
    <aside className="border-l bg-white flex flex-col" style={{ width }}>
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">Replying to</div>
          <div className="text-sm" title={anchor.content}>{truncateText(anchor.content, 20)}</div>
        </div>
        <button className="px-2 py-1 border rounded" onClick={onClose}>Close</button>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {(() => {
          const content = renderTree(undefined, 0)
          if (Array.isArray(content) && content.length === 0) {
            return <div className="text-sm text-gray-500">No replies yet. Start the thread below.</div>
          }
          return content
        })()}
      </div>
      <div className="border-t p-3 flex items-center gap-2">
        {replyParentId && (
          <div className="text-xs text-gray-600 flex items-center gap-1">
            <span>Replying to</span>
            <span className="text-sm" title={replyParent?.content ?? replyParentId}>
              {truncateText(replyParent?.content ?? `node ${replyParentId.slice(0,6)}`, 20)}
            </span>
            <button className="underline" onClick={()=>setReplyParentId(undefined)}>clear</button>
          </div>
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
