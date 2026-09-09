/**
 * แปลผล liveness ที่ไม่ผ่าน เป็นข้อความไทยที่บอกสาเหตุจริง
 *
 * ตามสไตล์เดียวกับ src/utils/authUserMessages.ts — ผู้ใช้เห็นข้อความ ไม่เห็นรหัส
 *
 * รหัสทั้งหมดในไฟล์นี้มาจาก **เอกสารทางการของ AINU**
 * ("eKYC Transaction Data Return Requirements and Specifications")
 * ไม่ใช่การเดา — ถ้าจะเพิ่มรหัสใหม่ ให้ยืนยันกับเอกสารหรือ payload จริงก่อนเสมอ
 */

const DEFAULT_MESSAGE = 'ยืนยันตัวตนไม่สำเร็จ กรุณากดถัดไปเพื่อลองใหม่อีกครั้ง'

/**
 * อ่าน transactionStatus ไม่ออก — ต่างจาก "ไม่ผ่าน" คนละเรื่อง
 * อาจแปลว่า AINU ย้ายตำแหน่ง key ในผลลัพธ์ ซึ่งจะทำให้คนที่ผ่านจริงถูกตีว่าไม่ผ่าน
 * ต้องแยกให้ออกเวลาไล่ปัญหา
 */
const UNREADABLE_MESSAGE =
  'ระบบอ่านผลการยืนยันตัวตนไม่ได้ กรุณาลองใหม่อีกครั้ง หากยังไม่ได้กรุณาแจ้งผู้ดูแลระบบ'

const TRY_AGAIN_LATER =
  'ระบบยืนยันตัวตนขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง'

const NOT_IN_THIS_FLOW =
  'ระบบยืนยันตัวตนทำงานผิดพลาด กรุณาแจ้งผู้ดูแลระบบ'

/**
 * ค่าที่เป็นไปได้ของ `liveness.reason` ตามเอกสาร:
 * PASS · FAIL · TIMEOUT · FACE_NOT_FOUND · CAMERA_ACCESS_DENIED · SYSTEM_ERROR
 *
 * ส่วน `failReason` เป็นรหัสระดับ transaction (EKYC_ERROR_0xx และพวก)
 * รหัสที่เกิดได้จริงใน flow นี้คือกลุ่ม liveness (006–010) — ที่เหลือมาจาก OCR/DOPA/FaceCompare
 * ซึ่ง flow นี้ไม่มี ถ้าโผล่มาแปลว่า flowId ถูกเปลี่ยน
 */
const REASON_MESSAGES: Record<string, string> = {
  // ── liveness.reason ──
  timeout: 'ใช้เวลานานเกินไป กรุณาลองใหม่ และทำตามคำแนะนำบนหน้าจอให้ทันนะคะ',
  face_not_found:
    'ไม่พบใบหน้าในกล้อง กรุณานั่งให้ใกล้กล้องขึ้น จัดกล้องให้อยู่ระดับสายตา และให้แสงส่องมาที่ใบหน้า',
  camera_access_denied:
    'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาเปิดสิทธิ์กล้องให้เว็บไซต์นี้ในตั้งค่าเบราว์เซอร์ แล้วลองใหม่',
  fail: 'ยืนยันใบหน้าไม่สำเร็จ กรุณาลองใหม่ โดยหันหน้าตรงเข้ากล้องในที่ที่มีแสงเพียงพอ',
  system_error: TRY_AGAIN_LATER,

  // ── failReason: กลุ่ม liveness (เกิดเมื่อทำซ้ำครบโควตาที่ AINU ตั้งไว้) ──
  ekyc_error_006: 'เปิดกล้องเพื่อยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  ekyc_error_007:
    'ยืนยันใบหน้าไม่สำเร็จตามจำนวนครั้งที่กำหนด กรุณากดถัดไปเพื่อเริ่มใหม่ '
    + 'โดยจัดกล้องให้อยู่ระดับสายตาและอยู่ในที่ที่มีแสงเพียงพอ',
  ekyc_error_008:
    'ตรวจไม่พบใบหน้าตามจำนวนครั้งที่กำหนด กรุณากดถัดไปเพื่อเริ่มใหม่ '
    + 'โดยนั่งให้ใกล้กล้องขึ้นจนเห็นใบหน้าเต็มกรอบ',
  ekyc_error_009:
    'ใช้เวลานานเกินกำหนดหลายครั้ง กรุณากดถัดไปเพื่อเริ่มใหม่ และทำตามคำแนะนำบนหน้าจอให้ทัน',
  ekyc_error_010: TRY_AGAIN_LATER,

  // ── failReason: ระดับ session/ระบบ ──
  session_timeout: 'หมดเวลาการยืนยันตัวตน กรุณากดถัดไปเพื่อเริ่มใหม่',
  cant_start_ekyc:
    'เบราว์เซอร์นี้ใช้ยืนยันตัวตนไม่ได้ กรุณาลองใหม่ด้วยแอปกล้องบนมือถือ หรือเปลี่ยนเบราว์เซอร์',
  ekyc_system_error: TRY_AGAIN_LATER,

  // เอกสารระบุว่าเป็น EKYC_INIT_ERROR แต่ payload จริงที่เจอส่งมาเป็น INIT_ERROR
  // ใส่ไว้ทั้งคู่จนกว่าจะยืนยันกับ AINU ได้
  ekyc_init_error:
    'เปิดกล้องไม่ได้ ระบบยืนยันตัวตนเริ่มทำงานไม่สำเร็จ — ต้องเปิดหน้าเว็บผ่าน https เท่านั้น',
  init_error:
    'เปิดกล้องไม่ได้ ระบบยืนยันตัวตนเริ่มทำงานไม่สำเร็จ — ต้องเปิดหน้าเว็บผ่าน https เท่านั้น',

  // ── failReason: กลุ่ม OCR/DOPA/FaceCompare — flow นี้ไม่มี ถ้าโผล่มาแปลว่า flowId เปลี่ยน ──
  ekyc_error_001: NOT_IN_THIS_FLOW,
  ekyc_error_002: NOT_IN_THIS_FLOW,
  ekyc_error_003: NOT_IN_THIS_FLOW,
  ekyc_error_004: NOT_IN_THIS_FLOW,
  ekyc_error_005: NOT_IN_THIS_FLOW,
  ekyc_error_011: NOT_IN_THIS_FLOW,
  ekyc_error_012: NOT_IN_THIS_FLOW,
  ekyc_error_013: NOT_IN_THIS_FLOW,
}

