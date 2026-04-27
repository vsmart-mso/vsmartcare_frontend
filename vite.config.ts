import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ command }) => ({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // Dev only: Docker Desktop + Windows bind mounts often miss fs events; polling fixes HMR without container restarts.
  server:
    command === 'serve'
      ? {
          host: true,
          watch: {
            usePolling: true,
            interval: 300
          }
        }
      : undefined
}))