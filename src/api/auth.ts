// ไฟล์นี้รวม function ทั้งหมดที่ใช้เรียก Auth API บน FastAPI
// แยกออกมาเป็นไฟล์เดียวเพื่อให้ค้นหาและแก้ไขได้ง่าย

import { apiClient } from './client'
import type { ThaiDUser, DGAUser } from '@/types/auth'
import type { ApiResponse } from '@/types/api'

// --- ประเภทข้อมูลที่ส่งไปหา FastAPI ---

// ข้อมูลที่ส่งไปหลังจาก ThaID redirect กลับมา (OAuth callback)
// เมื่อผู้ใช้กด "อนุญาต" บน ThaID แล้ว ระบบจะส่ง code กลับมาให้เรา
export interface ThaiDCallbackPayload {
  code: string   // รหัสชั่วคราวจาก ThaID (ใช้ได้ครั้งเดียว)
  state: string  // ตัวเลขสุ่มที่เราสร้างไว้ ป้องกันการโจมตีแบบ CSRF
}

// ข้อมูลที่ส่งไปหลังจาก DGA Liveness SDK ยืนยันสำเร็จ
export interface DGAVerifyPayload {
  pid: string           // เลขบัตรประชาชน
  livenessToken: string // token จาก DGA SDK ว่าผ่าน liveness check แล้ว
  faceImage: string     // รูปใบหน้าในรูปแบบ base64
}

// ข้อมูลที่ FastAPI ส่งกลับมาเมื่อ Login สำเร็จ
export interface AuthTokenResponse {
  accessToken: string          // JWT token สำหรับเรียก API อื่นๆ
  tokenType: string            // ประเภท token (ปกติจะเป็น "bearer")
  expiresIn: number            // หมดอายุในกี่วินาที เช่น 3600 = 1 ชั่วโมง
  user: ThaiDUser | DGAUser   // ข้อมูลผู้ใช้ที่ Login สำเร็จ
}

// --- ฟังก์ชันเรียก API ---

export const authApi = {
  // ขอ URL สำหรับพาผู้ใช้ไปหน้า Login ของ ThaID
  // FastAPI จะสร้าง URL ที่มี client_id และ redirect_uri ให้
  getThaiDOAuthUrl() {
    return apiClient<ApiResponse<{ url: string }>>('/auth/thaid/url')
  },

  // ส่ง code ที่ได้จาก ThaID กลับมาให้ FastAPI แลกเป็น JWT token
  loginWithThaID(payload: ThaiDCallbackPayload) {
    return apiClient<ApiResponse<AuthTokenResponse>>('/auth/thaid/callback', {
      method: 'POST',
      body: payload,
    })
  },

  // ส่งผลการสแกนใบหน้าจาก DGA SDK ให้ FastAPI ตรวจสอบและออก JWT token
  verifyDGA(payload: DGAVerifyPayload) {
    return apiClient<ApiResponse<AuthTokenResponse>>('/auth/dga/verify', {
      method: 'POST',
      body: payload,
    })
  },

  // ออกจากระบบ — FastAPI จะ invalidate token บน server
  logout() {
    return apiClient('/auth/logout', { method: 'POST' })
  },
}
