import { settingsSchema } from '../src/lib/schemas'
import { saveSettings } from '../src/lib/storage'

describe('settings', () => {
  test('validates Baseten keys and has no Moonshot key field', () => {
    expect(settingsSchema.shape.basetenApiKey).toBeDefined()
    expect((settingsSchema.shape as Record<string, unknown>).moonshotApiKey).toBeUndefined()
  })

  test('does not persist unlocked Baseten keys', () => {
    const setItem = jest.fn()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { setItem },
    })

    saveSettings({ basetenApiKey: 'baseten-secret-key', basetenApiKeyEncrypted: 'encrypted-value', defaultModel: 'kimi-k3' })

    expect(setItem).toHaveBeenCalledWith('og.chat.settings', JSON.stringify({ basetenApiKeyEncrypted: 'encrypted-value', defaultModel: 'kimi-k3' }))
  })
})
