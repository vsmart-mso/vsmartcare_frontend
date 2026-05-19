// OCR API — เรียก OCR Service โดยตรง (ไม่ผ่าน BFF)
// OCR service ใช้ Gemini 2.5 Flash อ่านข้อมูลจากรูปสมุดบัญชีธนาคาร
//
// Base URL: http://localhost:8004 (dev) / http://ocr-service:8000 (docker)
// Docs:    ocr-service/OCR_API_DOCS.md

// ─── Types ──────────────────────────────────────────────────────────────────

export type MatchStatus = 'match' | 'review' | 'mismatch' | 'blurry' | 'no_text'

export interface BankInfo {
  account_number: string | null
  account_name: string | null
  bank_name: string | null
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

const ocrBaseUrl = (import.meta.env.VITE_OCR_API_URL as string)?.replace(/\/$/, '') ?? 'http://localhost:8004'
const ocrApiKey = import.meta.env.VITE_OCR_API_KEY as string | undefined

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

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (ocrApiKey) {
    headers['Authorization'] = `Bearer ${ocrApiKey}`
  }
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
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (ocrApiKey) headers['Authorization'] = `Bearer ${ocrApiKey}`

  const res = await fetch(
    `${ocrBaseUrl}/v1/ocr/results/${applicantId}?limit=${limit}`,
    { headers },
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (ocrApiKey) headers['Authorization'] = `Bearer ${ocrApiKey}`

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
