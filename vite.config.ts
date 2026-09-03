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
    build: {
      rollupOptions: {
        // เฟรม liveness เป็น entry แยกโดยตั้งใจ — หน้านั้นห้ามมี Tailwind
        // (UI ของ AINU SDK ใช้คลาส Tailwind ของตัวเอง ชนกับ v4 ของเราแล้ว layout พัง)
        // นี่คือบรรทัดเดียวนอก src/lib/liveness/ ที่เกี่ยวกับ liveness — ดู README ที่นั่น
        // path ต้องตรงกับ LIVENESS_FRAME_URL ใน src/lib/liveness/messages.ts
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          liveness: fileURLToPath(new URL('./src/lib/liveness/frame.html', import.meta.url)),
        },
      },
    },
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
            // liveness ต้องการ HTTPS origin (กล้อง + ตัว SDK ของ AINU เอง) ตอน dev จึงต้องผ่าน
            // Cloudflare quick tunnel ซึ่ง serve จาก host สุ่มบน *.trycloudflare.com
            // Vite จะปฏิเสธ Host ที่ไม่รู้จักถ้าไม่ประกาศไว้ — จุดนำหน้าคือ match ทุก subdomain
            // เพื่อให้ tunnel URL ใหม่ทุกครั้งยังใช้ได้โดยไม่ต้องแก้ไฟล์นี้
            allowedHosts: ['.trycloudflare.com'],
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