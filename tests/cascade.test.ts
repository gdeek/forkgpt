import { cascadeDisable, isEffectivelyIncluded, setIncludeFlag } from '../src/lib/cascade'

const mk = (id: string, parentId?: string) => ({ id, sessionId: 's1', role: 'user' as const, content: id, includeInContext: true, createdAt: 1, parentId })

describe('cascade toggling', () => {
  test('disables descendants', () => {
    const a = mk('a')
    const b = mk('b', 'a')
    const c = mk('c', 'b')
    const res = cascadeDisable([a,b,c], 'a')
    expect(res.find(m=>m.id==='a')!.includeInContext).toBe(false)
    expect(res.find(m=>m.id==='b')!.includeInContext).toBe(false)
    expect(res.find(m=>m.id==='c')!.includeInContext).toBe(false)
  })

  test('enable only toggles node', () => {
    const a = { ...mk('a'), includeInContext: false }
    const b = { ...mk('b','a'), includeInContext: false }
    const res = setIncludeFlag([a,b], 'a', true)
    expect(res.find(m=>m.id==='a')!.includeInContext).toBe(true)
    expect(res.find(m=>m.id==='b')!.includeInContext).toBe(false)
  })

  test('effective inclusion requires ancestors enabled', () => {
    const a = mk('a')
    const b = mk('b','a')
    const idx = new Map([[a.id,a],[b.id,b]])
    expect(isEffectivelyIncluded(b, idx)).toBe(true)
    const disabledA = { ...a, includeInContext: false }
    const idx2 = new Map([[disabledA.id,disabledA],[b.id,b]])
    expect(isEffectivelyIncluded(b, idx2)).toBe(false)
  })
})
