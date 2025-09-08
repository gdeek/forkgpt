import { buildMainContext, buildReplyContext } from '../src/lib/contextBuilder'

const mk = (id: string, extra: Partial<any> = {}) => ({ id, sessionId: 's1', role: 'user' as const, content: id, includeInContext: true, createdAt: Date.now(), ...extra })

describe('context builder', () => {
  const session = { id: 's1', title: 't', createdAt: 1, lastActiveAt: 1, systemPrompt: 'sys' }

  test('reply context includes branch first and trims branch oldest', () => {
    const anchor = mk('a1', { role: 'assistant' as const, model: 'gpt-40' })
    const r1 = mk('r1', { anchorMessageId: 'a1' })
    const r2 = mk('r2', { anchorMessageId: 'a1', parentId: 'r1' })
    const all = [anchor, r1, r2]
    const ctx = buildReplyContext({ session, allMessages: all, anchorMessageId: 'a1', parentId: 'r2', maxTokens: 2 })
    // sys + at most one reply due to trimming; branch messages trimmed first
    expect(ctx[0].role).toBe('system')
    expect(ctx.length).toBe(2)
  })

  test('main context includes enabled reply branches and main', () => {
    const a1 = mk('a1', { role: 'assistant' as const })
    const r1 = mk('r1', { anchorMessageId: 'a1', includeInContext: true })
    const u1 = mk('u1', { role: 'user' as const })
    const as1 = mk('as1', { role: 'assistant' as const })
    const all = [a1, r1, u1, as1]
    const ctx = buildMainContext({ session, allMessages: all, mainTurnsLimit: 1 })
    const roles = ctx.map(m => m.role)
    expect(roles[0]).toBe('system')
    expect(roles).toContain('user')
    expect(roles).toContain('assistant')
  })
})

