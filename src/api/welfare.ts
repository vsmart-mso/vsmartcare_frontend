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
  bank_account_type_id?: number | null   // ประเภทเงินฝาก (FK bank_account_type)
  bank_branch_name?: string | null        // ชื่อสาขาจาก OCR
  age?: number | null
  reset_processing_state?: boolean
}

export interface CaseAddressPayload {
  sub_district_postcode_id: number
  address_type_id: number
  alley?: string | null
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
  housing_types_rent?: number | null  // ค่าเช่าต่อเดือน (บาท) — ส่งเฉพาะเมื่อเลือกบ้านเช่า
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
  request_other_text?: string | null
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
  // หมายเหตุ/เหตุผลที่เจ้าหน้าที่บันทึกตอนเปลี่ยนสถานะ
  // กรณีปฏิเสธ (status 5) field นี้จะเก็บเหตุผลที่คุณสมบัติไม่ผ่านเกณฑ์
  remarks: string | null
  created_at: string
  updated_at: string
}

// ─── Full Case Detail (ใช้สำหรับ Edit Mode — ดึงข้อมูลทั้งหมดมา populate ฟอร์ม) ─

interface _GeoPostcode { name: string }
interface _GeoProvince { name: string }
interface _GeoDistrict { name: string; province: _GeoProvince }
interface _GeoSubDistrict { name: string; district: _GeoDistrict }
interface _GeoSubDistrictPostcode { sub_district: _GeoSubDistrict; postcode: _GeoPostcode }

export interface FullAddressRead {
  id: number
  sub_district_postcode_id: number
  address_type_id: number
  alley: string | null
  sub_lane: string | null
  house_name: string | null
  road: string | null
  house_moo: string | null
  house_number: string | null
  latitude: string | null
  longitude: string | null
  sub_district_postcode: _GeoSubDistrictPostcode | null
}

export interface FullEconomicInfoRead {
  id: number
  housing_types_id: number | null
  housing_types_rent: string | null  // Decimal จาก backend ส่งมาเป็น string
  occupation: string | null
  monthly_income: string | null
  household_members: number | null
  family_occupation: string | null
  income_sources: Array<{ income_source_type_id: number; other_details: string | null }>
}

export interface FullApplicantRead {
  id: number
  persons_id: number
  requester_relation_id: number
  marital_status_id: number
  mobile_phone: string | null
  home_phone: string | null
  fax_number: string | null
  email_address: string | null
  problem_details: string | null
  bank_name_id: number | null
  bank_account_no: string | null
  bank_account_type_id: number | null
  bank_branch_name: string | null
  age: number | null
}

export interface FullCaseDetail {
  applicant: FullApplicantRead
  addresses: FullAddressRead[]
  dependency_loads: Array<{ dependency_type_id: number; dependency_other_text: string | null }>
  economic_infos: FullEconomicInfoRead[]
  welfare_request_types: Array<{ request_type_id: number; request_other_text: string | null }>
  welfare_history: {
    received_count: number | null
    has_received_welfare: boolean
    total_received_amount: string | null
    history_details: Array<{ received_welfare_type_id: number; received_other: string | null }>
  } | null
  welfare_evidences: Array<{
    id: number
    attachment_type_id: number
    file_name: string | null
    file_other_type_name: string | null
  }>
  welfare_request_status_logs: StatusLogItem[]
  latest_welfare_request_status: StatusLogItem | null
  created_at: string | null
  count_037: number
}

// ─── Approve Case (การอนุมัติเคสของเจ้าหน้าที่) ─────────────────────────────────
// ใช้แยก stage ของช่วง "อยู่ระหว่างการเบิก": ถ้า row ล่าสุด approve_status === true
// แปลว่าเจ้าหน้าที่อนุมัติแล้ว (ก้าวจาก 33% → 66%)
export interface ApproveCaseItem {
  id: number
  applicant_id: number
  approve_status: boolean
  user_sdshv: string | null
}

// ─── Review Comments (welfare-edit-request) ────────────────────────────────────

