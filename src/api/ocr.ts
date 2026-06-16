// OCR API — เรียกผ่าน BFF proxy (CR-04: ไม่เปิด ocr-service port ตรงอีกต่อไป)
// OCR service ใช้ Gemini Flash อ่านข้อมูลจากรูปสมุดบัญชีธนาคาร
//
// Base URL: VITE_API_URL/v1/ocr/* (BFF proxy → ocr-service:8000 ภายใน docker network)
// Docs:    ocr-service/OCR_API_DOCS.md

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── State ของ OCR process ──────────────────────────────────────────────────

export type OcrState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; response: OcrBankBookResponse }
  | { phase: 'error'; message: string }
  | { phase: 'aborted' }

// ─── OCR Service ─────────────────────────────────────────────────────────────
// OCR ถูก proxy ผ่าน BFF แล้ว (CR-04) — ไม่เรียก ocr-service:8004 ตรงอีกต่อไป
// ทุก request ผ่าน VITE_API_URL (/api-vsmartcare) พร้อม Bearer token ของประชาชน

const ocrBaseUrl = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, '') ?? 'http://localhost:8000/api-vsmartcare'

function _ocrAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = sessionStorage.getItem('auth_token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/**
 * ส่งรูปสมุดบัญชีไป OCR ผ่าน BFF — รองรับการยกเลิกผ่าน AbortSignal
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

  // ไม่ตั้ง Content-Type — browser จะตั้ง multipart/form-data พร้อม boundary เอง
  const res = await fetch(`${ocrBaseUrl}/v1/ocr/bank-book`, {
    method: 'POST',
    headers: _ocrAuthHeaders(),
    body: form,
    signal,
  })

  const data = await res.json().catch(() => ({})) as OcrBankBookResponse & { detail?: string }

  if (!res.ok) {
    const err = new Error(
      typeof data.detail === 'string' ? data.detail : `OCR service error ${res.status}`,
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
  const res = await fetch(
    `${ocrBaseUrl}/v1/ocr/results/${applicantId}?limit=${limit}`,
    { headers: _ocrAuthHeaders() },
  )

  const data = await res.json().catch(() => ({})) as OcrResultsListResponse & { detail?: string }

  if (!res.ok) {
    const err = new Error(
      typeof data.detail === 'string' ? data.detail : `OCR service error ${res.status}`,
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
  const headers = { ..._ocrAuthHeaders(), 'Content-Type': 'application/json' }
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
