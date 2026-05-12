// ไฟล์นี้กำหนด "รูปร่าง" (shape) ของข้อมูลที่เกี่ยวกับการ Login ทั้งหมด
// TypeScript จะใช้ข้อมูลพวกนี้ตรวจสอบว่าโค้ดที่เราเขียนถูกต้องหรือไม่ (type safety)

// วิธีที่ผู้ใช้เลือก Login — มีสองแบบ
export type AuthMethod = 'thaid' | 'tangrath'

// ข้อมูลผู้ใช้ที่ได้กลับมาจากการ Login ด้วย ThaID
export interface ThaiDUser {
  pid: string        // เลขบัตรประชาชน 13 หลัก
  title: string      // คำนำหน้า เช่น "นาย", "นาง"
  fname: string      // ชื่อ
  lname: string      // นามสกุล
  dob: string        // วันเกิด YYYY-MM-DD (จาก ThaiD birthdate — '' ถ้าไม่ได้รับ)
  gender: string     // เพศ ('' ถ้าไม่ได้รับ)
  person_id: number  // ID ของ person ในฐานข้อมูลหลังบ้าน (0 ถ้ายังไม่มีบันทึก)
}

// ข้อมูลผู้ใช้ที่ได้กลับมาจากการยืนยันตัวตนด้วย DGA (Face Recognition)
export interface DGAUser {
  pid: string            // เลขบัตรประชาชน 13 หลัก
  confidence: number     // ความมั่นใจในการจับคู่ใบหน้า เช่น 0.98 = 98%
  livenessScore: number  // คะแนนความมีชีวิต (ป้องกันการใช้รูปภาพหลอก)
  verifiedAt: string     // เวลาที่ยืนยันสำเร็จ
}

// AuthUser รวมทั้งสองแบบ — ผู้ใช้จะเป็นได้แบบใดแบบหนึ่ง
export type AuthUser = ThaiDUser | DGAUser

// สถานะการ Login ทั้งหมดที่เก็บไว้ในระบบ
export interface AuthState {
  user: AuthUser | null         // null = ยังไม่ได้ Login
  token: string | null          // JWT token สำหรับเรียก API (null = ยังไม่ได้ Login)
  method: AuthMethod | null     // ผู้ใช้เลือก Login ด้วยวิธีไหน
  isAuthenticated: boolean      // true = Login แล้ว
}
