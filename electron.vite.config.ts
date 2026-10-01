import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), worker: resolve('src/main/worker.ts') } } }
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react(), {
    name: 'development-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        // React Fast Refresh injects a local inline preamble only in the dev server.
        return context.server ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") : html
      }
    }
  }] }
})
