// ชื่อเดือนภาษาไทยแบบเต็ม (index 0 = มกราคม)
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/**
 * แปลง date string (ISO หรือ YYYY-MM-DD) เป็นรูปแบบวันที่ภาษาไทย พ.ศ.
 * เช่น "2000-01-15" → "15 มกราคม 2543"
 * คืน "—" เมื่อค่าว่างหรือ parse ไม่ได้
 */
export function formatThaiDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr.trim() === '') return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const day   = d.getDate()
  const month = THAI_MONTHS[d.getMonth()]
  const year  = d.getFullYear() + 543
  return `${day} ${month} ${year}`
}

/**
 * แปลง date string เป็นรูปแบบสั้น dd/mm/พ.ศ.
 * เช่น "2000-01-15" → "15/01/2543"
 */
export function formatThaiDateShort(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr.trim() === '') return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear() + 543
  return `${day}/${month}/${year}`
}
