// ============================================================
// Font: Sarabun — โหลดจาก @fontsource/sarabun (self-hosted)
// Vite จะ bundle ไฟล์ .woff2 พร้อมกับแอปโดยอัตโนมัติ
// ============================================================
import '@fontsource/sarabun/300.css' // น้ำหนัก Light
import '@fontsource/sarabun/400.css' // น้ำหนัก Regular (ปกติ)
import '@fontsource/sarabun/500.css' // น้ำหนัก Medium
import '@fontsource/sarabun/600.css' // น้ำหนัก SemiBold
import '@fontsource/sarabun/700.css' // น้ำหนัก Bold

// Tailwind CSS (global styles)
import './style.css'

import { createApp } from 'vue'
import App from './App.vue'

// Vue Router — จัดการเส้นทาง URL
import router from '@/router'

// Pinia — State management (เก็บข้อมูล user, token ฯลฯ)
import { createPinia } from 'pinia'

// TanStack Vue Query — จัดการ server state และ cache API responses
import { VueQueryPlugin } from '@tanstack/vue-query'

const app = createApp(App)

app.use(router)
app.use(createPinia())
app.use(VueQueryPlugin)

app.mount('#app')
