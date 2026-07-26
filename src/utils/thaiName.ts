// เทียบชื่อบัญชีที่ผู้ใช้กรอกเอง กับชื่อจาก ThaiD (ใช้ในโหมดกรอกข้อมูลบัญชีเอง)
// ทำ normalize แบบง่าย: ตัดคำนำหน้า + ช่องว่าง + จุด แล้วเทียบ fname+lname

// คำนำหน้าไทยที่พบบ่อย — ตัดออกก่อนเทียบ เพราะสมุดบัญชีบางเล่มไม่พิมพ์คำนำหน้า
const THAI_TITLES = [
  'นาย', 'นาง', 'นางสาว', 'น.ส.', 'นส.', 'ด.ช.', 'ด.ญ.',
  'เด็กชาย', 'เด็กหญิง', 'ว่าที่ร้อยตรี', 'ดร.', 'ดร',
]

/**
 * normalize ชื่อไทย: ตัดคำนำหน้า, ช่องว่างทุกชนิด, จุด/ขีด แล้ว lowercase
 * เช่น "นาย ภูริพัฒน์  ปัญญา" → "ภูริพัฒน์ปัญญา"
 */
export function normalizeThaiName(raw: string | null | undefined): string {
  let s = (raw ?? '').trim()
  // ตัดคำนำหน้า (เรียงจากยาวไปสั้น กันตัด "นาง" ก่อน "นางสาว")
  for (const t of [...THAI_TITLES].sort((a, b) => b.length - a.length)) {
    if (s.startsWith(t)) { s = s.slice(t.length); break }
  }
  return s.replace(/[\s.\-–—]/g, '').toLowerCase()
}

/**
 * เช็คว่าชื่อบัญชีที่กรอก match ชื่อ ThaiD หรือไม่
 * ต้องมีทั้ง fname และ lname อยู่ในชื่อที่กรอก (หลัง normalize)
 */
export function bankNameMatchesThaiD(
  input: string | null | undefined,
  thaiD: { title?: string; fname?: string; lname?: string } | null,
): boolean {
  if (!thaiD?.fname || !thaiD?.lname) return false
  const inp = normalizeThaiName(input)
  if (!inp) return false
  const target = normalizeThaiName(`${thaiD.fname} ${thaiD.lname}`)
  // ตรงกันเป๊ะ หรือมีคำนำหน้าติดมาข้างหน้า (endsWith)
  // ห้ามมีข้อความต่อท้ายชื่อ — พิมพ์เกินจากชื่อเป้าหมายถือว่าไม่ match
  return inp === target || inp.endsWith(target)
}
