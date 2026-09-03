/**
 * แปลผล liveness ที่ไม่ผ่าน เป็นข้อความไทยที่บอกสาเหตุจริง
 *
 * ตามสไตล์เดียวกับ src/utils/authUserMessages.ts — ผู้ใช้เห็นข้อความ ไม่เห็นรหัส
 *
 * ⚠️ รหัสใน REASON_MESSAGES ยืนยันจากของจริงแค่ TIMEOUT กับ FACE_NOT_FOUND
 *    ที่เหลือเดาจากพฤติกรรมที่พบตอนทดสอบ ถ้าเจอรหัสใหม่ตอน UAT จะขึ้นใน
 *    วงเล็บท้ายข้อความ (เฉพาะ dev) ให้เอามาเติมในตารางนี้
 */

const DEFAULT_MESSAGE = 'ยืนยันตัวตนไม่สำเร็จ กรุณากดถัดไปเพื่อลองใหม่อีกครั้ง'

/**
 * อ่าน transactionStatus ไม่ออก — ต่างจาก "ไม่ผ่าน" คนละเรื่อง
 * อาจแปลว่า AINU ย้ายตำแหน่ง key ในผลลัพธ์ ซึ่งจะทำให้คนที่ผ่านจริงถูกตีว่าไม่ผ่าน
 * ต้องแยกให้ออกเวลาไล่ปัญหา
 */
const UNREADABLE_MESSAGE =
  'ระบบอ่านผลการยืนยันตัวตนไม่ได้ กรุณาลองใหม่อีกครั้ง หากยังไม่ได้กรุณาแจ้งผู้ดูแลระบบ'

const REASON_MESSAGES: Record<string, string> = {
  // ── ยืนยันจากของจริงแล้ว ──
  timeout: 'ใช้เวลานานเกินไป กรุณาลองใหม่ และทำตามคำแนะนำบนหน้าจอให้ทันนะคะ',
  face_not_found:
    'ไม่พบใบหน้าในกล้อง กรุณานั่งให้ใกล้กล้องขึ้น และให้แสงส่องมาที่ใบหน้า',

  // engine ของ AINU เริ่มไม่ขึ้นตั้งแต่แรก — กล้องยังไม่เคยเปิด ไม่ใช่ผู้ใช้ทำไม่ผ่าน
  // เจอตอนเปิดผ่าน http://<LAN IP> ซึ่งไม่ใช่ secure context (frame.ts ดักไว้ก่อนแล้ว)
  init_error:
    'เปิดกล้องไม่ได้ ระบบยืนยันตัวตนเริ่มทำงานไม่สำเร็จ — ต้องเปิดหน้าเว็บผ่าน https เท่านั้น',

  // ── เดาจากพฤติกรรมที่พบ ยังไม่ยืนยัน ──
  multiple_faces: 'พบมากกว่าหนึ่งใบหน้าในกล้อง กรุณาให้มีเพียงท่านเดียวในภาพ',
  face_too_small: 'ใบหน้าเล็กเกินไป กรุณาขยับเข้าใกล้กล้องมากขึ้น',
  spoof: 'ระบบตรวจไม่พบว่าเป็นบุคคลจริง กรุณาถ่ายจากใบหน้าจริง ไม่ใช่ภาพถ่ายหรือหน้าจอ',
  not_live: 'ระบบตรวจไม่พบว่าเป็นบุคคลจริง กรุณาถ่ายจากใบหน้าจริง ไม่ใช่ภาพถ่ายหรือหน้าจอ',
  retry_exceeded: 'ลองครบจำนวนครั้งที่กำหนดแล้ว กรุณาเริ่มใหม่อีกครั้ง',
  cancelled: 'การยืนยันตัวตนถูกยกเลิก กรุณากดถัดไปเพื่อลองใหม่',
  camera_permission_denied:
    'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาเปิดสิทธิ์กล้องให้เว็บไซต์นี้แล้วลองใหม่',
}

export interface LivenessFailure {
  /** ข้อความที่แสดงให้ผู้ใช้ */
  message: string
  /** รหัสดิบจาก AINU — ว่างถ้าไม่มี ใช้ตอน debug และตอนทำ log ฝั่ง backend */
  code: string
  /** สถานะที่อ่านได้ ('' = อ่านไม่ออก) */
  status: string
  /**
   * true = อ่าน transactionStatus ไม่ออก ไม่ใช่ผู้ใช้ทำไม่ผ่าน
   * ถ้าเจอค่านี้บ่อย ให้สงสัย shape ของ payload ก่อนสงสัยตัวผู้ใช้
   */
  unreadable: boolean
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

/**
 * อ่าน transactionStatus จาก payload
 * เอกสาร AINU ขัดกันเองเรื่องตำแหน่ง key เลยลองหลายที่
 * ค่ามี 3 แบบ: completed / failed / pending_DOPA (flow นี้ไม่มี DOPA)
 */
export function readTransactionStatus(result: unknown): string {
  const r = asRecord(result)
  const nested = asRecord(r?.data)
  const raw = r?.transactionStatus ?? nested?.transactionStatus
  return typeof raw === 'string' ? raw : ''
}

/** ไล่หารหัสสาเหตุตามตำแหน่งที่ AINU เคยวางไว้ — ตัวแรกที่เจอชนะ */
function readFailureCode(result: unknown): string {
  const r = asRecord(result)
  const nested = asRecord(r?.data)

  const candidates = [
    asRecord(r?.liveness)?.reason,
    asRecord(nested?.liveness)?.reason,
    r?.failReason,
    nested?.failReason,
    r?.reason,
    nested?.reason,
  ]

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

/** แปลง payload ที่ไม่ผ่าน เป็นสาเหตุ + ข้อความไทย */
export function describeLivenessFailure(result: unknown): LivenessFailure {
  const status = readTransactionStatus(result)
  const code = readFailureCode(result)
  const unreadable = status === ''

  let message: string
  if (unreadable) {
    message = UNREADABLE_MESSAGE
  } else {
    message = REASON_MESSAGES[code.toLowerCase()] ?? DEFAULT_MESSAGE
  }

  // ตอน dev ต่อรหัสจริงท้ายข้อความ เพื่อให้เก็บรหัสที่ยังไม่รู้จักได้จากหน้าจอ
  // (ทดสอบบนมือถือเปิด console ไม่ได้) — production ไม่โชว์
  if (import.meta.env.DEV) {
    const debug = [status || 'no-status', code || 'no-code'].join(' / ')
    message = `${message} [${debug}]`
  }

  return { message, code, status, unreadable }
}
