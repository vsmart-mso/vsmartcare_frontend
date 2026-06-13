// Admin Auth Store (TASK-v-care-12062026-01)
//
// แยกขาดจาก citizen auth store:
//   - token เก็บใน localStorage (admin ทำงานบนเครื่องเจ้าหน้าที่ ไม่ใช่ device ประชาชน)
//   - key คนละชุด (admin_token / admin_expires_at / admin_username)

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  ADMIN_TOKEN_KEY,
  ADMIN_EXPIRES_AT_KEY,
  ADMIN_USERNAME_KEY,
} from '@/api/admin'

export const useAdminAuthStore = defineStore('adminAuth', () => {
  const token = ref<string | null>(localStorage.getItem(ADMIN_TOKEN_KEY))
  const username = ref<string | null>(localStorage.getItem(ADMIN_USERNAME_KEY))
  const _storedExpiry = localStorage.getItem(ADMIN_EXPIRES_AT_KEY)
  const expiresAt = ref<number | null>(_storedExpiry ? Number(_storedExpiry) : null)

  const isAuthenticated = computed(() => {
    if (!token.value) return false
    if (expiresAt.value !== null && Date.now() > expiresAt.value) return false
    return true
  })

  /** บันทึก token หลัง login สำเร็จ — expiresIn หน่วยวินาที */
  function setAuth(authToken: string, name: string, expiresIn?: number) {
    token.value = authToken
    username.value = name
    expiresAt.value =
      expiresIn != null && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null

    localStorage.setItem(ADMIN_TOKEN_KEY, authToken)
    localStorage.setItem(ADMIN_USERNAME_KEY, name)
    if (expiresAt.value !== null) {
      localStorage.setItem(ADMIN_EXPIRES_AT_KEY, String(expiresAt.value))
    } else {
      localStorage.removeItem(ADMIN_EXPIRES_AT_KEY)
    }
  }

  function clearAuth() {
    token.value = null
    username.value = null
    expiresAt.value = null
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    localStorage.removeItem(ADMIN_USERNAME_KEY)
    localStorage.removeItem(ADMIN_EXPIRES_AT_KEY)
  }

  return { token, username, expiresAt, isAuthenticated, setAuth, clearAuth }
})
