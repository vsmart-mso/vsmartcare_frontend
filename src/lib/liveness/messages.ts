/**
 * Contract ของ postMessage ระหว่าง frame.ts (ในเฟรม) กับ LivenessRunner.vue (หน้าแม่)
 *
 * ไฟล์นี้ต้อง "บริสุทธิ์" — ห้ามมี side effect และห้าม import อะไรที่มี
 * เพราะทั้งสองฝั่งใช้ร่วมกัน ส่วน frame.ts จะรัน window.AinuEkyc.setup() ทันทีที่ถูก import
 * ถ้าเอา type ไปไว้ที่นั่นแล้วหน้าแม่ import มา จะลาก SDK ติดเข้าไปด้วย
 */

/** ป้ายกำกับผู้ส่ง — ในเฟรมมี iframe ของ AINU ซ้อนอยู่อีกชั้นซึ่งยิง postMessage ของมันเองด้วย */
export const LIVENESS_FRAME_SOURCE = 'liveness-frame'

/** ป้ายกำกับฝั่งหน้าแม่ — เฟรมรับเฉพาะข้อความที่ติดป้ายนี้ */
export const LIVENESS_HOST_SOURCE = 'liveness-host'

/**
 * config ที่ backend จ่ายมาทาง `POST /v1/liveness/session`
 *
 * นิยามซ้ำที่นี่แทนที่จะ import จาก `@/api/liveness` เพื่อรักษากฎ "ไฟล์นี้ต้องบริสุทธิ์"
 * — เฟรมเป็น entry แยกที่ไม่ควรลาก apiClient เข้าไป
 */
export interface LivenessFrameConfig {
  accountId: string
  accountSecret: string
  flowId: string
  language: string
  referenceId: string
}

/**
 * สาเหตุที่เฟรมสรุปได้เองว่าใช้ระบบไม่ได้ — เป็น subset ของ `LivenessSkipReason`
 * ใน `@/api/liveness` (ที่นั่นมี `USER_SKIPPED` เพิ่ม ซึ่งหน้าแม่เป็นคนตัดสิน ไม่ใช่เฟรม)
 * แก้ที่นี่แล้วต้องไปดูที่นั่นด้วย
 */
export type LivenessFrameSkipCode =
  | 'SDK_LOAD_ERROR'
  | 'NOT_SECURE_CONTEXT'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTH_ERROR'

/** เฟรม → หน้าแม่ */
export type LivenessFrameMessage =
  /**
   * เฟรมพร้อมรับ config แล้ว — ต้องมาก่อน setup() เสมอ
   * ยิงซ้ำเป็นระยะจนกว่าจะได้ config เพื่อกันกรณีหน้าแม่ยังติด listener ไม่ทัน
   */
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'need-config' }
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'ready' }
  /**
   * UI ของ AINU ขึ้นแล้ว พร้อม transactionId
   * ต้องส่งต่อให้หน้าแม่เก็บไว้ — เวลาแจ้งปัญหา AINU ใช้ค่านี้ค้นเคสฝั่งเขา
   * และมันมาก่อนผลลัพธ์เสมอ จึงเป็นสิ่งเดียวที่มีเมื่อผู้ใช้ปิดกลางคัน
   */
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'started'; transactionId: string }
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'result'; payload: unknown }
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'closed' }
  /**
   * เฟรมดักได้ว่าฝั่ง AINU ตอบผิดปกติ (จาก network sniffer ใน frame.ts)
   * ไม่ได้แปลว่า flow จบ — SDK อาจค้างอยู่แล้วผู้ใช้ต้องกดยกเลิกเอง
   * หน้าแม่จำรหัสนี้ไว้ใช้แทน USER_SKIPPED ตอนที่ flow จบจริง
   */
  | { source: typeof LIVENESS_FRAME_SOURCE; type: 'provider-error'; code: LivenessFrameSkipCode }
  /** เปิดระบบไม่ได้เลย — คนละเรื่องกับผู้ใช้ทำไม่ผ่าน */
  | {
      source: typeof LIVENESS_FRAME_SOURCE
      type: 'error'
      message: string
      /** ไม่มี = เปิดไม่ได้ด้วยสาเหตุที่ยังแมปเป็น skip_reason ไม่ได้ */
      code?: LivenessFrameSkipCode
    }

/** หน้าแม่ → เฟรม */
export type LivenessHostMessage = {
  source: typeof LIVENESS_HOST_SOURCE
  type: 'config'
  config: LivenessFrameConfig
  /**
   * โควตาต่อ 1 รอบ — ใช้ประกอบข้อความบนจอเริ่มเท่านั้น ไม่ได้บังคับอะไรในเฟรม
   * หน้าแม่เป็นคนคุมโควตาจริง ส่งมาเพื่อไม่ให้ต้อง hardcode เลขเดียวกันสองที่
   */
  maxAttempts: number
}

/**
 * URL ของเอกสารในเฟรม
 *
 * Vite emit output ตาม path ที่ relative กับ root ทำให้ URL เดียวกันทั้ง dev และ build
 * ต้องตรงกับ input `liveness` ใน vite.config.ts เสมอ
 *
 * ⚠️ ไม่มี query param แล้ว — accountSecret ห้ามเดินทางผ่าน URL เด็ดขาด
 * (โผล่ใน address bar, history, referrer) config ทั้งก้อนไปทาง postMessage อย่างเดียว
 */
export const LIVENESS_FRAME_URL = '/src/lib/liveness/frame.html'

/** id ของ element ใน frame.html ที่ frame.ts ไปหยิบมาใช้ */
export const FRAME_ELEMENT_IDS = {
  container: 'ekyc-container',
  loading: 'loading',
  /** spinner + ข้อความ "กำลังเตรียม..." — ซ่อนตอน SDK พร้อม แล้วโชว์ปุ่มเริ่มแทน */
  loadingStatus: 'loading-status',
  loadingText: 'loading-text',
  promptText: 'liveness-prompt-text',
  startButton: 'liveness-start',
  closeButton: 'liveness-close',
  errorBox: 'frame-error',
} as const
