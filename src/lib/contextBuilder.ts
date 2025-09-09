import type { Message, Session } from '../types'
import { indexById } from './messageGraph'
import { isEffectivelyIncluded } from './cascade'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const approxTokenCount = (text: string): number => {
  // crude approximation: 1 token ~ 4 chars
  return Math.ceil(text.length / 4)
}

const countMessagesTokens = (msgs: ChatMessage[]): number => msgs.reduce((acc, m) => acc + approxTokenCount(m.content), 0)

export interface BuildReplyContextParams {
  session: Session
  allMessages: Message[]
  anchorMessageId: string
  parentId?: string
  mainTurnsLimit?: number
  maxTokens?: number
}

export const buildReplyContext = (params: BuildReplyContextParams): ChatMessage[] => {
  const { session, allMessages, anchorMessageId, parentId, mainTurnsLimit = 2, maxTokens = 8000 } = params
  const idx = indexById(allMessages)
  const out: ChatMessage[] = []

  if (session.systemPrompt) out.push({ role: 'system', content: session.systemPrompt })

  // main chat turns: include enabled user+assistant pairs (oldest -> newest)
  const main = allMessages
    .filter(m => m.sessionId === session.id && !m.anchorMessageId)
    .sort((a, b) => a.createdAt - b.createdAt)

  const enabledMain = main.filter(m => m.includeInContext)
  const limited = enabledMain.slice(-Math.max(0, mainTurnsLimit * 2))
  for (const m of limited) out.push({ role: m.role, content: m.content })

  // reply branch: include enabled chain up to parentId
  const branchNodes = allMessages
    .filter(m => m.sessionId === session.id && m.anchorMessageId === anchorMessageId)
    .sort((a, b) => a.createdAt - b.createdAt)

  const effective = branchNodes.filter(n => isEffectivelyIncluded(n, idx))

  const toInclude: Message[] = []
  for (const n of effective) {
    toInclude.push(n)
    if (parentId && n.id === parentId) break
  }

  for (const m of toInclude) out.push({ role: m.role, content: m.content })

  // trim if needed: drop oldest from branch first, then main
  const branchStartIdx = out.length - toInclude.length
  while (countMessagesTokens(out) > maxTokens && toInclude.length) {
    // remove oldest branch message
    toInclude.shift()
    out.splice(branchStartIdx, 1)
  }
  let mainCount = limited.length
  while (countMessagesTokens(out) > maxTokens && mainCount > 0) {
    // remove oldest main
    const sysOffset = session.systemPrompt ? 1 : 0
    out.splice(sysOffset, 1)
    mainCount--
  }

  return out
}

export interface BuildMainContextParams {
  session: Session
  allMessages: Message[]
  mainTurnsLimit?: number
  maxTokens?: number
}

export const buildMainContext = (params: BuildMainContextParams): ChatMessage[] => {
  const { session, allMessages, mainTurnsLimit = 6, maxTokens = 8000 } = params
  const idx = indexById(allMessages)
  const out: ChatMessage[] = []
  if (session.systemPrompt) out.push({ role: 'system', content: session.systemPrompt })

  // include enabled reply branches (anchor chronological order, root->leaf of enabled nodes)
  const anchors = allMessages
    .filter(m => m.sessionId === session.id && m.role === 'assistant' && !m.parentId && !m.anchorMessageId)
    .sort((a, b) => a.createdAt - b.createdAt)

  const branchesByAnchor = new Map<string, Message[]>()
  for (const m of allMessages.filter(m => m.sessionId === session.id && m.anchorMessageId)) {
    const arr = branchesByAnchor.get(m.anchorMessageId!) || []
    arr.push(m)
    branchesByAnchor.set(m.anchorMessageId!, arr)
  }
  for (const arr of branchesByAnchor.values()) arr.sort((a, b) => a.createdAt - b.createdAt)

  // order anchors by time
  const orderedAnchors = [...branchesByAnchor.keys()].sort((a, b) => {
    const A = idx.get(a)?.createdAt ?? 0
    const B = idx.get(b)?.createdAt ?? 0
    return A - B
  })

  for (const a of orderedAnchors) {
    const nodes = (branchesByAnchor.get(a) || []).filter(n => isEffectivelyIncluded(n, idx))
    for (const n of nodes) out.push({ role: n.role, content: n.content })
  }

  // main chat turns
  const main = allMessages
    .filter(m => m.sessionId === session.id && !m.anchorMessageId)
    .sort((a, b) => a.createdAt - b.createdAt)
  const enabledMain = main.filter(m => m.includeInContext)
  const limited = enabledMain.slice(-Math.max(0, mainTurnsLimit * 2))
  for (const m of limited) out.push({ role: m.role, content: m.content })

  // trim: branch-first then main
  let branchCount = out.length - limited.length - (session.systemPrompt ? 1 : 0)
  while (out.length && countMessagesTokens(out) > maxTokens && branchCount > 0) {
    const sysOffset = session.systemPrompt ? 1 : 0
    if (out.length > sysOffset) {
      out.splice(sysOffset, 1) // drop oldest branch node
      branchCount--
    } else {
      break
    }
  }
  let mainCount = limited.length
  while (out.length && countMessagesTokens(out) > maxTokens && mainCount > 0) {
    const cutAt = out.length - mainCount
    out.splice(cutAt, 1)
    mainCount--
  }

  return out
}
