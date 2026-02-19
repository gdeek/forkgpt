import React, { useMemo, useState } from 'react'
import { AppProvider, useApp } from './state/AppContext'
import { nanoid } from 'nanoid'
import type { Message, ReasoningEffortValue, Session } from './types'
import { buildMainContext, buildReplyContext } from './lib/contextBuilder'
import { streamResponse } from './lib/openaiClient'
import { UI_MODELS, getProviderForModel, getReasoningEffortForModel, getReasoningEffortOptions, mapUiModelToApi, supportsImages, supportsReasoningEffort, supportsTemperature, supportsWebSearch } from './lib/models'
import { generateSessionTitle } from './lib/titleGenerator'
import { ErrorBoundary } from './components/ErrorBoundary'
import { encryptString, decryptString } from './lib/crypto'
import { AttachmentPicker } from './components/AttachmentPicker'
import { MAX_ATTACHMENTS, MAX_TOTAL_BYTES, storeNewAttachment, prepareAttachmentParts, LARGE_FILE_SUMMARY_THRESHOLD, sniffKind } from './lib/attachments'
import type { AttachmentMeta } from './types'

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [webSearch, setWebSearch] = useState(false)
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

  // Apply theme to <html> for Tailwind dark mode
  React.useEffect(() => {
    const theme = state.ui.theme ?? 'light'
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark')
  }, [state.ui.theme])

  const sessionId = state.ui.activeSessionId ?? state.sessions[0]?.id

  const session = useMemo(() => state.sessions.find(s => s.id === sessionId), [state.sessions, sessionId])
  const messages = useMemo(() => state.messages.filter(m => m.sessionId === sessionId).sort((a,b)=>a.createdAt-b.createdAt), [state.messages, sessionId])
  const mainMessages = useMemo(() => messages.filter(m => !m.anchorMessageId), [messages])
  const anchorId = state.ui.activeReplyViewerAnchorId
  const hasSession = !!session

  const createSession = () => dispatch({ type: 'createSession' })
  // Guard against React.StrictMode double-effect and race on first load
  const ensuredFirstSession = React.useRef(false)
  React.useEffect(() => {
    if (ensuredFirstSession.current) return
    if (state.sessions.length === 0) createSession()
    ensuredFirstSession.current = true
  }, [state.sessions.length])
  const selectSession = (id: string) => dispatch({ type: 'selectSession', id })

  const providerName = (provider: 'openai' | 'anthropic' | 'gemini' | 'moonshot'): string => {
    if (provider === 'anthropic') return 'Anthropic'
    if (provider === 'gemini') return 'Google Gemini'
    if (provider === 'moonshot') return 'Moonshot'
    return 'OpenAI'
  }

  const getApiKeyForModel = (m: string): { key?: string; provider: 'openai' | 'anthropic' | 'gemini' | 'moonshot' } => {
    const provider = getProviderForModel(mapUiModelToApi(m))
    if (provider === 'anthropic') return { key: state.settings.anthropicApiKey?.trim(), provider }
    if (provider === 'gemini') return { key: state.settings.geminiApiKey?.trim(), provider }
    if (provider === 'moonshot') return { key: state.settings.moonshotApiKey?.trim(), provider }
    return { key: state.settings.apiKey?.trim(), provider }
  }

  const onSendMain = async () => {
    if (!session || !composer.trim()) return
    const { key, provider } = getApiKeyForModel(model)
    if (!key) {
      alert(`Set your ${providerName(provider)} API key in Settings`)
      return
    }
    // Limits
    if (pendingFiles.length > MAX_ATTACHMENTS) { alert(`Max ${MAX_ATTACHMENTS} attachments per message`); return }
    const totalBytes = pendingFiles.reduce((a,b)=>a+b.size,0)
    if (totalBytes > MAX_TOTAL_BYTES) { alert('Total attachments must be ≤ 50MB'); return }
    const isFirstMain = mainMessages.length === 0
    const userMsg: Message = {
      id: nanoid(),
      sessionId: session.id,
      role: 'user',
      content: composer,
      includeInContext: true,
      createdAt: Date.now(),
    }
    // Persist attachments to IDB and add metadata
    const metas: AttachmentMeta[] = []
    for (const f of pendingFiles) metas.push(await storeNewAttachment(userMsg.id, f))
    userMsg.attachments = metas

    dispatch({ type: 'addMessage', message: userMsg })
    dispatch({ type: 'touchSession', id: session.id })
    setComposer('')
    setPendingFiles([])

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

    const ctx = buildMainContext({
      session,
      allMessages: [...state.messages, userMsg],
      mainTurnsLimit: session?.mainTurnsLimit,
      maxTokens: session?.maxTokens,
    })
    const controller = new AbortController()
    setAborter(controller)
    setIsStreaming(true)
    try {
      // Optional 2-pass: summarize large text/PDF files (>25MB)
      const largeMetas = (userMsg.attachments ?? []).filter(m => (m.size > LARGE_FILE_SUMMARY_THRESHOLD) && (m.kind === 'text' || m.kind === 'pdf'))
      if (largeMetas.length) {
        const largeParts: any[] = []
        for (const m of largeMetas) largeParts.push(...await prepareAttachmentParts(userMsg.id, m))
        const summaryPrompt = { type: 'text', text: 'Summarize the following file(s) concisely (≤ 800 tokens), preserving structure, key entities, numbers, and code blocks where relevant. Output only the summary.' }
        await streamResponse({
          apiKey: getApiKeyForModel(model).key!,
          model: mapUiModelToApi(model),
          messages: [...ctx, { role: 'user', content: [summaryPrompt, ...largeParts] }],
          temperature: supportsTemperature(model) ? session?.temperature : undefined,
          reasoningEffort: supportsReasoningEffort(model) ? getReasoningEffortForModel(model, session?.reasoningEffort) : undefined,
          maxTokens: Math.min(1000, session?.maxTokens ?? 4000),
          enableWebSearch: webSearch && supportsWebSearch(model),
          onDelta: (delta) => {/* swallow - we will use summary only internally */},
          signal: controller.signal,
        })
        // Note: We are not streaming summary text to UI to keep UX clean.
      }

      // Build user parts: file text chunks first, then images, then the question text
      const parts: any[] = []
      const textFirst: AttachmentMeta[] = (userMsg.attachments ?? []).filter(a=>a.kind==='text' || a.kind==='pdf')
      for (const m of textFirst) parts.push(...await prepareAttachmentParts(userMsg.id, m))
      const imageMetas = (userMsg.attachments ?? []).filter(a=>a.kind==='image' && supportsImages(model))
      for (const m of imageMetas) parts.push(...await prepareAttachmentParts(userMsg.id, m))
      parts.push({ type: 'text', text: userMsg.content })

      await streamResponse({
        apiKey: getApiKeyForModel(model).key!,
        model: mapUiModelToApi(model),
        messages: [...ctx, { role: 'user', content: parts }],
        temperature: supportsTemperature(model) ? session?.temperature : undefined,
        reasoningEffort: supportsReasoningEffort(model) ? getReasoningEffortForModel(model, session?.reasoningEffort) : undefined,
        maxTokens: session?.maxTokens,
        enableWebSearch: webSearch && supportsWebSearch(model),
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
    if (isFirstMain) {
      try {
        const { key } = getApiKeyForModel(model)
        if (key) {
          const title = await generateSessionTitle(key, userMsg.content, mapUiModelToApi(model))
          dispatch({ type: 'renameSession', id: session.id, title })
        }
      } catch {
        // ignore title errors
      }
    }
  }

  const stop = () => aborter?.abort()

  const onReply = (anchor: string) => dispatch({ type: 'setActiveReplyAnchor', anchorId: anchor })

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b bg-white dark:bg-gray-900 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
        <div className="font-semibold">ForkGPT</div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <SettingsButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden" ref={containerRef}>
        <SessionSidebar />
        <main className="flex-1 flex flex-col bg-white dark:bg-gray-900">
          {hasSession && (
            <div className="border-b dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
              <SystemPromptPanel currentModel={model} />
            </div>
          )}
          <div className="flex-1 overflow-auto p-4 space-y-3 bg-white dark:bg-gray-900">
            {hasSession ? (
              mainMessages.map(m => (
                <div key={m.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-3">
                  <div className="text-xs text-gray-500 mb-1">{m.role}{m.model ? ` · ${m.model}` : ''}</div>
                  <div className="whitespace-pre-wrap">{m.content || <span className="text-gray-400">…</span>}</div>
                  {/* Main chat messages are always included in context now. */}
                  {m.role === 'assistant' && !m.anchorMessageId && (
                    <div className="mt-2">
                      <button className="text-sm px-2 py-1 border rounded" onClick={()=>onReply(m.id)}>Reply →</button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">Create a session to start chatting.</div>
            )}
          </div>
          {hasSession && (
            <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <select className="border rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700" value={model} onChange={e=>setModel(e.target.value as any)}>
                  {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <div className="flex-1 flex items-center gap-3">
                  <AttachmentPicker compact pending={pendingFiles} metas={[]} onSelectFiles={(files)=>{
                    const arr = Array.from(files as Array<File>).filter(f=> sniffKind(f.type, f.name) !== 'other')
                    if (arr.length !== (files as Array<File>).length) alert('Some files were skipped because their type is not supported for context.')
                    const merged = [...pendingFiles, ...arr]
                    const total: number = merged.reduce((a,b:File)=>a+b.size,0)
                    if (merged.length > MAX_ATTACHMENTS) { alert(`Max ${MAX_ATTACHMENTS} attachments per message`); return }
                    if (total > MAX_TOTAL_BYTES) { alert('Total attachments must be ≤ 50MB'); return }
                    setPendingFiles(merged)
                  }} onRemovePending={(i)=> setPendingFiles(prev=>prev.filter((_,idx)=>idx!==i))} />
                  <label className="text-sm flex items-center gap-1 select-none">
                    <input type="checkbox" className="mr-1" checked={webSearch} onChange={e=>setWebSearch(e.target.checked)} />
                    <span>Search</span>
                  </label>
                </div>
              </div>
              <textarea
                className="border rounded flex-1 p-2 min-h-[60px] bg-white dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
                placeholder="Type your message"
                value={composer}
                onChange={e=>setComposer(e.target.value)}
                onKeyDown={(e)=>{
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!isStreaming) onSendMain()
                  }
                }}
              />
              <div className="flex items-center gap-2">
                {!isStreaming ? (
                  <button className="px-3 py-2 bg-black text-white rounded" onClick={onSendMain}>Send</button>
                ) : (
                  <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={stop}>Stop</button>
                )}
              </div>
            </div>
          )}
        </main>
        {hasSession && anchorId && (
          <div
            className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 cursor-col-resize"
            onMouseDown={startResize}
            title="Drag to resize"
          />
        )}
        {hasSession && (
          <ErrorBoundary>
            <ReplyViewer width={rvWidth} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}

  const SystemPromptPanel: React.FC<{ currentModel: string }> = ({ currentModel }) => {
  const { state, dispatch } = useApp()
  const sessionId = state.ui.activeSessionId ?? state.sessions[0]?.id
  const session = state.sessions.find(s => s.id === sessionId)
  const [open, setOpen] = useState(true)
  const reasoningOptions = getReasoningEffortOptions(currentModel)
  const reasoningValue = getReasoningEffortForModel(currentModel, session?.reasoningEffort)
  if (!session) return null
  return (
    <div>
      <button className="text-sm underline" onClick={()=>setOpen(o=>!o)}>{open ? 'Hide' : 'Show'} system settings</button>
      {open && (
        <>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 items-center">
            {supportsTemperature(currentModel) && (
              <label className="text-sm flex items-center gap-2">
                <span className="whitespace-nowrap">Temperature</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={Math.min(1, Math.max(0, session.temperature ?? 0.5))}
                  className="flex-1 w-full max-w-[360px]"
                  onChange={e=>dispatch({ type: 'setSessionTemperature', id: session.id, temperature: Number(e.target.value) })}
                />
                <span className="text-xs text-gray-600 w-8">{(Math.min(1, Math.max(0, session.temperature ?? 0.7))).toFixed(1)}</span>
              </label>
            )}
            {supportsReasoningEffort(currentModel) && (
              <label className="text-sm flex items-center gap-2">
                <span className="whitespace-nowrap">Reasoning effort</span>
                <select
                  className="border rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                  value={reasoningValue ?? reasoningOptions[0] ?? ''}
                  onChange={e=>dispatch({ type: 'setSessionReasoningEffort', id: session.id, effort: e.target.value as ReasoningEffortValue })}
                >
                  {reasoningOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm flex items-center gap-2">
              <span className="whitespace-nowrap flex items-center gap-1">
                Main turns limit
                <span title="Always include this many recent main chat user+assistant pairs. ReplyViewer selections are extra and don’t count toward this limit. Oldest main pairs drop first; if Max Tokens is exceeded, replies are trimmed before main pairs." className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-xs text-gray-600">i</span>
              </span>
              <input
                type="number"
                min={0}
                max={10}
                className="border rounded px-2 py-1 w-20 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                value={session.mainTurnsLimit ?? 6}
                onChange={e=>dispatch({ type: 'setSessionMainTurnsLimit', id: session.id, value: Math.min(10, Math.max(0, Number(e.target.value))) })}
              />
            </label>
            <label className="text-sm flex items-center gap-2">
              <span className="whitespace-nowrap">Max tokens</span>
              <input
                type="number"
                min={1000}
                max={128000}
                step={1000}
                className="border rounded px-2 py-1 w-28 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                value={session.maxTokens ?? 8000}
                onChange={e=>dispatch({ type: 'setSessionMaxTokens', id: session.id, value: Math.min(128000, Math.max(1000, Number(e.target.value))) })}
              />
            </label>
          </div>
          <textarea className="border rounded w-full p-2 mt-2 bg-white dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="System prompt" value={session.systemPrompt ?? ''} onChange={e=>dispatch({ type: 'setSystemPrompt', id: session.id, prompt: e.target.value })} />
        </>
      )}
    </div>
  )
}

const SettingsButton: React.FC = () => {
  const { state, dispatch } = useApp()
  const [open, setOpen] = useState(false)
  // Inputs (only used in "set" and "unlock" flows); never pre-fill with plaintext
  const [apiKey, setApiKey] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)

  const hasEncrypted = !!state.settings.apiKeyEncrypted
  const isUnlocked = !!state.settings.apiKey

  // Compute which view to show based on state + replace toggle
  const view: 'set' | 'unlock' | 'unlocked' = replaceMode ? 'set' : (hasEncrypted ? (isUnlocked ? 'unlocked' : 'unlock') : 'set')

  // Re-sync modal mode and inputs when opened or settings change
  React.useEffect(() => {
    if (!open) return
    // Always reset inputs when opening settings
    setApiKey('')
    setPassword('')
    setReplaceMode(false)
  }, [open])
  return (
    <>
      <button className="px-2 py-1 border rounded" onClick={()=>setOpen(true)}>Settings</button>
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 dark:text-gray-100 rounded border dark:border-gray-700 p-4 w-[460px]" role="dialog" aria-modal="true" aria-label="Settings">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Settings</div>
              <button
                className="px-2 py-1 border rounded text-sm"
                onClick={()=>setOpen(false)}
                title="Close"
              >x</button>
            </div>
            <div className="space-y-6">
              <KeySection
                title="OpenAI"
                unlockedField="apiKey"
                encryptedField="apiKeyEncrypted"
                placeholder="sk-..."
                onClose={()=>setOpen(false)}
              />
              <div className="border-t dark:border-gray-700" />
              <KeySection
                title="Anthropic"
                unlockedField="anthropicApiKey"
                encryptedField="anthropicApiKeyEncrypted"
                placeholder="sk-ant-..."
                onClose={()=>setOpen(false)}
              />
              <div className="border-t dark:border-gray-700" />
              <KeySection
                title="Google Gemini"
                unlockedField="geminiApiKey"
                encryptedField="geminiApiKeyEncrypted"
                placeholder="AIza..."
                onClose={()=>setOpen(false)}
              />
              <div className="border-t dark:border-gray-700" />
              <KeySection
                title="Moonshot"
                unlockedField="moonshotApiKey"
                encryptedField="moonshotApiKeyEncrypted"
                placeholder="sk-..."
                onClose={()=>setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const ThemeToggle: React.FC = () => {
  const { state, dispatch } = useApp()
  const theme = state.ui.theme ?? 'light'
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      className="px-2 py-1 border rounded text-sm"
      onClick={()=>dispatch({ type: 'setTheme', theme: next })}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
    >{theme === 'dark' ? '☀️' : '🌙'}</button>
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
  const exportSessions = () => {
    try {
      const sanitizedSessions = state.sessions.map(session => {
        const sessionMessages = state.messages
          .filter(m => m.sessionId === session.id)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map(m => {
            const { attachments, ...base } = m
            if (!attachments || attachments.length === 0) return base
            return {
              ...base,
              attachments: attachments.map(({ previewDataUrl, ...meta }) => meta),
            }
          })
        return { ...session, messages: sessionMessages }
      })

      const now = new Date()
      const pad = (val: number) => String(val).padStart(2, '0')
      const filename = `forkgpt_sessions_${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}.json`
      const payload = {
        exportedAt: now.toISOString(),
        sessions: sanitizedSessions,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (err) {
      console.error('Failed to export sessions', err)
      const message = err instanceof Error ? err.message : String(err)
      alert(`Failed to export sessions: ${message}`)
    }
  }

  const validateImportFile = (data: any): { sessions: Session[]; messages: Message[] } => {
    // check if it's a valid export format
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid file format')
    }

    if (!data.exportedAt || !data.sessions || !Array.isArray(data.sessions)) {
      throw new Error('Not a valid ForkGPT sessions export file')
    }

    // Validate sessions structure
    const sessions: Session[] = []
    const messages: Message[] = []

    for (const sessionData of data.sessions) {
      if (!sessionData.id || !sessionData.title || typeof sessionData.createdAt !== 'number') {
        throw new Error('Invalid session structure in import file')
      }

      // Extract session without messages
      const { messages: sessionMessages, ...session } = sessionData
      sessions.push(session as Session)

      // Validate and extract messages
      if (sessionMessages && Array.isArray(sessionMessages)) {
        for (const msg of sessionMessages) {
          if (!msg.id || !msg.sessionId || !msg.role || !msg.content || typeof msg.createdAt !== 'number') {
            throw new Error('Invalid message structure in import file')
          }
          messages.push(msg as Message)
        }
      }
    }

    return { sessions, messages }
  }

  const importSessions = (file: File) => {
    // validate filename
    if (!file.name.startsWith('forkgpt_sessions')) {
      alert('Invalid file. Please select a file that starts with "forkgpt_sessions"')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content)
        const { sessions, messages } = validateImportFile(data)

        // show confirmation dialog
        const confirmMessage = `This will replace all ${state.sessions.length} existing sessions with ${sessions.length} imported sessions. All current chat history will be lost.\n\nRecommendation: Export your current sessions first!\n\nProceed with import?`

        if (window.confirm(confirmMessage)) {
          dispatch({ type: 'importSessions', sessions, messages })
          alert(`Successfully imported ${sessions.length} sessions with ${messages.length} messages!`)
        }
      } catch (err) {
        console.error('Failed to import sessions', err)
        const message = err instanceof Error ? err.message : String(err)
        alert(`Failed to import sessions: ${message}`)
      }
    }
    reader.readAsText(file)
  }

  const handleImportClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) importSessions(file)
    }
    input.click()
  }

  return (
    <aside className="w-[260px] border-r dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col">
      <div className="p-2 border-b dark:border-gray-700 flex items-center justify-between">
        <div className="text-sm font-medium">Sessions</div>
        <button className="px-2 py-1 border rounded text-sm" onClick={create}>New</button>
      </div>
      <div className="flex-1 overflow-auto">
        {sessions.map(s => (
          <div key={s.id} className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${s.id===activeId?'bg-white dark:bg-gray-800 border-l-4 border-black':''}`} onClick={()=>select(s.id)}>
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
      <div className="p-2 border-t dark:border-gray-700">
        <div className="flex gap-2">
          <button className="flex-1 px-2 py-1 border rounded text-sm" onClick={exportSessions}>Export</button>
          <button className="flex-1 px-2 py-1 border rounded text-sm" onClick={handleImportClick}>Import</button>
        </div>
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [replySearch, setReplySearch] = useState(false)
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
        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <button className="h-5 w-5 grid place-items-center border rounded" onClick={()=>toggleCollapse(n.id)} aria-label={collapsed.has(n.id)?'Expand':'Collapse'}>
              {collapsed.has(n.id) ? '+' : '−'}
            </button>
            <div>{n.role}</div>
          </div>
          {!collapsed.has(n.id) && (
            <>
              <div className={`mt-1 whitespace-pre-wrap ${depth >= 1 ? 'text-[13px] leading-5' : 'text-sm leading-6'}`}>{n.content || <span className='text-gray-400'>…</span>}</div>
              {n.role === 'assistant' && (
                <div className="mt-2 flex items-center gap-3">
                  <label className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!!n.includeInContext}
                      onClick={(e)=>{
                        const target = e.currentTarget as HTMLInputElement
                        toggleInclude(n.id, target.checked, e as any)
                      }}
                    />
                    <span className="flex items-center gap-1">Include in context</span>
                  </label>
                  <button className="text-xs px-2 py-1 border rounded" onClick={()=>setReplyParentId(n.id)}>Reply</button>
                </div>
              )}
              <div className="mt-2 ml-3 pl-3 border-l border-gray-200 dark:border-gray-700 space-y-2">
                {renderTree(n.id, depth + 1)}
              </div>
            </>
          )}
        </div>
      </div>
    ))
  }

  const onClose = () => dispatch({ type: 'setActiveReplyAnchor', anchorId: undefined })

  const toggleInclude = (id: string, next: boolean, ev?: MouseEvent) => {
    // operate only on this branch's messages to avoid cross-anchor changes
    const branchMessages = state.messages.filter(m => m.sessionId === session.id && m.anchorMessageId === anchorId)
    const optionOnly = !!(ev && (ev as any).altKey)
    if (optionOnly) {
      dispatch({ type: 'updateMessage', id, patch: { includeInContext: next } })
      return
    }
    // BFS through descendants (max depth 25) and toggle the entire subtree
    const ids: string[] = []
    const byParent = new Map<string, string[]>()
    for (const m of branchMessages) {
      if (!m.parentId) continue
      const arr = byParent.get(m.parentId) || []
      arr.push(m.id)
      byParent.set(m.parentId, arr)
    }
    const q: Array<{ id: string; d: number }> = [{ id, d: 0 }]
    while (q.length) {
      const { id: cur, d } = q.shift()!
      ids.push(cur)
      if (d >= 25) continue
      for (const childId of byParent.get(cur) || []) q.push({ id: childId, d: d + 1 })
    }
    dispatch({ type: 'setIncludeInContextBulk', ids, include: next })
  }

  const onSendReply = async (parentId?: string) => {
    if (!replyText.trim()) return
    const { key, provider } = getApiKeyForModel(anchor.model ?? 'gpt-5.2')
    if (!key) { alert(`Set your ${providerName(provider)} API key in Settings`); return }
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
    // Attachments for reply (same limits)
    if (pendingFiles.length > MAX_ATTACHMENTS) { alert(`Max ${MAX_ATTACHMENTS} attachments per message`); return }
    const totalBytes = pendingFiles.reduce((a,b)=>a+b.size,0)
    if (totalBytes > MAX_TOTAL_BYTES) { alert('Total attachments must be ≤ 50MB'); return }
    // Persist attachments to IDB
    const metas: AttachmentMeta[] = []
    for (const f of pendingFiles) metas.push(await storeNewAttachment(user.id, f))
    user.attachments = metas
    dispatch({ type: 'addMessage', message: user })
    setReplyText('')
    setPendingFiles([])
    const assistant: Message = {
      id: nanoid(), sessionId: session.id, role: 'assistant', content: '', includeInContext: false, createdAt: Date.now(), anchorMessageId: anchorId, parentId: user.id, model: anchor.model ?? 'gpt-5.2',
    }
    dispatch({ type: 'addMessage', message: assistant })

    const ctx = buildReplyContext({
      session,
      allMessages: [...state.messages, user],
      anchorMessageId: anchorId,
      parentId: user.id,
      mainTurnsLimit: session?.mainTurnsLimit,
      maxTokens: session?.maxTokens,
    })
    const controller = new AbortController()
    setAborter(controller)
    setIsStreaming(true)
    try {
      // 2-pass summarize for large files in replies
      const largeMetas = (user.attachments ?? []).filter(m => (m.size > LARGE_FILE_SUMMARY_THRESHOLD) && (m.kind === 'text' || m.kind === 'pdf'))
      if (largeMetas.length) {
        const largeParts: any[] = []
        for (const m of largeMetas) largeParts.push(...await prepareAttachmentParts(user.id, m))
        const summaryPrompt = { type: 'text', text: 'Summarize the following file(s) concisely (≤ 800 tokens), preserving structure, key entities, numbers, and code blocks where relevant. Output only the summary.' }
        await streamResponse({
          apiKey: key!,
          model: mapUiModelToApi(assistant.model!),
          messages: [...ctx, { role: 'user', content: [summaryPrompt, ...largeParts] }],
          temperature: supportsTemperature(assistant.model!) ? session?.temperature : undefined,
          reasoningEffort: supportsReasoningEffort(assistant.model!) ? getReasoningEffortForModel(assistant.model!, session?.reasoningEffort) : undefined,
          maxTokens: Math.min(1000, session?.maxTokens ?? 4000),
          enableWebSearch: replySearch && supportsWebSearch(assistant.model || ''),
          onDelta: ()=>{},
          signal: controller.signal,
        })
      }
      // Build user parts (text/pdf first, then images, then message text)
      const parts: any[] = []
      const textFirst: AttachmentMeta[] = (user.attachments ?? []).filter(a=>a.kind==='text' || a.kind==='pdf')
      for (const m of textFirst) parts.push(...await prepareAttachmentParts(user.id, m))
      const imageMetas = (user.attachments ?? []).filter(a=>a.kind==='image' && supportsImages(assistant.model || ''))
      for (const m of imageMetas) parts.push(...await prepareAttachmentParts(user.id, m))
      parts.push({ type: 'text', text: user.content })

      await streamResponse({
        apiKey: key!,
        model: mapUiModelToApi(assistant.model!),
        messages: [...ctx, { role: 'user', content: parts }],
        temperature: supportsTemperature(assistant.model!) ? session?.temperature : undefined,
        reasoningEffort: supportsReasoningEffort(assistant.model!) ? getReasoningEffortForModel(assistant.model!, session?.reasoningEffort) : undefined,
        maxTokens: session?.maxTokens,
        enableWebSearch: replySearch && supportsWebSearch(assistant.model || ''),
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
    <aside className="border-l dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col" style={{ width }}>
      <div className="p-3 border-b dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span>Replying to</span>
            <span
              title="'Include in context' click toggles the entire reply subtree of a message. Option/Alt-click toggles only that message."
              className="inline-flex items-center justify-center w-3 h-3 rounded-full border text-[10px] leading-none text-gray-600 align-middle"
              aria-label="Include in context behavior"
            >i</span>
          </div>
          <div className="text-sm" title={anchor.content}>{truncateText(anchor.content, 20)}</div>
        </div>
        <button className="px-2 py-1 border rounded" onClick={onClose}>Close</button>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2 bg-white dark:bg-gray-900">
        {(() => {
          const content = renderTree(undefined, 0)
          if (Array.isArray(content) && content.length === 0) {
            return <div className="text-sm text-gray-500">No replies yet. Start the thread below.</div>
          }
          return content
        })()}
      </div>
      <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2">
        {replyParentId && (
          <div className="text-xs text-gray-600 flex items-center gap-1">
            <span>Replying to</span>
            <span className="text-sm" title={replyParent?.content ?? replyParentId}>
              {truncateText(replyParent?.content ?? `node ${replyParentId.slice(0,6)}`, 20)}
            </span>
            <button className="underline" onClick={()=>setReplyParentId(undefined)}>clear</button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <AttachmentPicker compact pending={pendingFiles} metas={[]} onSelectFiles={(files)=>{
            const arr = Array.from(files as Array<File>).filter(f=> sniffKind(f.type, f.name) !== 'other')
            if (arr.length !== (files as Array<File>).length) alert('Some files were skipped because their type is not supported for context.')
            const merged = [...pendingFiles, ...arr]
            const total: number = merged.reduce((a,b:File)=>a+b.size,0)
            if (merged.length > MAX_ATTACHMENTS) { alert(`Max ${MAX_ATTACHMENTS} attachments per message`); return }
            if (total > MAX_TOTAL_BYTES) { alert('Total attachments must be ≤ 50MB'); return }
            setPendingFiles(merged)
          }} onRemovePending={(i)=> setPendingFiles(prev=>prev.filter((_,idx)=>idx!==i))} />
          <label className="text-sm flex items-center gap-1 select-none">
            <input type="checkbox" className="mr-1" checked={replySearch} onChange={e=>setReplySearch(e.target.checked)} />
            <span>Search</span>
          </label>
        </div>
        <textarea
          className="border rounded flex-1 p-2 min-h-[60px] bg-white dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
          placeholder="Type a reply"
          value={replyText}
          onChange={e=>setReplyText(e.target.value)}
          onKeyDown={(e)=>{
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!isStreaming) onSendReply(replyParentId)
            }
          }}
        />
        <div className="flex items-center gap-2">
          {!isStreaming ? (
            <button className="px-3 py-2 bg-black text-white rounded inline-flex" onClick={()=>onSendReply(replyParentId)}>Send</button>
          ) : (
            <button className="px-3 py-2 bg-red-600 text-white rounded inline-flex" onClick={stop}>Stop</button>
          )}
        </div>
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

// reusable key management panel for providers
const KeySection: React.FC<{
  title: string
  unlockedField: 'apiKey' | 'anthropicApiKey' | 'geminiApiKey' | 'moonshotApiKey'
  encryptedField: 'apiKeyEncrypted' | 'anthropicApiKeyEncrypted' | 'geminiApiKeyEncrypted' | 'moonshotApiKeyEncrypted'
  placeholder: string
  onClose: () => void
}> = ({ title, unlockedField, encryptedField, placeholder, onClose }) => {
  const { state, dispatch } = useApp()
  const [key, setKey] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)

  const hasEncrypted = !!(state.settings as any)[encryptedField]
  const isUnlocked = !!(state.settings as any)[unlockedField]
  const view: 'set' | 'unlock' | 'unlocked' = replaceMode ? 'set' : (hasEncrypted ? (isUnlocked ? 'unlocked' : 'unlock') : 'set')

  return (
    <div>
      <div className="font-semibold mb-2">{title}</div>
      {view === 'unlock' ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">An encrypted {title} API key is stored. Enter password to unlock for this session.</div>
          <label className="text-sm">Password</label>
          <input className="border rounded w-full p-2 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 placeholder:text-gray-500 dark:placeholder:text-gray-400" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <div className="mt-3 flex justify-between items-center">
            <button className="text-xs underline" onClick={()=>{ setReplaceMode(true); setPassword('') }}>Replace key…</button>
            <div className="flex gap-2">
              <button className="px-2 py-1" onClick={onClose}>Cancel</button>
              <button className="px-2 py-1 bg-black text-white rounded" disabled={busy || !password} onClick={async ()=>{
                const encVal = (state.settings as any)[encryptedField]
                if (!encVal) return
                try {
                  setBusy(true)
                  const plain = (await decryptString(encVal as string, password)).trim()
                  dispatch({ type: 'setSettings', settings: { [unlockedField]: plain } as any })
                  setPassword('')
                } catch {
                  alert('Decryption failed. Check password.')
                } finally { setBusy(false) }
              }}>Unlock</button>
            </div>
          </div>
        </div>
      ) : view === 'unlocked' ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">{title} API key is unlocked for this session.</div>
          <div className="flex justify-between items-center">
            <button className="text-xs underline" onClick={()=>{ setReplaceMode(true); setKey(''); setPassword('') }}>Replace key…</button>
            <div className="flex gap-2">
              <button
                className="px-2 py-1 bg-black text-white rounded"
                onClick={()=>{
                  dispatch({ type: 'setSettings', settings: { [unlockedField]: undefined } as any })
                  setKey(''); setPassword('');
                }}
              >Lock now</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-sm">{title} API Key</label>
          <input
            className="border rounded w-full p-2 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 placeholder:text-gray-500 dark:placeholder:text-gray-400"
            value={key}
            onChange={e=>setKey(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
          />
          <label className="text-sm">Set Password (required)</label>
          <input className="border rounded w-full p-2 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 placeholder:text-gray-500 dark:placeholder:text-gray-400" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password to encrypt key" />
          <div className="text-xs text-gray-500">Your password is not stored; losing it means re-entering the key.</div>
          <div className="mt-3 flex justify-between items-center">
            {hasEncrypted && !replaceMode && <button className="text-xs underline" onClick={()=>{ setReplaceMode(false); setKey(''); setPassword('') }}>Unlock existing…</button>}
            <div className="flex gap-2">
              <button className="px-2 py-1" onClick={onClose}>Cancel</button>
              <button className="px-2 py-1 bg-black text-white rounded" disabled={busy || !key || !password} onClick={async ()=>{
                try {
                  setBusy(true)
                  const enc = await encryptString(key.trim(), password)
                  dispatch({ type: 'setSettings', settings: { [encryptedField]: enc, [unlockedField]: undefined } as any })
                  setKey('')
                  setPassword('')
                  setReplaceMode(false)
                } catch {
                  alert('Encryption failed')
                } finally { setBusy(false) }
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
