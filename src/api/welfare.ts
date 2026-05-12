// API calls สำหรับ PDPA consent และ screening log
// ทุก endpoint ผ่าน BFF (VITE_API_URL)

import { apiClient } from './client'

// ─── Multipart upload helper ────────────────────────────────────────────────────
// ไม่ใช้ apiClient เพราะ apiClient ตั้ง Content-Type: application/json ไว้ล่วงหน้า
// การ upload ไฟล์ต้องให้ browser กำหนด Content-Type: multipart/form-data พร้อม boundary เอง
async function _postMultipart<T = unknown>(path: string, form: FormData): Promise<T> {
  const baseURL = ((import.meta.env.VITE_API_URL as string) ?? '').replace(/\/$/, '')
  const token   = sessionStorage.getItem('auth_token')
  const bffKey  = import.meta.env.VITE_BFF_API_KEY as string | undefined

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token)  headers['Authorization'] = `Bearer ${token}`
  if (bffKey) headers['X-API-Key']     = bffKey

  const res = await fetch(`${baseURL}${path}`, { method: 'POST', headers, body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`) as Error & { data: unknown }
    err.data = data
    throw err
  }
  return data as T
}

// ─── PDPA Consent ─────────────────────────────────────────────────────────────

export interface ConsentPayload {
  person_id: number
  consent_type?: string | null
  initial_pdpa_accepted: boolean
  initial_terms_accepted: boolean
  initial_warning_accepted: boolean
  final_data_correct_accepted?: boolean
}

export interface ConsentResponse {
  id: number
  person_id: number
  consent_type: string | null
  initial_pdpa_accepted: boolean
  initial_terms_accepted: boolean
  initial_warning_accepted: boolean
  final_data_correct_accepted: boolean
  created_at: string
  updated_at: string
}

// ─── Screening Log ─────────────────────────────────────────────────────────────

export interface ScreeningInputSnapshot {
  birthdate: string   // YYYY-MM-DD
  age: number
  occupation: string
  annual_income: number
}

export interface ScreeningPayload {
  person_id: number
  criteria_version?: string | null
  screening_status: boolean            // true = ผ่าน, false = ไม่ผ่าน
  failure_reason_code?: string | null  // เช่น "AGE_UNDER_18" หรือ "INCOME_OVER_100000"
  input_data_snapshot?: ScreeningInputSnapshot | null
  ip_address?: string | null
  user_agent?: string | null
}

export interface ScreeningResponse {
  id: number
  person_id: number
  screening_status: boolean
  failure_reason_code: string | null
  input_data_snapshot: ScreeningInputSnapshot | null
}

// ─── Case Display (สรุปสถานะคำร้อง) ────────────────────────────────────────────

export interface CaseStatusDisplay {
  id: number
  description_public: string
  description_staff: string
  color: string
}

export interface CaseDisplayRead {
  applicant_id: number
  case_number: string | null
  datetime_create: string
  time_count_process: number | null
  is_existing_case: boolean
  current_status: CaseStatusDisplay | null
  description_public: string | null
}

// ─── Case Submission ────────────────────────────────────────────────────────────

export interface CaseApplicantPayload {
  persons_id: number
  requester_relation_id: number
  marital_status_id: number
  mobile_phone?: string | null
  home_phone?: string | null
  fax_number?: string | null
  email_address?: string | null
  problem_details?: string | null
  bank_name_id?: number | null
  bank_account_no?: string | null
  age?: number | null
}

export interface CaseAddressPayload {
  sub_district_postcode_id: number
  address_type_id: number
  sub_lane?: string | null
  house_name?: string | null
  road?: string | null
  house_moo?: string | null
  house_number?: string | null
  latitude?: string | null
  longitude?: string | null
}

export interface CaseIncomeSourcePayload {
  income_source_type_id: number
  other_details?: string | null
}

export interface CaseEconomicInfoPayload {
  housing_types_id?: number | null
  occupation?: string | null
  monthly_income?: number | null
  household_members?: number | null
  family_occupation?: string | null
  income_sources: CaseIncomeSourcePayload[]
}

export interface CaseDependencyLoadPayload {
  dependency_type_id: number
  dependency_other_text?: string | null
}

export interface CaseWelfareHistoryDetailPayload {
  received_welfare_type_id: number
  received_other?: string | null
}

export interface CaseWelfareHistoryPayload {
  received_count?: number | null
  has_received_welfare: boolean
  total_received_amount?: number | null
  history_details: CaseWelfareHistoryDetailPayload[]
}

export interface CasePayload {
  applicant: CaseApplicantPayload
  addresses: CaseAddressPayload[]
  dependency_loads: CaseDependencyLoadPayload[]
  economic_infos: CaseEconomicInfoPayload[]
  request_type_ids: number[]
  welfare_history?: CaseWelfareHistoryPayload | null
  initial_current_status_id: number
}

export interface CaseCreateResponse {
  applicant: { id: number; [key: string]: unknown }
  [key: string]: unknown
}

// ─── Case Detail (ประวัติสถานะ) ─────────────────────────────────────────────────

export interface StatusLogItem {
  id: number
  current_status: {
    id: number
    description_public: string
    description_staff: string
    color: string
  }
  created_at: string
  updated_at: string
}

export interface CaseDetail {
  applicant: { id: number; [key: string]: unknown }
  welfare_request_status_logs: StatusLogItem[]
  latest_welfare_request_status: StatusLogItem | null
  created_at: string
}

// ─── API functions ─────────────────────────────────────────────────────────────

export const welfareApi = {
  createConsent(payload: ConsentPayload) {
    return apiClient<ConsentResponse>('/v1/welfare-request-consents', {
      method: 'POST',
      body: payload,
    })
  },

  createScreeningLog(payload: ScreeningPayload) {
    return apiClient<ScreeningResponse>('/v1/screening-logs', {
      method: 'POST',
      body: payload,
    })
  },

  // คืน screening log ล่าสุดที่ผ่านเกณฑ์ (screening_status=true) หรือ null ถ้าไม่มี
  getLatestPassedScreening(personId: number) {
    return apiClient<ScreeningResponse | null>('/v1/screening-logs/latest-passed', {
      method: 'GET',
      query: { person_id: personId },
    })
  },

  // คืน list ของคำร้องทั้งหมดของ person (ใช้ตรวจสอบว่ามีคำร้องที่ยังดำเนินการอยู่หรือไม่)
  getCasesDisplay(personsId: number) {
    return apiClient<CaseDisplayRead[]>('/v1/cases/display', {
      method: 'GET',
      query: { persons_id: personsId },
    })
  },

  // ดึงข้อมูลคำร้องแบบละเอียด (รวม welfare_request_status_logs) ตาม applicant_id
  getCase(applicantId: number) {
    return apiClient<CaseDetail>(`/v1/cases/${applicantId}`, { method: 'GET' })
  },

  // บันทึกคำร้องทั้งหมด (applicant + address + dependency + economic + request_types + welfare_history)
  createCase(payload: CasePayload) {
    return apiClient<CaseCreateResponse>('/v1/cases', {
      method: 'POST',
      body: payload,
    })
  },

  // อัปโหลดไฟล์หลักฐานทีละไฟล์หลังจากบันทึกคำร้องสำเร็จ
  // ใช้ _postMultipart แทน apiClient เพื่อให้ browser ตั้ง Content-Type (multipart/form-data) เอง
  uploadEvidence(applicantId: number, attachmentTypeId: number, file: File) {
    const form = new FormData()
    form.append('attachment_type_id', String(attachmentTypeId))
    form.append('file', file)
    return _postMultipart<{ evidence: unknown }>(`/v1/cases/${applicantId}/evidences`, form)
  },
}
