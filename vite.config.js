import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ais-proxy': {
        target: 'wss://stream.aisstream.io',
        ws: true,
        changeOrigin: true,
        rewriteWsOrigin: true,
        rewrite: () => '/v0/stream',
      },
    },
  },
})
