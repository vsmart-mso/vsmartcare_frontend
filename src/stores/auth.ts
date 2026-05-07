// ไฟล์นี้สร้าง "Auth Store" ด้วย Pinia
//
// ทุกหน้า (component) สามารถดึงข้อมูลจาก Store ได้โดยตรง
// โดยไม่ต้องส่งข้อมูลผ่าน props ทีละชั้น
//
// Auth Store เก็บ: ข้อมูลผู้ใช้, token, วิธีที่ Login

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AuthUser, AuthMethod } from '@/types/auth'

// defineStore('auth', ...) — 'auth' คือชื่อ unique ของ store นี้
export const useAuthStore = defineStore('auth', () => {
  // --- State (ข้อมูลที่เก็บไว้) ---
  // ref() ทำให้ตัวแปรเป็น "reactive" — เมื่อค่าเปลี่ยน หน้าจอจะ update อัตโนมัติ

  const user = ref<AuthUser | null>(null) // ข้อมูลผู้ใช้ปัจจุบัน (null = ยังไม่ Login)

  // อ่าน token จาก sessionStorage ตั้งแต่เริ่มต้น เพื่อให้ยังคง Login อยู่หลัง refresh หน้า
  // ใช้ sessionStorage แทน localStorage เพราะปลอดภัยกว่า:
  //   - scoped ต่อ tab เดียว (ไม่รั่วข้าม tab อื่น)
  //   - ถูกลบอัตโนมัติเมื่อปิด tab/browser
  const token = ref<string | null>(sessionStorage.getItem('auth_token'))

  // อ่าน method จาก sessionStorage ด้วย เพื่อให้ restore ได้ถูกต้องหลัง refresh
  const method = ref<AuthMethod | null>(
    sessionStorage.getItem('auth_method') as AuthMethod | null
  )

  // เวลาที่ token หมดอายุ (Unix timestamp หน่วย ms) — null = ไม่ทราบเวลา
  const expiresAt = ref<number | null>(null)

  // --- Computed (ค่าที่คำนวณจาก state) ---
  // isAuthenticated จะตรวจทั้ง token, user และเวลาหมดอายุ
  const isAuthenticated = computed(() => {
    if (!token.value || !user.value) return false
    // ถ้ามีข้อมูลเวลาหมดอายุ และ token หมดอายุแล้ว → ถือว่าไม่ได้ Login
    if (expiresAt.value !== null && Date.now() > expiresAt.value) return false
    return true
  })

  // --- Actions (ฟังก์ชันที่แก้ไข state) ---

  // เรียกเมื่อ Login สำเร็จ — บันทึกข้อมูลผู้ใช้และ token
  // expiresIn = อายุ token หน่วย "วินาที" (มาจาก expires_in ใน OAuth response)
  function setAuth(authUser: AuthUser, authToken: string, authMethod: AuthMethod, expiresIn?: number) {
    user.value = authUser
    token.value = authToken
    method.value = authMethod
    // คำนวณเวลาหมดอายุจาก "ตอนนี้ + expiresIn วินาที"
    expiresAt.value = expiresIn != null && expiresIn > 0
      ? Date.now() + expiresIn * 1000
      : null
    sessionStorage.setItem('auth_token', authToken)   // บันทึก token ไว้ใน browser ด้วย
    sessionStorage.setItem('auth_method', authMethod) // บันทึก method เพื่อ restore หลัง refresh
  }

  // เรียกเมื่อ Logout — ล้างข้อมูลทั้งหมด
  function clearAuth() {
    user.value = null
    token.value = null
    method.value = null
    expiresAt.value = null
    sessionStorage.removeItem('auth_token')  // ลบ token จาก browser ด้วย
    sessionStorage.removeItem('auth_method') // ลบ method ด้วยเสมอ
  }

  // คืนค่าทั้งหมดออกไปให้ component อื่นใช้ได้
  return { user, token, method, isAuthenticated, expiresAt, setAuth, clearAuth }
})
