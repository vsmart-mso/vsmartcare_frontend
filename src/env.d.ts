/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGIN_BETA_NOTICE?: string
  readonly VITE_ENABLE_THAID_DEV_MOCK?: string

  // AINU eKYC (liveness) — ค่าจาก DGA-PCA001_credential ช่อง Web SDK
  // Vite inline ค่าพวกนี้ลง bundle ตอน build → accountSecret อ่านได้จาก JS ที่ ship
  // รับได้สำหรับ UAT (sample ของ AINU เองก็ hardcode) แต่ prod ต้องให้ backend เป็นคนจ่าย
  readonly VITE_ACCOUNT_ID?: string
  readonly VITE_ACCOUNT_SECRET?: string
  readonly VITE_FLOW_ID?: string
  readonly VITE_LANGUAGE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

