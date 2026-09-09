/**
 * Liveness (AINU eKYC) — คุยกับ case-service ผ่าน BFF
 *
 * สเปกเต็มอยู่ที่ `foropenmdfiles/ainu liveness/liveness_api_spec.md`
 *
 * กฎข้อเดียวที่คุมทั้งไฟล์นี้: **การรายงานผลล้มเหลว ห้ามบล็อกการยื่นคำร้อง**
 * ทุกฟังก์ชันจึงกลืน error เองแล้ว log ไว้ ไม่ throw ออกไปให้หน้าจอต้องจัดการ
 * ผู้ใช้ที่กรอกฟอร์มมา 5 step ต้องไม่ตกม้าตายเพราะ endpoint เก็บสถิติล่ม
 */
import { apiClient } from './client'

/**
 * config ที่ backend จ่ายมาให้ — เป็น flat camelCase
 *
 * ⚠️ สเปกเขียนว่า "ส่งต่อเข้า setup() ได้ตรง ๆ" แต่จริง ๆ ไม่ได้
 * `AinuEkycConfigs` ต้องการ `credential` ซ้อนอีกชั้น (ดู toSdkConfigs ใน frame.ts)
 */
export interface LivenessSdkConfig {
  accountId: string
  accountSecret: string
  flowId: string
  language: string
  referenceId: string
}

export interface LivenessSession {
  reference_id: string
  status: string
  config: LivenessSdkConfig
}

/**
 * สาเหตุที่ **เรา** สรุปเองว่าใช้ระบบไม่ได้ — คนละเรื่องกับ AINU ตอบว่าสแกนไม่ผ่าน
 * ค่านอกเหนือจาก 5 ตัวนี้ backend ตอบ 422 (`NO_ATTEMPT` / `REPLAYED` สงวนไว้ให้เซิร์ฟเวอร์)
 */
export type LivenessSkipReason =
  | 'SDK_LOAD_ERROR'
  | 'NOT_SECURE_CONTEXT'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'USER_SKIPPED'

/**
 * ผลของการเปิด session — แยกกรณี "เปิดได้" ออกจาก "เปิดไม่ได้แต่มีแถวใน DB แล้ว"
 *
 * ตอน backend ตอบ 503 liveness_not_configured มันบันทึกแถว `skipped/NOT_CONFIGURED`
 * ให้แล้วพร้อมส่ง `reference_id` กลับมา เอาไปแนบตอนยื่นคำร้องได้
 * ถ้าไม่แนบ คำร้องจะได้แถว `NO_ATTEMPT` ซึ่งแปลว่า "ไม่มีการสแกน" — คนละสาเหตุกัน
 */
export type LivenessSessionResult =
  | { ok: true; session: LivenessSession }
  | { ok: false; referenceId: string | null }

/** อ่าน HTTP status จาก error ของ ofetch (ชื่อ field ต่างกันตามเวอร์ชัน) */
function statusOf(error: unknown): number {
  const e = error as { status?: number; statusCode?: number; response?: { status?: number } }
  return e?.status ?? e?.statusCode ?? e?.response?.status ?? 0
}

/** ดึง reference_id ที่ backend แนบมาใน error body ของ 503 (ofetch เก็บ body ไว้ที่ `.data`) */
function referenceIdOf(error: unknown): string | null {
  const e = error as { data?: { detail?: { reference_id?: string } } }
  const ref = e?.data?.detail?.reference_id
  return typeof ref === 'string' && ref ? ref : null
}

/**
 * เปิด session ใหม่ — ต้องเรียก **ทุกครั้งที่เริ่มสแกน รวมตอนกดเริ่มใหม่**
 * ห้ามใช้ reference_id เดิมซ้ำ ไม่งั้นการสแกนหลายครั้งจะยุบเป็นแถวเดียว
 *
 * `ok: false` = เปิดไม่ได้ ให้ **ข้ามด่าน** แล้วยื่นคำร้องต่อได้ตามปกติ
 * เคสที่เจอบ่อยสุดคือ 503 บน dev ที่ยังไม่ได้ตั้ง AINU credential —
 * ถ้าไม่ข้ามให้ dev จะยื่นคำร้องไม่ได้เลย
 *
 * ถ้ามี `referenceId` ติดมา (503 liveness_not_configured) **ต้องแนบตอนยื่นคำร้อง**
 * เพื่อให้คำร้องผูกกับแถว `NOT_CONFIGURED` ที่ backend บันทึกไว้ ไม่ใช่ `NO_ATTEMPT`
 * ที่แปลว่า "ไม่มีการสแกน" ทั้งที่สาเหตุจริงคือฝั่งเราตั้งค่าไม่ครบ
 */
