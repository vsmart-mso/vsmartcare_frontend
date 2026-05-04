// ไฟล์นี้สร้าง "Composable" ชื่อ useAuth
//
// Composable คืออะไร?
// เป็น function ที่รวม logic ที่ใช้ซ้ำได้ไว้ด้วยกัน
// "เครื่องมือสำเร็จรูป" ที่ component ไหนก็เรียกใช้ได้
//
// ทำไมต้องแยกออกมาจาก component?
// ถ้า component A และ B ต่างก็ต้องการ logout() และ redirectToThaID()
// แทนที่จะก๊อบโค้ดซ้ำ เราแค่ import useAuth() ทั้งสองที่

import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'

export function useAuth() {
  const router = useRouter()           // ใช้เปลี่ยนหน้า
  const authStore = useAuthStore()     // ดึง Store กลางมาใช้

  // พาผู้ใช้ไปหน้า Login ของ ThaID
  // ขั้นตอน: ถาม FastAPI ว่า URL ของ ThaID คืออะไร → redirect ไปที่นั่น
  async function redirectToThaID() {
    const response = await authApi.getThaiDOAuthUrl()
    window.location.href = response.data.url // redirect ออกจากเว็บเราไป ThaID
  }

  // ออกจากระบบ
  // ขั้นตอน: บอก FastAPI ให้ invalidate token → ล้าง Store → กลับหน้า Login
  async function logout() {
    try {
      await authApi.logout() // บอก server ก่อน
    } finally {
      // finally = ทำเสมอ ไม่ว่า API จะสำเร็จหรือล้มเหลว
      // เพื่อให้ผู้ใช้ออกได้แม้ network มีปัญหา
      authStore.clearAuth()
      router.push({ name: 'login' })
    }
  }

  return {
    user: authStore.user,
    isAuthenticated: authStore.isAuthenticated,
    redirectToThaID,
    logout,
  }
}
