import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

/**
 * cert สำหรับเทสบนมือถือผ่าน LAN — กล้องทำงานเฉพาะ secure context
 * http://192.168.x.x ใช้ไม่ได้ (SDK จะคืน INIT_ERROR ที่อ่านไม่ออกว่าเกิดจากอะไร)
 *
 * ออกไฟล์เองด้วย mkcert แล้ววางใน certs/ (ดู src/lib/liveness/README.md)
 * ไม่มีไฟล์ = รัน http ตามเดิม คนที่ไม่ได้เทสมือถือไม่ต้องทำอะไร
 */
function loadDevHttps() {
  const cert = fileURLToPath(new URL('./certs/lan.pem', import.meta.url))
  const key = fileURLToPath(new URL('./certs/lan-key.pem', import.meta.url))
  if (!existsSync(cert) || !existsSync(key)) return undefined
  return { cert: readFileSync(cert), key: readFileSync(key) }
}

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
            https: loadDevHttps(),
            // liveness ต้องการ HTTPS origin (กล้อง + ตัว SDK ของ AINU เอง) ตอน dev จึงต้องผ่าน
            // Cloudflare quick tunnel ซึ่ง serve จาก host สุ่มบน *.trycloudflare.com
            // Vite จะปฏิเสธ Host ที่ไม่รู้จักถ้าไม่ประกาศไว้ — จุดนำหน้าคือ match ทุก subdomain
            // เพื่อให้ tunnel URL ใหม่ทุกครั้งยังใช้ได้โดยไม่ต้องแก้ไฟล์นี้
            allowedHosts: ['.trycloudflare.com'],
            // ให้ API วิ่งผ่าน origin เดียวกับหน้าเว็บ — จำเป็นตอนเทสจากมือถือ
            // 1. มือถือเรียก `localhost:8000` ไม่ได้ (นั่นคือตัวมันเอง)
            // 2. BFF ตอบ "Disallowed CORS origin" ถ้าเรียกข้าม origin มาจาก LAN IP
            //    proxy ทำให้เบราว์เซอร์เห็นเป็น same-origin เลยไม่มี CORS ตั้งแต่แรก
            // target ต้องเป็น host.docker.internal เพราะ dev server รันใน Docker
            // และอยู่คนละ network กับ backend — รันบนโฮสต์ตรง ๆ ให้ตั้ง env เป็น localhost
            proxy: {
              '/api-vsmartcare': {
                target: env.VITE_DEV_API_PROXY_TARGET || 'http://host.docker.internal:8000',
                changeOrigin: true
              }
            },
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