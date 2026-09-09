/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGIN_BETA_NOTICE?: string
  readonly VITE_ENABLE_THAID_DEV_MOCK?: string

  // AINU eKYC (liveness) ไม่มี env แล้ว — credential ย้ายไปอยู่ฝั่ง backend ทั้งหมด
  // frontend รับ config มาทาง POST /v1/liveness/session แทน (ดู src/api/liveness.ts)
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

