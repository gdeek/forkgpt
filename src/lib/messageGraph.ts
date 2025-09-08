import type { Message } from '../types'

export const indexById = (messages: Message[]): Map<string, Message> => {
  const map = new Map<string, Message>()
  for (const m of messages) map.set(m.id, m)
  return map
}

export const childrenByParent = (messages: Message[]): Map<string, Message[]> => {
  const map = new Map<string, Message[]>()
  for (const m of messages) {
    if (!m.parentId) continue
    const arr = map.get(m.parentId) || []
    arr.push(m)
    map.set(m.parentId, arr)
  }
  // stable order by createdAt asc
  for (const arr of map.values()) arr.sort((a, b) => a.createdAt - b.createdAt)
  return map
}

export const byAnchor = (messages: Message[]): Map<string, Message[]> => {
  const map = new Map<string, Message[]>()
  for (const m of messages) {
    if (!m.anchorMessageId) continue
    const arr = map.get(m.anchorMessageId) || []
    arr.push(m)
    map.set(m.anchorMessageId, arr)
  }
  for (const arr of map.values()) arr.sort((a, b) => a.createdAt - b.createdAt)
  return map
}

export const getDescendants = (rootId: string, childrenIndex: Map<string, Message[]>): Message[] => {
  const out: Message[] = []
  const stack = [...(childrenIndex.get(rootId) || [])]
  while (stack.length) {
    const n = stack.shift()!
    out.push(n)
    const kids = childrenIndex.get(n.id) || []
    for (const k of kids) stack.push(k)
  }
  return out
}

export const getAncestorChain = (node: Message, idx: Map<string, Message>): Message[] => {
  const chain: Message[] = []
  let cur: Message | undefined = node
  while (cur?.parentId) {
    const parent = idx.get(cur.parentId)
    if (!parent) break
    chain.unshift(parent)
    cur = parent
  }
  return chain
}