export interface ReviewComment {
  review_field_id: number
  name: string    // machine key เช่น "current_address_house_no"
  label: string   // ป้ายกำกับภาษาไทย เช่น "บ้านเลขที่"
  step: number    // 1–4
  reason: string  // เหตุผลที่ต้องแก้ไข
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
    return apiClient<FullCaseDetail>(`/v1/cases/${applicantId}`, { method: 'GET' })
  },

  // บันทึกคำร้องทั้งหมด (applicant + address + dependency + economic + request_types + welfare_history)
  createCase(payload: CasePayload) {
    return apiClient<CaseCreateResponse>('/v1/cases', {
      method: 'POST',
      body: payload,
    })
  },

  // แก้ไขข้อมูล case ที่มีอยู่แล้ว — ส่งเฉพาะ section ที่ต้องการแก้ (null = ไม่แตะ)
  updateCase(applicantId: number, payload: Partial<CasePayload>) {
    return apiClient<CaseCreateResponse>(`/v1/cases/${applicantId}`, {
      method: 'PATCH',
      body: payload,
    })
  },

  // เพิ่ม log สถานะใหม่ — ใช้ endpoint ของ case_for_staff ที่มีอยู่แล้ว
  addStatusLog(applicantId: number, currentStatusId: number) {
    return apiClient<StatusLogItem>('/v1/case_for_staff/welfare-request-status', {
      method: 'POST',
      body: { applicant_id: applicantId, current_status_id: currentStatusId },
    })
  },

  // ดึงประวัติการอนุมัติเคส (approve_case) ของ applicant — ใช้เช็กว่าอนุมัติแล้วหรือยัง
  // backend คืนรายการเรียงจากใหม่สุด (id desc); ผู้เรียกใช้ดู row ล่าสุด (index 0) เป็นสถานะปัจจุบัน
  getApproveCases(applicantId: number) {
    return apiClient<ApproveCaseItem[]>('/v1/case_for_staff/approve-case', {
      method: 'GET',
      query: { applicant_id: applicantId },
    })
  },

  // ดึง review comments ล่าสุดของ applicant (เมื่อสถานะ=8 ส่งกลับแก้ไข)
  getEditRequestComments(applicantId: number) {
    return apiClient<ReviewComment[]>('/v1/case_for_staff/welfare-edit-request', {
      method: 'GET',
      query: { applicant_id: applicantId },
    })
  },

  // แก้ไขชื่อเอกสาร "อื่นๆ" โดยไม่ต้อง re-upload ไฟล์ใหม่
  // ใช้ใน Edit Mode เมื่อ user เปลี่ยนแค่ชื่อแต่ไม่ได้เปลี่ยนรูป
  updateEvidenceName(applicantId: number, evidenceId: number, name: string) {
    return apiClient(`/v1/cases/${applicantId}/evidences/${evidenceId}`, {
      method: 'PATCH',
      body: { file_other_type_name: name },
    })
  },

  // ลบหลักฐาน (รูป) ออกจาก DB และ disk
  // ใช้ก่อน uploadEvidence เมื่อ user เปลี่ยนรูปใน edit mode เพื่อไม่ให้มีรูปซ้ำซ้อน
  async deleteEvidence(applicantId: number, evidenceId: number): Promise<void> {
    const baseURL = ((import.meta.env.VITE_API_URL as string) ?? '').replace(/\/$/, '')
    const token   = sessionStorage.getItem('auth_token')
    const bffKey  = import.meta.env.VITE_BFF_API_KEY as string | undefined
    const headers: Record<string, string> = {}
    if (token)  headers['Authorization'] = `Bearer ${token}`
    if (bffKey) headers['X-API-Key']     = bffKey
    const res = await fetch(`${baseURL}/v1/cases/${applicantId}/evidences/${evidenceId}`, { method: 'DELETE', headers })
    if (!res.ok) {
      const err = new Error(`${res.status} ${res.statusText}`) as Error & { data: unknown }
      err.data = await res.json().catch(() => ({}))
      throw err
    }
  },

  // อัปโหลดไฟล์หลักฐานทีละไฟล์หลังจากบันทึกคำร้องสำเร็จ
  // ใช้ _postMultipart แทน apiClient เพื่อให้ browser ตั้ง Content-Type (multipart/form-data) เอง
  uploadEvidence(applicantId: number, attachmentTypeId: number, file: File, otherTypeName?: string) {
    const form = new FormData()
    form.append('attachment_type_id', String(attachmentTypeId))
    form.append('file', file)
    // backend บังคับให้ส่ง file_other_type_name เมื่อ attachment_type_id = 99 (อื่นๆ)
    if (otherTypeName) form.append('file_other_type_name', otherTypeName)
    return _postMultipart<{ evidence: unknown }>(`/v1/cases/${applicantId}/evidences`, form)
  },

  // ─── Satisfaction Survey ─────────────────────────────────────────────────────

  // บันทึกผลประเมินความพึงพอใจ
  // survey_type: 'system_usage' (หลังยื่นฟอร์ม) | 'aid_received' (หลังเบิกจ่าย)
  async submitSatisfaction(payload: {
    applicant_id: number
    survey_type: 'system_usage' | 'aid_received'
    rating: number         // 1-5
    comment?: string | null
  }): Promise<{ id: number }> {
    return apiClient<{ id: number }>('/v1/satisfaction', { method: 'POST', body: payload })
  },

  // ดึงผลประเมินทั้งหมดของ applicant — ใช้เช็กว่าเคยประเมินแล้วหรือยัง
  async getSatisfactionSurveys(applicantId: number): Promise<{ id: number; survey_type: string; rating: number }[]> {
    return apiClient<{ id: number; survey_type: string; rating: number }[]>(
      `/v1/satisfaction?applicant_id=${applicantId}`,
      { method: 'GET' },
    )
  },

  // ดาวน์โหลดรูปหลักฐานจาก server แล้วแปลงเป็น blob URL สำหรับแสดงใน <img>
  // ใช้ใน Edit Mode เพื่อ preview รูปเดิมที่ยังไม่ได้เปลี่ยน
  async fetchEvidenceAsObjectUrl(applicantId: number, evidenceId: number): Promise<string> {
    const base = ((import.meta.env.VITE_API_URL as string) ?? '').replace(/\/$/, '')
    const token  = sessionStorage.getItem('auth_token')
    const bffKey = import.meta.env.VITE_BFF_API_KEY as string | undefined
    const headers: Record<string, string> = {}
    if (token)  headers['Authorization'] = `Bearer ${token}`
    if (bffKey) headers['X-API-Key']     = bffKey
    try {
      const res = await fetch(`${base}/v1/cases/${applicantId}/evidences/${evidenceId}/file`, { headers })
      if (!res.ok) return ''
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch {
      return ''
    }
  },
}
