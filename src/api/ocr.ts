// OCR API — เรียกผ่าน BFF (ME-02) พร้อม citizen Bearer token

// ─── OCR via BFF ─────────────────────────────────────────────────────────────

const ocrBaseUrl = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, '') ?? 'http://localhost:8000/api-vsmartcare'

function ocrAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { Accept: 'application/json', ...extra }
  const token = sessionStorage.getItem('auth_token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export type MatchStatus = 'match' | 'review' | 'mismatch' | 'blurry' | 'no_text'

export interface BankInfo {
  account_number: string | null
  account_name: string | null
  bank_name: string | null
  deposit_type: string | null   // ประเภทเงินฝาก เช่น "ออมทรัพย์"
  branch_name: string | null    // ชื่อสาขา เช่น "เซ็นทรัลเวิลด์"
  branch_code: string | null    // รหัสสาขา (ตัวเลข 2-6 หลัก)
  match_status: MatchStatus
  fuzzy_score: number
}

export interface OcrBankBookResponse {
  id: number            // OCR result ID — ใช้สำหรับ PATCH link ทีหลัง
  markdown: string
  bank_info: BankInfo | null
  target_name_checked: string
  pre_file: string
}

/** record ใน GET /v1/ocr/results/{applicant_id} */
export interface OcrResultRecord extends OcrBankBookResponse {
  id: number
  applicant_id: number
  account_number: string | null
  account_name: string | null
  bank_name: string | null
  deposit_type: string | null
  branch_name: string | null
  branch_code: string | null
  match_status: MatchStatus
  fuzzy_score: number
  created_at: string
  updated_at: string
}

export interface OcrResultsListResponse {
  applicant_id: number
  results: OcrResultRecord[]
  count: number
}

export interface OcrErrorResponse {
  status: number
  detail: string
}

function ocrErrorMessage(detail: unknown, status: number): string {
  const code = typeof detail === 'string' ? detail : ''
  if (code === 'gemini_api_key_leaked' || code === 'gemini_api_key_invalid') {
    return 'บริการอ่านรูปสมุดบัญชีชั่วคราวไม่พร้อมใช้งาน กรุณากรอกข้อมูลบัญชีด้วยตนเอง'
  }
  if (code === 'gemini_api_key_not_configured') {
    return 'บริการ OCR ยังไม่ได้ตั้งค่า กรุณากรอกข้อมูลบัญชีด้วยตนเอง'
  }
  if (code === 'gemini_api_error' || status === 502) {
    return 'ไม่สามารถอ่านรูปสมุดบัญชีได้ในขณะนี้ กรุณากรอกข้อมูลด้วยตนเอง'
  }
  if (code) return code
  return `OCR service error ${status}`
}

// ─── State ของ OCR process ──────────────────────────────────────────────────

export type OcrState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; response: OcrBankBookResponse }
  | { phase: 'error'; message: string }
  | { phase: 'aborted' }

// ─── OCR Service ─────────────────────────────────────────────────────────────

/**
 * ส่งรูปสมุดบัญชีไป OCR — รองรับการยกเลิกผ่าน AbortSignal
 *
 * @param file         รูปสมุดบัญชี (JPEG / PNG / WebP)
 * @param targetName   ชื่อ-นามสกุลที่ต้องการเทียบ เช่น "นาย ภูริพัฒน ปัญญา"
 * @param applicantId  ID ของ applicant (null = ยังไม่มี — จะ link ทีหลังหลัง submit)
 * @param signal       AbortSignal สำหรับยกเลิกเมื่อผู้ใช้เปลี่ยนรูป
 */
export async function ocrBankBook(
  file: File,
  targetName: string,
  applicantId?: number | null,
  signal?: AbortSignal,
): Promise<OcrBankBookResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('target_name', targetName)
  if (applicantId != null) {
    form.append('applicant_id', String(applicantId))
  }

  const headers = ocrAuthHeaders()
  // ไม่ตั้ง Content-Type — browser จะตั้ง multipart/form-data พร้อม boundary เอง

  const res = await fetch(`${ocrBaseUrl}/v1/ocr/bank-book`, {
    method: 'POST',
    headers,
    body: form,
    signal,
  })

  const data = await res.json().catch(() => ({})) as OcrBankBookResponse & { detail?: string }

  if (!res.ok) {
    const err = new Error(
      ocrErrorMessage(data.detail, res.status),
    ) as Error & { status: number }
    err.status = res.status
    throw err
  }

  return data as OcrBankBookResponse
}

/**
 * ดึงผล OCR ทั้งหมดของ applicant_id — เรียงจากล่าสุดก่อน
 * ใช้ในหน้า case-tracking หรือหลัง submit เพื่อดูผล OCR ที่บันทึกไว้
 */
export async function fetchOcrResults(
  applicantId: number,
  limit = 10,
): Promise<OcrResultsListResponse> {
  const headers = ocrAuthHeaders()

  const res = await fetch(
    `${ocrBaseUrl}/v1/ocr/results/${applicantId}?limit=${limit}`,
    { headers },
  )

  const data = await res.json().catch(() => ({})) as OcrResultsListResponse & { detail?: string }

  if (!res.ok) {
    const err = new Error(
      ocrErrorMessage(data.detail, res.status),
    ) as Error & { status: number }
    err.status = res.status
    throw err
  }

  return data as OcrResultsListResponse
}

/**
 * ผูกผล OCR กับ applicant_id หลัง submit — เรียกหลังจาก createCase สำเร็จ
 */
export async function linkOcrResult(
  ocrResultId: number,
  applicantId: number,
): Promise<OcrResultRecord> {
  const headers = ocrAuthHeaders({ 'Content-Type': 'application/json' })

  const res = await fetch(`${ocrBaseUrl}/v1/ocr/results/${ocrResultId}/link`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ applicant_id: applicantId }),
  })

  const data = await res.json().catch(() => ({})) as OcrResultRecord & { detail?: string }

  if (!res.ok) {
    const err = new Error(
      typeof data.detail === 'string' ? data.detail : `OCR link error ${res.status}`,
    ) as Error & { status: number }
    err.status = res.status
    throw err
  }

  return data as OcrResultRecord
}
