// Lightweight browser crypto helpers for encrypting small strings (e.g., API keys)
// Uses PBKDF2 (SHA-256) to derive a key and AES-GCM for encryption.

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const getSubtle = () => {
  const subtle = (globalThis.crypto && globalThis.crypto.subtle) || undefined
  if (!subtle) throw new Error('WebCrypto not available in this environment')
  return subtle
}

const b64 = {
  encode: (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  },
  decode: (str: string): Uint8Array => {
    const binary = atob(str)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  },
}

export type EncryptedPayload = {
  v: 1
  s: string // salt (base64)
  i: string // iv (base64)
  c: string // cipher (base64)
}

const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const subtle = getSubtle()
  const baseKey = await subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export const encryptString = async (plain: string, password: string): Promise<string> => {
  const subtle = getSubtle()
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(plain))
  const payload: EncryptedPayload = { v: 1 as const, s: b64.encode(salt), i: b64.encode(iv), c: b64.encode(cipher) }
  return JSON.stringify(payload)
}

export const decryptString = async (enc: string, password: string): Promise<string> => {
  const subtle = getSubtle()
  const payload = JSON.parse(enc) as EncryptedPayload
  if (payload.v !== 1) throw new Error('Unsupported encryption format')
  const salt = b64.decode(payload.s)
  const iv = b64.decode(payload.i)
  const key = await deriveKey(password, salt)
  const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, b64.decode(payload.c))
  return textDecoder.decode(plainBuf)
}

