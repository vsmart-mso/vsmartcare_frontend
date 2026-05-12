// Master lookup ผ่าน BFF — path ในโค้ดเป็น `/v1/lookups/...` ต่อท้าย base ที่รวม prefix
// (เช่น `VITE_API_URL=http://localhost:8000/api-vsmartcare` → `/api-vsmartcare/v1/lookups/...`)
// ใช้ apiClient (แนบ X-API-Key เมื่อตั้ง VITE_BFF_API_KEY)

import { apiClient } from './client'

// โครงสร้างข้อมูลที่ได้จาก API ทุก lookup endpoint ส่งกลับมาในรูปแบบเดียวกัน
export interface LookupItem {
  id: number
  name: string
}

/** ตอบจาก `GET /v1/lookups/prefix-types` */
export type PrefixType = LookupItem
/** ตอบจาก `GET /v1/lookups/marital-status-types` */
export type MaritalStatusType = LookupItem
/** ตอบจาก `GET /v1/lookups/housing-types` */
export type HousingType = LookupItem
/** ตอบจาก `GET /v1/lookups/income-source-types` */
export type IncomeSourceType = LookupItem
/** ตอบจาก `GET /v1/lookups/dependency-types` */
export type DependencyType = LookupItem
/** ตอบจาก `GET /v1/lookups/received-welfare-types` */
export type ReceivedWelfareType = LookupItem
/** ตอบจาก `GET /v1/lookups/request-types` */
export type RequestType = LookupItem
/** ตอบจาก `GET /v1/lookups/bank-names` */
export type BankNameType = LookupItem

// ─── Module-level cache ────────────────────────────────────────────────────────
// เก็บ Promise ไว้ด้วย เพื่อกัน race condition กรณีมีการเรียกพร้อมกันก่อน cache เสร็จ
const _cache = new Map<string, LookupItem[]>()
const _pending = new Map<string, Promise<LookupItem[]>>()

async function fetchLookup(path: string): Promise<LookupItem[]> {
  // คืนจาก cache ถ้ามีแล้ว
  if (_cache.has(path)) return _cache.get(path)!

  // ถ้ากำลัง fetch อยู่ (อาจมีหลาย component เรียกพร้อมกัน) ให้รอ Promise เดิม
  if (_pending.has(path)) return _pending.get(path)!

  const promise = apiClient<LookupItem[]>(path, { method: 'GET' })
    .then(data => {
      _cache.set(path, data)
      _pending.delete(path)
      return data
    })
    .catch(err => {
      _pending.delete(path)
      throw err
    })

  _pending.set(path, promise)
  return promise
}

export const lookupsApi = {
  /** คำนำหน้าชื่อ (นาย / นาง / นางสาว ฯลฯ) */
  fetchPrefixTypes: () => fetchLookup('/v1/lookups/prefix-types'),

  /** สถานภาพสมรส */
  fetchMaritalStatusTypes: () => fetchLookup('/v1/lookups/marital-status-types'),

  /** ประเภทที่อยู่อาศัย */
  fetchHousingTypes: () => fetchLookup('/v1/lookups/housing-types'),

  /** แหล่งที่มาของรายได้ */
  fetchIncomeSourceTypes: () => fetchLookup('/v1/lookups/income-source-types'),

  /** ประเภทการอุปการะ (ภาระการดูแล) */
  fetchDependencyTypes: () => fetchLookup('/v1/lookups/dependency-types'),

  /** ประเภทสวัสดิการที่เคยได้รับ */
  fetchReceivedWelfareTypes: () => fetchLookup('/v1/lookups/received-welfare-types'),

  /** ประเภทความช่วยเหลือที่ร้องขอ */
  fetchRequestTypes: () => fetchLookup('/v1/lookups/request-types'),

  /** รายชื่อธนาคาร */
  fetchBankNames: () => fetchLookup('/v1/lookups/bank-names'),
}
