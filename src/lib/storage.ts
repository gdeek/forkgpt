import { Message, Session, Settings, UIState } from '../types'

const SESSIONS_KEY = 'og.chat.sessions'
const MESSAGES_KEY = 'og.chat.messages'
const SETTINGS_KEY = 'og.chat.settings'
const UI_KEY = 'og.chat.ui'

export const loadSessions = (): Session[] => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SESSIONS_KEY) : null
    return raw ? (JSON.parse(raw) as Session[]) : []
  } catch {
    return []
  }
}

export const saveSessions = (sessions: Session[]) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)) } catch {}
}

export const loadMessages = (): Message[] => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MESSAGES_KEY) : null
    return raw ? (JSON.parse(raw) as Message[]) : []
  } catch {
    return []
  }
}

export const saveMessages = (messages: Message[]) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)) } catch {}
}

export const loadSettings = (): Settings => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null
    return raw ? (JSON.parse(raw) as Settings) : {}
  } catch {
    return {}
  }
}

export const saveSettings = (settings: Settings) => {
  try {
    if (typeof localStorage !== 'undefined') {
      // Never persist volatile secrets or accidental password fields
      const {
        apiKey: _volatileApiKey,
        anthropicApiKey: _volatileAnthropicKey,
        geminiApiKey: _volatileGeminiKey,
        moonshotApiKey: _volatileMoonshotKey,
        /* @ts-ignore defensive */ password: _pwd,
        ...rest
      } = settings as any
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest))
    }
  } catch {}
}

export const loadUI = (): UIState => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(UI_KEY) : null
    return raw ? (JSON.parse(raw) as UIState) : {}
  } catch {
    return {}
  }
}

export const saveUI = (ui: UIState) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(UI_KEY, JSON.stringify(ui)) } catch {}
}
