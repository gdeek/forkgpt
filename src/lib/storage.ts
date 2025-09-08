import { Message, Session, Settings, UIState } from '../types'

const SESSIONS_KEY = 'og.chat.sessions'
const MESSAGES_KEY = 'og.chat.messages'
const SETTINGS_KEY = 'og.chat.settings'
const UI_KEY = 'og.chat.ui'

export const loadSessions = (): Session[] => {
  const raw = localStorage.getItem(SESSIONS_KEY)
  return raw ? (JSON.parse(raw) as Session[]) : []
}

export const saveSessions = (sessions: Session[]) => {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

export const loadMessages = (): Message[] => {
  const raw = localStorage.getItem(MESSAGES_KEY)
  return raw ? (JSON.parse(raw) as Message[]) : []
}

export const saveMessages = (messages: Message[]) => {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
}

export const loadSettings = (): Settings => {
  const raw = localStorage.getItem(SETTINGS_KEY)
  return raw ? (JSON.parse(raw) as Settings) : {}
}

export const saveSettings = (settings: Settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export const loadUI = (): UIState => {
  const raw = localStorage.getItem(UI_KEY)
  return raw ? (JSON.parse(raw) as UIState) : {}
}

export const saveUI = (ui: UIState) => {
  localStorage.setItem(UI_KEY, JSON.stringify(ui))
}

