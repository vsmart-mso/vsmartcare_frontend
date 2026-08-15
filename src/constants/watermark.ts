/**
 * ลายน้ำเอกสารแนบ — ข้อความ + โลโก้ พม.
 *
 * ใช้ข้อความและรูปแบบเดียวกับระบบ volunteer_smart (ปสค.1 → โมดัลแก้ไขเอกสารแนบ)
 * เพื่อให้รูปที่เข้าระบบจากทั้งสองทางมีลายน้ำหน้าตาเหมือนกัน
 *
 * ลายน้ำถูกเขียนทับลงบนไฟล์ตั้งแต่ตอนอัปโหลด (burn-in) — ลบออกภายหลังไม่ได้
 */
export const WATERMARK_TEXT = [
  'ใช้เพื่อการช่วยเหลือตามระเบียบกระทรวง',
  'การพัฒนาสังคมและความมั่นคงของมนุษย์',
  'ว่าด้วยการให้ความช่วยเหลือผู้ประสบปัญหาทางสังคม ',
  'พ.ศ. 2569 เท่านั้น',
].join('\n')

/** โลโก้ พม. ใน public/ — same-origin จึงวาดลง canvas ได้โดยไม่ taint */
export const WATERMARK_LOGO_URL = '/logo-msdhs.png'

/** ตัวเลือกสำเร็จรูปสำหรับส่งให้ useImageUpload / compressImage */
export const DOC_WATERMARK = {
  text: WATERMARK_TEXT,
  logoUrl: WATERMARK_LOGO_URL,
} as const
