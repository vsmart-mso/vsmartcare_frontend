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

  // อ่าน token จาก localStorage ตั้งแต่เริ่มต้น เพื่อให้ยังคง Login อยู่หลัง refresh หน้า
  const token = ref<string | null>(localStorage.getItem('auth_token'))

  const method = ref<AuthMethod | null>(null) // วิธีที่ผู้ใช้เลือก Login

  // --- Computed (ค่าที่คำนวณจาก state) ---
  // computed() จะคำนวณใหม่อัตโนมัติเมื่อ token หรือ user เปลี่ยน
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  // !! แปลง null/undefined เป็น false และ ค่าจริงๆ เป็น true

  // --- Actions (ฟังก์ชันที่แก้ไข state) ---

  // เรียกเมื่อ Login สำเร็จ — บันทึกข้อมูลผู้ใช้และ token
  function setAuth(authUser: AuthUser, authToken: string, authMethod: AuthMethod) {
    user.value = authUser
    token.value = authToken
    method.value = authMethod
    localStorage.setItem('auth_token', authToken) // บันทึก token ไว้ใน browser ด้วย
  }

  // เรียกเมื่อ Logout — ล้างข้อมูลทั้งหมด
  function clearAuth() {
    user.value = null
    token.value = null
    method.value = null
    localStorage.removeItem('auth_token') // ลบ token จาก browser ด้วย
  }

  // คืนค่าทั้งหมดออกไปให้ component อื่นใช้ได้
  return { user, token, method, isAuthenticated, setAuth, clearAuth }
})
