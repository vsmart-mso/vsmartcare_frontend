import { apiClient } from './client'

export interface StaffLoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  province_id: number
  display_name: string
}

const STAFF_TOKEN_KEY = 'staff_token'

export const staffAuth = {
  login(username: string, password: string) {
    return apiClient<StaffLoginResponse>('/v1/staff/auth/login', {
      method: 'POST',
      body: { username, password },
    })
  },
  setToken(token: string) {
    sessionStorage.setItem(STAFF_TOKEN_KEY, token)
  },
  getToken(): string | null {
    return sessionStorage.getItem(STAFF_TOKEN_KEY)
  },
  clear() {
    sessionStorage.removeItem(STAFF_TOKEN_KEY)
  },
}
