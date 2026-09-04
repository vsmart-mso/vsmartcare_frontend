/**
 * Contract ของ postMessage ระหว่าง frame.ts (ในเฟรม) กับ LivenessRunner.vue (หน้าแม่)
 *
 * ไฟล์นี้ต้อง "บริสุทธิ์" — ห้ามมี side effect และห้าม import อะไรที่มี
 * เพราะทั้งสองฝั่งใช้ร่วมกัน ส่วน frame.ts จะรัน window.AinuEkyc.setup() ทันทีที่ถูก import
 * ถ้าเอา type ไปไว้ที่นั่นแล้วหน้าแม่ import มา จะลาก SDK ติดเข้าไปด้วย
 */

/** ป้ายกำกับผู้ส่ง — ในเฟรมมี iframe ของ AINU ซ้อนอยู่อีกชั้นซึ่งยิง postMessage ของมันเองด้วย */
export const LIVENESS_FRAME_SOURCE = 'liveness-frame'

export type LivenessFrameMessage =
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'ready' }
  /**
   * UI ของ AINU ขึ้นแล้ว พร้อม transactionId
   * ต้องส่งต่อให้หน้าแม่เก็บไว้ — เวลาแจ้งปัญหา AINU ใช้ค่านี้ค้นเคสฝั่งเขา
   * และมันมาก่อนผลลัพธ์เสมอ จึงเป็นสิ่งเดียวที่มีเมื่อผู้ใช้ปิดกลางคัน
   */
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'started'; transactionId: string }
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'result'; payload: unknown }
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'closed' }
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'error'; message: string }

/**
 * URL ของเอกสารในเฟรม
 *
 * Vite emit output ตาม path ที่ relative กับ root ทำให้ URL เดียวกันทั้ง dev และ build
 * ต้องตรงกับ input `liveness` ใน vite.config.ts เสมอ
 */
export const LIVENESS_FRAME_URL = '/src/lib/liveness/frame.html'

/** ชื่อ query param ที่หน้าแม่ใช้ส่ง referenceId เข้าไปในเฟรม */
export const LIVENESS_REF_PARAM = 'ref'

/**
 * สร้าง referenceId สำหรับ 1 ครั้งที่เปิด SDK
 *
 * เอกสาร AINU: "แนะนำให้ส่ง referenceId (transaction ID ฝั่ง partner) ทุกครั้งที่เปิด SDK
 * เพื่อใช้อ้างอิง/ตรวจสอบภายหลัง" — และค่านี้ถูกส่งกลับมาใน result ด้วย
 * จึงเป็นกุญแจเชื่อมระหว่างเคสของเรากับ transaction ฝั่ง AINU
 *
 * ⚠️ ห้ามใส่ข้อมูลส่วนบุคคล (เลขบัตร ชื่อ) — ค่าสุ่มอ้างอิงได้เหมือนกันเมื่อเราเก็บ
 * mapping ไว้ฝั่งเรา ไม่มีเหตุผลให้ส่งข้อมูลประชาชนออกไปนอกระบบ
 * prefix ไว้เพื่อให้ฝั่ง AINU ดูออกว่ามาจากระบบไหนเท่านั้น
 */
export function createLivenessReferenceId(): string {
  return `pmcare-${crypto.randomUUID()}`
}

/** URL ของเฟรมพร้อม referenceId */
export function buildLivenessFrameUrl(referenceId: string): string {
  if (!referenceId) return LIVENESS_FRAME_URL
  return `${LIVENESS_FRAME_URL}?${LIVENESS_REF_PARAM}=${encodeURIComponent(referenceId)}`
}

/** id ของ element ใน frame.html ที่ frame.ts ไปหยิบมาใช้ */
export const FRAME_ELEMENT_IDS = {
  container: 'ekyc-container',
  loading: 'loading',
  loadingText: 'loading-text',
  startButton: 'liveness-start',
  closeButton: 'liveness-close',
  errorBox: 'frame-error',
} as const
