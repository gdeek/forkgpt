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

  const selected: Message[] = []
  const added = new Set<string>()
  const pushMsg = (m?: Message) => { if (m && !added.has(m.id)) { selected.push(m); added.add(m.id) } }

  // 1) Main chat turns (enabled)
  const main = allMessages
    .filter(m => m.sessionId === session.id && !m.anchorMessageId)
    .sort((a, b) => a.createdAt - b.createdAt)
  // Main chat (user + assistant) is always included; limit applied below
  const enabledMain = main
  const limited = enabledMain.slice(-Math.max(0, mainTurnsLimit * 2))
  for (const m of limited) pushMsg(m)

  // 2) Ensure the anchor assistant and its immediate preceding user turn are present if included
  const anchor = idx.get(anchorMessageId)
  if (anchor?.includeInContext) {
    // preceding user before the anchor
    const anchorUser = [...main].reverse().find(m => m.createdAt <= (anchor?.createdAt ?? 0) && m.role === 'user')
    if (anchorUser?.includeInContext) pushMsg(anchorUser)
    pushMsg(anchor)
  }

  // 3) Reply branch up to parentId (enabled + ancestors enabled)
  const branchNodes = allMessages
    .filter(m => m.sessionId === session.id && m.anchorMessageId === anchorMessageId)
    .sort((a, b) => a.createdAt - b.createdAt)
  const effective = branchNodes.filter(n => isEffectivelyIncluded(n, idx))
  const toInclude: Message[] = []
  for (const n of effective) {
    // Ensure the user parent precedes an included assistant
    if (n.role === 'assistant' && n.parentId) {
      const p = idx.get(n.parentId)
      if (p?.role === 'user') pushMsg(p)
    }
    toInclude.push(n)
    if (parentId && n.id === parentId) break
  }
  for (const m of toInclude) pushMsg(m)

  // Convert to ChatMessages with optional system
  const out: ChatMessage[] = []
  if (session.systemPrompt) out.push({ role: 'system', content: session.systemPrompt })
  for (const m of selected) out.push({ role: m.role, content: m.content })

  // 4) Trim: first drop oldest from branch selection, then oldest main
  const branchIds = new Set(toInclude.map(m => m.id))
  while (countMessagesTokens(out) > maxTokens) {
    // find first non-system message that belongs to branchIds
    const start = session.systemPrompt ? 1 : 0
    const idxToRemove = out.findIndex((msg, i) => i >= start && branchIds.has(effectiveMessageIdOf(msg, selected)))
    if (idxToRemove > 0) {
      out.splice(idxToRemove, 1)
      continue
    }
    if (out.length > start + 1) {
      out.splice(start, 1) // drop oldest non-system
    } else {
      break
    }
  }
  return out
}

// Helper to map ChatMessage to original Message id by matching in-order content+role reference list.
// This is best-effort to support trimming logic without carrying ids in ChatMessage.
const effectiveMessageIdOf = (msg: ChatMessage, ordered: Message[]): string => {
  const found = ordered.find(m => m.role === msg.role && m.content === msg.content)
  return found ? found.id : ''
}

export interface BuildMainContextParams {
  session: Session
  allMessages: Message[]
  mainTurnsLimit?: number
  maxTokens?: number
}

export const buildMainContext = (params: BuildMainContextParams): ChatMessage[] => {
  const { session, allMessages, mainTurnsLimit = 6, maxTokens = 32000 } = params
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
  // Main chat (user + assistant) is always included; limit applied below
  const enabledMain = main
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