export async function openLivenessSession(): Promise<LivenessSessionResult> {
  try {
    const session = await apiClient<LivenessSession>('/v1/liveness/session', { method: 'POST' })
    return { ok: true, session }
  } catch (e) {
    // 401 ไม่ต้องจัดการที่นี่ — client.ts เตะออกจากระบบให้แล้ว
    //
    // 503 liveness_not_configured เป็นสถานะที่ "คาดไว้แล้ว" ไม่ใช่ของพัง —
    // เกิดทุกครั้งบน dev ที่ยังไม่ได้ตั้ง AINU credential ใน case-service/.env
    // ใช้ warn เพื่อไม่ให้กลืนไปกับ error จริงใน console
    if (statusOf(e) === 503) {
      console.warn('[liveness] backend ยังไม่ได้ตั้ง AINU credential (503) — ข้ามด่านให้อัตโนมัติ')
    } else {
      console.error('[liveness] เปิด session ไม่ได้ (status', statusOf(e), ') — ข้ามด่าน:', e)
    }
    return { ok: false, referenceId: referenceIdOf(e) }
  }
}

/**
 * ยิงทันทีใน onReady — **อย่ารอผลจบ**
 * ผู้ใช้ที่เลิกกลางคันจะเหลือรหัสนี้ไว้เป็นทางเดียวที่ตามเรื่องกับ AINU ได้
 */
export async function reportLivenessTransaction(referenceId: string, transactionId: string) {
  await post(referenceId, 'transaction', { transaction_id: transactionId })
}

/**
 * ยิงใน onEkycResult — ส่ง result ทั้งก้อนตามที่ได้มา
 *
 * backend แตก transactionStatus / liveness.reason / failReason ออกเป็นคอลัมน์เอง
 * payload ที่ shape ผิดไม่ทำให้ error — บันทึกเป็น failed แล้วเก็บก้อนดิบไว้ re-parse ทีหลัง
 *
 * ⚠️ ส่ง **ดิบ ไม่ redact** ตามที่ทีมตัดสินร่วมกัน (backend ขอเก็บไว้ verify signature ย้อนหลัง)
 * ผลข้างเคียงที่รับทราบแล้ว: วันที่ AINU เริ่มส่ง images.livenessImage มาจริง
 * ภาพใบหน้าประชาชนจะเข้า DB ทันที (ทุกวันนี้ช่องนั้นยังว่าง) — ถ้าจะกลับลำ
 * `redactLivenessPayload()` ใน lib/liveness/redact.ts พร้อมใช้อยู่แล้ว และไม่กระทบ signature
 */
export async function reportLivenessResult(referenceId: string, payload: unknown) {
  await post(referenceId, 'result', { payload })
}

/** ยิงเมื่อ **เรา** สรุปเองว่าใช้ระบบไม่ได้ — ไม่ใช่ตอน AINU ตอบว่าสแกนไม่ผ่าน */
export async function reportLivenessSkip(referenceId: string, reason: LivenessSkipReason) {
  await post(referenceId, 'skip', { skip_reason: reason })
}

/**
 * ตัวส่งกลางของ 3 endpoint ข้างบน
 *
 * 409 attempt_already_finalized = ส่งซ้ำกับแถวที่จบแล้ว ไม่ใช่ error ที่ต้องสนใจ
 * เกิดได้ปกติ เช่น ผลมาถึงพร้อมกับที่ผู้ใช้กดปิด กลืนตั้งแต่ตรงนี้ไม่ต้องให้ดังถึง console
 */
async function post(referenceId: string, path: string, body: Record<string, unknown>) {
  if (!referenceId) return
  try {
    await apiClient(`/v1/liveness/${encodeURIComponent(referenceId)}/${path}`, {
      method: 'POST',
      body,
    })
  } catch (e) {
    if (statusOf(e) === 409) return
    console.error(`[liveness] ส่ง /${path} ไม่สำเร็จ (เดินต่อได้):`, e)
  }
}
