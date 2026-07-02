/**
 * แปลง birthdate จาก ThaiD
 *
 * กติกา:
 * - ไม่ส่งเดือนและวัน → 1 มกราคม ของปีที่ส่งมา
 * - ส่งเดือนแต่ไม่ส่งวัน (เช่น 2487-05-00) → วันที่ 1 ของเดือนนั้น
 * - ปี ≥ 2400 ถือเป็น พ.ศ. → แปลงเป็น ค.ศ. ก่อนคืนค่า ISO
 */

const PARTIAL_BIRTHDATE_RE = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/

function sentPart(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function parseThaiDBirthdate(dob: string): { yearCe: number; month: number; day: number } | null {
  const text = (dob || '').trim()
  const m = PARTIAL_BIRTHDATE_RE.exec(text)
  if (!m) return null

  const rawYear = Number(m[1])
  if (!Number.isFinite(rawYear)) return null

  let yearCe = rawYear
  if (rawYear >= 2400) yearCe = rawYear - 543

  const monthSent = sentPart(m[2])
  const daySent = sentPart(m[3])

  let month: number
  let day: number
  if (monthSent == null && daySent == null) {
    month = 1
    day = 1
  } else if (monthSent != null && daySent == null) {
    month = monthSent
    day = 1
  } else if (monthSent == null && daySent != null) {
    month = 1
    day = daySent
  } else {
    month = monthSent!
    day = daySent!
  }

  if (month > 12 || day > 31) return null

  const birth = new Date(yearCe, month - 1, day)
  if (Number.isNaN(birth.getTime())) return null

  return { yearCe, month, day }
}

/** คืน YYYY-MM-DD (ค.ศ.) ตามกติกา ThaiD — null ถ้าแปลงไม่ได้ */
export function normalizeThaiDBirthdateToIso(dob: string): string | null {
  const parts = parseThaiDBirthdate(dob)
  if (!parts) return null
  const mo = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${parts.yearCe}-${mo}-${d}`
}

/** ใช้เก็บใน auth/checkSelf — คืน ISO หรือค่าเดิมถ้าแปลงไม่ได้ */
export function normalizeThaiDBirthdateForApp(dob: string): string {
  const iso = normalizeThaiDBirthdateToIso(dob)
  return iso ?? (dob || '').trim()
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** แสดงวันเกิดภาษาไทย (พ.ศ.) หลัง normalize */
export function formatThaiDBirthdateLabel(dob: string): string {
  const iso = normalizeThaiDBirthdateToIso(dob)
  if (!iso) return (dob || '').trim()
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`
}

/** ประมาณอายุจาก birthdate ThaiD */
export function estimateAgeFromThaiDBirthdate(dob: string): number | null {
  const parts = parseThaiDBirthdate(dob)
  if (!parts) return null

  const birth = new Date(parts.yearCe, parts.month - 1, parts.day)
  const today = new Date()
  if (parts.yearCe > today.getFullYear()) return null

  let years = today.getFullYear() - birth.getFullYear()
  const passed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!passed) years -= 1
  return years >= 0 ? years : null
}
