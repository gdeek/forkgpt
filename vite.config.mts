import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p: string) => p.replace(/^\/anthropic/, ''),
      },
      '/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p: string) => p.replace(/^\/gemini/, ''),
      },
      '/moonshot': {
        target: 'https://api.moonshot.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (p: string) => p.replace(/^\/moonshot/, ''),
      },
    },
  },
})
