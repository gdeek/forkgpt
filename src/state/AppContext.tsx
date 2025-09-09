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
  | { type: 'deleteSession'; id: string }
  | { type: 'touchSession'; id: string }
  | { type: 'setSystemPrompt'; id: string; prompt: string }
  | { type: 'setSessionTemperature'; id: string; temperature: number }
  | { type: 'setSessionReasoningEffort'; id: string; effort: 'low' | 'medium' | 'high' }
  | { type: 'setSessionMainTurnsLimit'; id: string; value: number }
  | { type: 'setSessionMaxTokens'; id: string; value: number }
  | { type: 'addMessage'; message: Message }
  | { type: 'updateMessage'; id: string; patch: Partial<Message> }
  | { type: 'setActiveReplyAnchor'; anchorId?: string }
  | { type: 'setSettings'; settings: Partial<Settings> }
  | { type: 'setReplyViewerWidth'; width: number }
  | { type: 'setTheme'; theme: 'light' | 'dark' }

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
        temperature: 1,
        reasoningEffort: 'medium',
        mainTurnsLimit: 6,
        maxTokens: 8000,
      }
      return { ...state, sessions: [...state.sessions, s], ui: { ...state.ui, activeSessionId: s.id } }
    }
    case 'selectSession': {
      return { ...state, ui: { ...state.ui, activeSessionId: action.id, activeReplyViewerAnchorId: undefined } }
    }
    case 'renameSession': {
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, title: action.title } : s)) }
    }
    case 'deleteSession': {
      const sessions = state.sessions.filter(s => s.id !== action.id)
      const messages = state.messages.filter(m => m.sessionId !== action.id)
      const nextActiveId = state.ui.activeSessionId === action.id ? sessions[0]?.id : state.ui.activeSessionId
      // If the active reply anchor belongs to the deleted session, clear it
      const anchor = state.ui.activeReplyViewerAnchorId
      const anchorMsg = anchor ? state.messages.find(m => m.id === anchor) : undefined
      const nextAnchor = anchorMsg && anchorMsg.sessionId === action.id ? undefined : anchor
      return { ...state, sessions, messages, ui: { ...state.ui, activeSessionId: nextActiveId, activeReplyViewerAnchorId: nextAnchor } }
    }
    case 'touchSession': {
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, lastActiveAt: Date.now() } : s)) }
    }
    case 'setSystemPrompt': {
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, systemPrompt: action.prompt } : s)) }
    }
    case 'setSessionTemperature': {
      const t = Math.min(1, Math.max(0, action.temperature))
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, temperature: t } : s)) }
    }
    case 'setSessionReasoningEffort': {
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, reasoningEffort: action.effort } : s)) }
    }
    case 'setSessionMainTurnsLimit': {
      const val = Math.min(10, Math.max(0, action.value))
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, mainTurnsLimit: val } : s)) }
    }
    case 'setSessionMaxTokens': {
      const val = Math.min(128000, Math.max(0, action.value))
      return { ...state, sessions: state.sessions.map(s => (s.id === action.id ? { ...s, maxTokens: val } : s)) }
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
    case 'setReplyViewerWidth': {
      return { ...state, ui: { ...state.ui, replyViewerWidth: action.width } }
    }
    case 'setTheme': {
      return { ...state, ui: { ...state.ui, theme: action.theme } }
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
