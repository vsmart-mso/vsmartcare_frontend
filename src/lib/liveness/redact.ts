/**
 * ตัด base64 ออกจากผลลัพธ์ของ AINU ก่อนเอาไปแสดง/บันทึก
 *
 * payload จริงมีรูปถ่ายฝังมาเป็น base64 ยาวหลักแสนตัวอักษร
 * - เอาไปโชว์บนหน้าจอดิบ ๆ = เบราว์เซอร์ค้าง
 * - เอาไป log ฝั่ง backend ดิบ ๆ = เก็บภาพใบหน้าลง log โดยไม่ตั้งใจ
 *
 * README ของโฟลเดอร์นี้ระบุไว้ว่าตอนทำ liveness-service ต้องตัด base64 ทิ้งก่อนเสมอ
 * ฟังก์ชันนี้เลยเขียนให้ใช้ซ้ำได้ทั้งสองที่
 */

/** คีย์ที่รู้แล้วว่าเป็นรูป — ตัดทิ้งเสมอไม่ว่าจะยาวแค่ไหน */
const IMAGE_KEYS = new Set([
  'livenessimage',
  'fullfrontthaicard',
  'fullfrontthaicardsupport',
  'thaiidportrait',
])

/** สตริงยาวเกินนี้ถือว่าเป็นข้อมูลก้อนใหญ่ ตัดทิ้ง (กันคีย์ที่ยังไม่รู้จัก) */
const MAX_STRING_LENGTH = 300

function placeholder(length: number): string {
  return `[ตัดออก ${length.toLocaleString('th-TH')} ตัวอักษร]`
}

/**
 * คืน copy ของ payload ที่ตัดข้อมูลก้อนใหญ่ออกแล้ว — ไม่แก้ของเดิม
 * รองรับ object/array ซ้อนกัน และกัน circular reference
 */
export function redactLivenessPayload(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? placeholder(value.length) : value
  }

  if (value === null || typeof value !== 'object') return value

  // seen เก็บเฉพาะ "บรรพบุรุษ" ของ node ปัจจุบัน ไม่ใช่ทุก node ที่เคยเจอ
  // ไม่งั้น object เดียวกันที่ถูกอ้างสองที่แบบไม่วน จะโดนตีว่า circular ผิด ๆ
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  const result = Array.isArray(value)
    ? value.map((item) => redactLivenessPayload(item, seen))
    : Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          typeof item === 'string' && IMAGE_KEYS.has(key.toLowerCase())
            ? placeholder(item.length)
            : redactLivenessPayload(item, seen),
        ]),
      )

  seen.delete(value)
  return result
}

/** payload → JSON อ่านง่าย พร้อมโชว์/ก๊อป (ตัด base64 ออกแล้ว) */
export function formatLivenessPayload(value: unknown): string {
  try {
    return JSON.stringify(redactLivenessPayload(value), null, 2)
  } catch (e) {
    return `แปลงผลลัพธ์เป็น JSON ไม่ได้: ${e instanceof Error ? e.message : String(e)}`
  }
}
