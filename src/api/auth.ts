// ไฟล์นี้รวม function ทั้งหมดที่ใช้เรียก Auth API ผ่าน BFF (หรือ backend ที่ VITE_API_URL ชี้ไป)

import type { Router } from 'vue-router'
import { apiClient } from './client'
import type { ThaiDUser, DGAUser } from '@/types/auth'

/** ตอบจาก thaid-auth-service / BFF `POST /v1/auth/thaid/login` */
export interface ThaIDLoginStartResponse {
  authorization_url: string
  state: string
  /** `dev_mock` = โหมดพัฒนา ให้แสดงหน้าจำลอง QR/ปุ่ม — `thaid` = redirect ไป ThaiD จริงทันที */
  flow?: 'thaid' | 'dev_mock'
  /** มีเมื่อ flow === dev_mock — โปรไฟล์เดียวกับที่ได้จาก userinfo หลังล็อกอินสำเร็จ */
  mock_profile?: {
    pid: string
    given_name: string
    family_name: string
    title_th: string
  }
}

/** ตอบจาก `GET /v1/auth/thaid/status` — ใช้ poll หลังสแกน QR (โหมดเดสก์ท็อปแสดง QR แยก) */
export interface ThaIDLoginStatusResponse {
  status: 'pending' | 'complete' | 'gone'
  access_token?: string
  token_type?: string
  expires_in?: number
  user?: {
    pid: string
    given_name: string
    family_name: string
    title_th: string
  }
}

/** ตอบจาก BFF `GET /v1/me` (หลังได้ access_token จาก redirect ThaiD) */
export interface MeResponse {
  user_id: string
  provider: string
  pid: string
  given_name: string
  family_name: string
  title_th: string
}

function resolveApiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
}

// ข้อมูลที่ส่งไปหลังจาก DGA Liveness SDK ยืนยันสำเร็จ
export interface DGAVerifyPayload {
  pid: string
  livenessToken: string
  faceImage: string
}

// ข้อมูลที่ backend ส่งกลับมาเมื่อ Login สำเร็จ (รูปแบบเก่า — ยังเก็บไว้สำหรับ DGA ฯลฯ)
export interface AuthTokenResponse {
  accessToken: string
  tokenType: string
  expiresIn: number
  user: ThaiDUser | DGAUser
}

export const authApi = {
  /**
   * เริ่ม OAuth ThaID — ได้ `authorization_url` ไปหน้า ThaiD โดยตรง
   * ถ้าส่ง `post_login_redirect` หลัง callback สำเร็จ backend จะ 302 กลับมาที่ URL นั้นพร้อม query `access_token`
   */
  startThaIDLogin(payload?: {
    post_login_redirect?: string | null
    /** ฐาน URL ของ BFF ที่เบราว์เซอร์เรียกได้ — ใช้ประกอบลิงก์ mock (ต้องตรงกับ VITE_API_URL) */
    browser_oauth_base?: string | null
  }) {
    const body: Record<string, string> = {}
    if (payload?.post_login_redirect != null && payload.post_login_redirect !== '') {
      body.post_login_redirect = payload.post_login_redirect
    }
    if (payload?.browser_oauth_base != null && payload.browser_oauth_base !== '') {
      body.browser_oauth_base = payload.browser_oauth_base
    }
    return apiClient<ThaIDLoginStartResponse>('/v1/auth/thaid/login', {
      method: 'POST',
      body,
    })
  },

  fetchMe() {
    return apiClient<MeResponse>('/v1/me', { method: 'GET' })
  },

  pollThaIDLoginStatus(state: string) {
    return apiClient<ThaIDLoginStatusResponse>('/v1/auth/thaid/status', {
      method: 'GET',
      query: { state },
    })
  },

  verifyDGA(payload: DGAVerifyPayload) {
    return apiClient<AuthTokenResponse>('/auth/dga/verify', {
      method: 'POST',
      body: payload,
    })
  },

  logout() {
    return apiClient('/auth/logout', { method: 'POST' })
  },
}

/** sessionStorage key สำหรับหน้า dev mock */
export const THAID_DEV_MOCK_STORAGE_KEY = 'thaid_dev_mock'
/** sessionStorage key สำหรับเก็บค่า start login ล่าสุด (ช่วย debug) */
export const THAID_LAST_LOGIN_START_KEY = 'thaid_last_login_start'

function resolveThaIDLoginFlow(start: ThaIDLoginStartResponse): 'thaid' | 'dev_mock' {
  if (start.flow) return start.flow
  // backend รุ่นเก่าไม่ส่ง flow — ใช้ heuristics
  if (start.authorization_url.includes('/mock/continue')) return 'dev_mock'
  return 'thaid'
}

/**
 * เริ่มล็อกอิน ThaiD: ถ้า backend อยู่โหมด mock จะไปหน้าจำลอง QR/ปุ่ม — ถ้าเป็น OIDC จริงจะ redirect ไป ThaiD ทันที
 */
export async function redirectBrowserToThaIDLogin(router: Router) {
  const returnUrl = `${window.location.origin}/login/thaid/return`
  const apiBase = resolveApiBaseUrl()
  const start = await authApi.startThaIDLogin({
    post_login_redirect: returnUrl,
    browser_oauth_base: apiBase,
  })

  try {
    sessionStorage.setItem(THAID_LAST_LOGIN_START_KEY, JSON.stringify(start))
  } catch {
    // ignore
  }

  if (resolveThaIDLoginFlow(start) === 'dev_mock') {
    sessionStorage.setItem(
      THAID_DEV_MOCK_STORAGE_KEY,
      JSON.stringify({
        authorization_url: start.authorization_url,
        state: start.state,
        mock_profile: start.mock_profile,
      }),
    )
    await router.push({ name: 'login-thaid-dev-mock' })
    return
  }

  window.location.assign(start.authorization_url)
}