export interface LivenessFailure {
  /** ข้อความที่แสดงให้ผู้ใช้ */
  message: string
  /** รหัสดิบจาก AINU — ว่างถ้าไม่มี ใช้ตอน debug และตอนทำ log ฝั่ง backend */
  code: string
  /** ข้อความอธิบายจาก AINU ที่มาคู่กับ failReason — ไม่แสดงให้ผู้ใช้ (ดูหมายเหตุด้านล่าง) */
  description: string
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

/** ไล่หาค่าตามตำแหน่งที่ AINU เคยวางไว้ — ตัวแรกที่เจอเป็นสตริงไม่ว่างชนะ */
function firstString(candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

/**
 * อ่าน transactionStatus จาก payload
 * เอกสาร AINU ขัดกันเองเรื่องตำแหน่ง key เลยลองหลายที่
 * ค่ามี 3 แบบ: completed / failed / pending_DOPA (flow นี้ไม่มี DOPA)
 */
export function readTransactionStatus(result: unknown): string {
  const r = asRecord(result)
  const nested = asRecord(r?.data)
  return firstString([r?.transactionStatus, nested?.transactionStatus])
}

/** รหัสสาเหตุ — liveness.reason มาก่อน failReason เพราะเจาะจงกว่า */
function readFailureCode(result: unknown): string {
  const r = asRecord(result)
  const nested = asRecord(r?.data)

  return firstString([
    asRecord(r?.liveness)?.reason,
    asRecord(nested?.liveness)?.reason,
    r?.failReason,
    nested?.failReason,
    r?.reason,
    nested?.reason,
  ])
}

/** ข้อความอธิบายจาก AINU ที่เอกสารบอกว่ามาคู่กับ failReason */
function readDescription(result: unknown): string {
  const r = asRecord(result)
  const nested = asRecord(r?.data)
  return firstString([r?.description, nested?.description])
}

/** แปลง payload ที่ไม่ผ่าน เป็นสาเหตุ + ข้อความไทย */
export function describeLivenessFailure(result: unknown): LivenessFailure {
  const status = readTransactionStatus(result)
  const code = readFailureCode(result)
  const description = readDescription(result)
  const unreadable = status === ''

  let message: string
  if (unreadable) {
    message = UNREADABLE_MESSAGE
  } else {
    // ตั้งใจไม่เอา description มาแสดงให้ผู้ใช้ แม้เอกสารจะบอกว่าใช้แจ้งผู้ใช้ได้
    // เพราะยังไม่รู้ว่าเป็นภาษาอะไรและเขียนด้วยน้ำเสียงแบบไหน
    // ผู้ใช้กลุ่มนี้เปราะบาง ข้อความต้องคุมเองทั้งหมด — description เก็บไว้ใน log/รายงานแทน
    message = REASON_MESSAGES[code.toLowerCase()] ?? DEFAULT_MESSAGE
  }

  // ตอน dev ต่อรหัสจริงท้ายข้อความ เพื่อให้เก็บรหัสที่ยังไม่รู้จักได้จากหน้าจอ
  // (ทดสอบบนมือถือเปิด console ไม่ได้) — production ไม่โชว์
  if (import.meta.env.DEV) {
    const debug = [status || 'no-status', code || 'no-code'].join(' / ')
    message = `${message} [${debug}]`
  }

  return { message, code, description, status, unreadable }
}
