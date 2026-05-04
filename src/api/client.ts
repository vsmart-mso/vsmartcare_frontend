// ไฟล์นี้สร้าง HTTP Client กลางสำหรับเรียก API ทั้งหมดในระบบ
// ข้อดีคือกำหนด config ครั้งเดียว (base URL, headers, token) ใช้ได้ทุกที่

import { ofetch } from 'ofetch'

// อ่าน URL ของ FastAPI จาก environment variable
// ถ้าไม่ได้กำหนด ให้ใช้ localhost:8000 เป็นค่าตั้งต้น (สำหรับ dev)
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const apiClient = ofetch.create({
  baseURL,

  // Headers ที่แนบไปกับทุก request โดยอัตโนมัติ
  headers: {
    'Content-Type': 'application/json', // บอก server ว่าเราส่งข้อมูลแบบ JSON
    Accept: 'application/json',          // บอก server ว่าเราต้องการรับข้อมูลแบบ JSON
  },

  // onRequest ทำงานก่อน request ทุกครั้ง (เรียกว่า "interceptor")
  // ใช้สำหรับแนบ JWT token อัตโนมัติ
  onRequest({ options }) {
    const token = localStorage.getItem('auth_token') // อ่าน token จาก browser storage
    if (token) {
      // สร้าง Headers object จาก headers เดิม แล้วเพิ่ม Authorization เข้าไป
      // ใช้ new Headers() + .set() แทนการ spread {} เพราะ TypeScript กำหนดให้ใช้ Headers API
      const headers = new Headers(options.headers as HeadersInit | undefined)
      headers.set('Authorization', `Bearer ${token}`) // รูปแบบมาตรฐาน JWT
      options.headers = headers
    }
  },

  // onResponseError ทำงานอัตโนมัติเมื่อ server ตอบกลับมาเป็น error
  onResponseError({ response }) {
    // 401 = Unauthorized = token หมดอายุหรือไม่ถูกต้อง
    if (response.status === 401) {
      localStorage.removeItem('auth_token') // ลบ token ที่ใช้ไม่ได้ออก
      window.location.href = '/'            // พาผู้ใช้กลับไปหน้า Login
    }
  },
})
