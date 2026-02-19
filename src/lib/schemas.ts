import { z } from 'zod'

export const settingsSchema = z.object({
  apiKey: z.string().min(10).optional(),
  anthropicApiKey: z.string().min(10).optional(),
  geminiApiKey: z.string().min(10).optional(),
  moonshotApiKey: z.string().min(10).optional(),
  defaultModel: z.string().optional(),
})

export const messageInputSchema = z.object({
  content: z.string().min(1),
})

export type SettingsInput = z.infer<typeof settingsSchema>
export type MessageInput = z.infer<typeof messageInputSchema>
