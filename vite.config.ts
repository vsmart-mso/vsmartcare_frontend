import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

function parsePreviewHost(value: string | undefined): boolean | string {
  if (!value) return true
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, rootDir, '')
  const previewAllowedHosts = (env.VITE_PREVIEW_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  return {
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
        : undefined,
    preview: {
      host: parsePreviewHost(env.VITE_PREVIEW_HOST),
      ...(previewAllowedHosts.length > 0 ? { allowedHosts: previewAllowedHosts } : {})
    }
  }
})