// Master lookup ผ่าน BFF — path ในโค้ดเป็น `/v1/lookups/...` ต่อท้าย base ที่รวม prefix
// (เช่น `VITE_API_URL=http://localhost:8000/api-vsmartcare` → `/api-vsmartcare/v1/lookups/...`)
// ใช้ apiClient (แนบ X-API-Key เมื่อตั้ง VITE_BFF_API_KEY)

import { apiClient } from './client'

/** ตอบจาก `GET /v1/lookups/prefix-types` — สอดคล้อง case-service `PrefixTypeRead` */
export interface PrefixType {
  id: number
  name: string
}

export const lookupsApi = {
  /** รายการคำนำหน้าชื่อ (นาย / นาง / นางสาว ฯลฯ) */
  async fetchPrefixTypes() {
    const path = '/v1/lookups/prefix-types'
    console.log('[lookupsApi.fetchPrefixTypes] เรียก', path)
    try {
      const data = await apiClient<PrefixType[]>(path, { method: 'GET' })
      console.log('[lookupsApi.fetchPrefixTypes] สำเร็จ จำนวน', data.length, data)
      return data
    } catch (err) {
      console.error('[lookupsApi.fetchPrefixTypes] ล้มเหลว', err)
      throw err
    }
  },
}
