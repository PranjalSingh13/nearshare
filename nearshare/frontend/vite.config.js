import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',        // reachable on the local network (mobile devices)
    port: 5173,
    strictPort: false,       // try next available port if 5173 is busy
    allowedHosts: 'all',     // allow mobile devices on LAN to connect by IP (no host-check rejection)
    proxy: {
      // Forward all /api/* REST calls to the Node backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // Forward WebSocket connections to the Node backend
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
