// Geo API ผ่าน BFF — จังหวัด → อำเภอ → ตำบล + รหัสไปรษณีย์
// path ตรงกับ bff-vsmartcare `GET /v1/geo/...`
// ข้อมูลทุก endpoint ถูก cache ไว้ใน module scope — ไม่เรียก API ซ้ำใน session เดียวกัน

import { apiClient } from './client'

export interface Province {
  id: number
  code: string | null
  name: string
}

export interface District {
  id: number
  code: string | null
  name: string
  province_id: number
}

export interface PostcodeItem {
  id: number
  name: string  // รหัสไปรษณีย์ เช่น "10200"
}

// แถว bridge sub_districts_postcode — ใช้ id นี้ตอนบันทึกที่อยู่ (sub_district_postcode_id)
export interface SubDistrictPostcodeLink {
  id: number               // bridge ID → ส่งไป API ตอน submit
  sub_district_id: number
  postcode_id: number
  postcode: PostcodeItem
}

export interface SubDistrict {
  id: number
  code: string | null
  name: string
  district_id: number
  postcodes: PostcodeItem[]
  sub_districts_postcode: SubDistrictPostcodeLink[]
}

// ─── Module-level cache ────────────────────────────────────────────────────────
let _provinces: Province[] | null = null
let _provincesPromise: Promise<Province[]> | null = null

const _districts = new Map<number, District[]>()
const _districtsPromise = new Map<number, Promise<District[]>>()

const _subDistricts = new Map<number, SubDistrict[]>()
const _subDistrictsPromise = new Map<number, Promise<SubDistrict[]>>()

export const geoApi = {
  /** รายการจังหวัดทั้งหมด — fetch ครั้งเดียว cache ตลอด session */
  async fetchProvinces(): Promise<Province[]> {
    if (_provinces) return _provinces
    if (_provincesPromise) return _provincesPromise

    _provincesPromise = apiClient<Province[]>('/v1/geo/provinces', { method: 'GET' })
      .then(data => { _provinces = data; _provincesPromise = null; return data })
      .catch(err => { _provincesPromise = null; throw err })

    return _provincesPromise
  },

  /** รายการอำเภอตามจังหวัด — cache ต่อ provinceId */
  async fetchDistricts(provinceId: number): Promise<District[]> {
    if (_districts.has(provinceId)) return _districts.get(provinceId)!
    if (_districtsPromise.has(provinceId)) return _districtsPromise.get(provinceId)!

    const promise = apiClient<District[]>(`/v1/geo/districts?province_id=${provinceId}`, { method: 'GET' })
      .then(data => { _districts.set(provinceId, data); _districtsPromise.delete(provinceId); return data })
      .catch(err => { _districtsPromise.delete(provinceId); throw err })

    _districtsPromise.set(provinceId, promise)
    return promise
  },

  /** รายการตำบลพร้อมรหัสไปรษณีย์และ bridge ID — cache ต่อ districtId */
  async fetchSubDistricts(districtId: number): Promise<SubDistrict[]> {
    if (_subDistricts.has(districtId)) return _subDistricts.get(districtId)!
    if (_subDistrictsPromise.has(districtId)) return _subDistrictsPromise.get(districtId)!

    const promise = apiClient<SubDistrict[]>(`/v1/geo/sub-districts?district_id=${districtId}`, { method: 'GET' })
      .then(data => { _subDistricts.set(districtId, data); _subDistrictsPromise.delete(districtId); return data })
      .catch(err => { _subDistrictsPromise.delete(districtId); throw err })

    _subDistrictsPromise.set(districtId, promise)
    return promise
  },
}
