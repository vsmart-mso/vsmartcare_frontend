// ไฟล์นี้เรียกว่า "barrel file" — ทำหน้าที่รวม export ทั้งหมดของโฟลเดอร์ api/ ไว้ที่เดียว
//
// ข้อดีคือ: แทนที่จะเขียน import จากหลายไฟล์แบบนี้
//   import { apiClient } from '@/api/client'
//   import { authApi } from '@/api/auth'
//
// เราสามารถเขียนบรรทัดเดียวได้ว่า
//   import { apiClient, authApi } from '@/api'

export { apiClient } from './client'
export { authApi, redirectBrowserToThaIDLogin } from './auth'
export type {
  DGAVerifyPayload,
  AuthTokenResponse,
  ThaIDLoginStartResponse,
  ThaIDLoginStatusResponse,
  MeResponse,
} from './auth'
