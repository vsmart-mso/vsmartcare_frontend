// ไฟล์นี้สร้าง HTTP Client กลางสำหรับเรียก API ทั้งหมดในระบบ
// ข้อดีคือกำหนด config ครั้งเดียว (base URL, headers, token) ใช้ได้ทุกที่

import { ofetch } from 'ofetch'

// อ่าน URL ของ BFF จาก environment variable (รวม prefix `/api-vsmartcare`)
// ถ้าไม่ได้กำหนด ให้ใช้ localhost:8000/api-vsmartcare เป็นค่าตั้งต้น (สำหรับ dev)
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api-vsmartcare'

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
    const headers = new Headers(options.headers as HeadersInit | undefined)
    // sessionStorage ปลอดภัยกว่า localStorage เพราะ scoped ต่อ tab เดียว
    // และถูกลบอัตโนมัติเมื่อปิด tab (ป้องกัน token รั่วข้าม session)
    const token = sessionStorage.getItem('auth_token')
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    options.headers = headers
  },

  // onResponseError ทำงานอัตโนมัติเมื่อ server ตอบกลับมาเป็น error
  onResponseError({ response }) {
    // 401 = Unauthorized = token หมดอายุหรือไม่ถูกต้อง
    if (response.status === 401) {
      sessionStorage.removeItem('auth_token') // ลบ token ที่ใช้ไม่ได้ออก
      window.location.href = '/'              // พาผู้ใช้กลับไปหน้า Login
    }
  },
})
