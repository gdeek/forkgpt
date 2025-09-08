import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { nanoid } from 'nanoid'
import type { Message, Session, Settings, UIState } from '../types'
import { loadMessages, loadSessions, loadSettings, loadUI, saveMessages, saveSessions, saveSettings, saveUI } from '../lib/storage'

type State = {
  sessions: Session[]
  messages: Message[]
  settings: Settings
  ui: UIState
}

type Action =
  | { type: 'createSession'; title?: string }
  | { type: 'selectSession'; id: string }
  | { type: 'renameSession'; id: string; title: string }
  | { type: 'setSystemPrompt'; id: string; prompt: string }
  | { type: 'addMessage'; message: Message }
  | { type: 'updateMessage'; id: string; patch: Partial<Message> }
  | { type: 'setActiveReplyAnchor'; anchorId?: string }
  | { type: 'setSettings'; settings: Partial<Settings> }

const loadInitialState = (): State => ({
  sessions: loadSessions(),
  messages: loadMessages(),
  settings: loadSettings(),
  ui: loadUI(),
})

const AppCtx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | undefined>(undefined)

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'createSession': {
      const s: Session = {
        id: nanoid(),
        title: action.title ?? 'New Session',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      }
      return { ...state, sessions: [...state.sessions, s], ui: { ...state.ui, activeSessionId: s.id } }
    }
    case 'selectSession': {
      return { ...state, ui: { ...state.ui, activeSessionId: action.id } }
    }
    case 'renameSession': {
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, title: action.title } : s)) }
    }
    case 'setSystemPrompt': {
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, systemPrompt: action.prompt } : s)) }
    }
    case 'addMessage': {
      return { ...state, messages: [...state.messages, action.message] }
    }
    case 'updateMessage': {
      return { ...state, messages: state.messages.map(m => (m.id === action.id ? { ...m, ...action.patch } : m)) }
    }
    case 'setActiveReplyAnchor': {
      return { ...state, ui: { ...state.ui, activeReplyViewerAnchorId: action.anchorId } }
    }
    case 'setSettings': {
      return { ...state, settings: { ...state.settings, ...action.settings } }
    }
    default:
      return state
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState)

  const realDispatch = (action: Action) => dispatch(action)

  // Persist on changes
  useEffect(() => {
    saveSessions(state.sessions)
  }, [state.sessions])
  useEffect(() => {
    saveMessages(state.messages)
  }, [state.messages])
  useEffect(() => {
    saveSettings(state.settings)
  }, [state.settings])
  useEffect(() => {
    saveUI(state.ui)
  }, [state.ui])

  const value = useMemo(() => ({ state, dispatch: realDispatch }), [state])
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
