// API ฝั่ง admin (TASK-v-care-12062026-01) — เปิด/ปิดบริการรายจังหวัด
//
// ใช้ ofetch instance แยกจาก citizen (`client.ts`) เพราะ:
//   - token เก็บใน localStorage (ไม่ใช่ sessionStorage)
//   - ไม่มี global 401 redirect ไปหน้า login ประชาชน (จัดการ error ในหน้า admin เอง)

import { ofetch } from 'ofetch'

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api-vsmartcare'

/** localStorage keys ฝั่ง admin (แยกจาก auth_* ของประชาชน) */
export const ADMIN_TOKEN_KEY = 'admin_token'
export const ADMIN_EXPIRES_AT_KEY = 'admin_expires_at'
export const ADMIN_USERNAME_KEY = 'admin_username'

export const adminClient = ofetch.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  onRequest({ options }) {
    const headers = new Headers(options.headers as HeadersInit | undefined)
    const token = localStorage.getItem(ADMIN_TOKEN_KEY)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    options.headers = headers
  },
})

export interface AdminLoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface ProvinceAccess {
  province_id: number
  province_name: string
  is_enabled: boolean
  updated_at: string | null
}

export const adminApi = {
  login(username: string, password: string) {
    return adminClient<AdminLoginResponse>('/v1/admin/auth/login', {
      method: 'POST',
      body: { username, password },
    })
  },

  getProvinces() {
    return adminClient<ProvinceAccess[]>('/v1/admin/provinces', { method: 'GET' })
  },

  updateProvince(provinceId: number, isEnabled: boolean) {
    return adminClient<ProvinceAccess>(`/v1/admin/provinces/${provinceId}`, {
      method: 'PUT',
      body: { is_enabled: isEnabled },
    })
  },

  /** เปิด/ปิดทุกจังหวัดพร้อมกัน */
  updateAllProvinces(isEnabled: boolean) {
    return adminClient<{ updated: number; is_enabled: boolean }>(
      '/v1/admin/provinces/bulk',
      { method: 'PUT', body: { is_enabled: isEnabled } },
    )
  },
}
