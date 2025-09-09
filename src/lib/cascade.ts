import type { Message } from '../types'
import { childrenByParent } from './messageGraph'

export const cascadeDisable = (messages: Message[], rootId: string): Message[] => {
  const byParent = childrenByParent(messages)
  const toDisable = new Set<string>()
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()!
    toDisable.add(id)
    for (const child of byParent.get(id) || []) {
      queue.push(child.id)
    }
  }
  return messages.map(m => toDisable.has(m.id) ? { ...m, includeInContext: false } : m)
}

export const setIncludeFlag = (messages: Message[], id: string, include: boolean): Message[] => {
  if (!include) return cascadeDisable(messages, id)
  return messages.map(m => (m.id === id ? { ...m, includeInContext: true } : m))
}

export const isEffectivelyIncluded = (node: Message, _messagesIndex: Map<string, Message>): boolean => {
  // include a reply if its own toggle is ON. ancestors do not need to be included.
  return !!node.includeInContext
}
