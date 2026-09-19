/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGIN_BETA_NOTICE?: string
  readonly VITE_ENABLE_THAID_DEV_MOCK?: string
  /** เปิดด่านสแกนใบหน้า AINU — default ปิด; credential ยังอยู่ฝั่ง backend ทั้งหมด */
  readonly VITE_ENABLE_AINU_LIVENESS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

