// ไฟล์นี้กำหนดรูปร่างของ Response ที่ได้รับจาก FastAPI (หลังบ้าน)
// ทุก API ของเราจะส่งข้อมูลกลับมาในรูปแบบนี้เสมอ

// ApiResponse<T> คือ Generic Type
// ตัวอย่าง:
//   ApiResponse<ThaiDUser>   = กล่องที่มีข้อมูล ThaiDUser ข้างใน
//   ApiResponse<string>      = กล่องที่มีข้อความข้างใน
//
// FastAPI จะส่งกลับมาเสมอในรูปแบบนี้:
// {
//   "success": true,
//   "data": { ...ข้อมูลจริงๆ... },
//   "message": "สำเร็จ"
// }
export interface ApiResponse<T = unknown> {
  success: boolean   // true = สำเร็จ, false = ล้มเหลว
  data: T            // ข้อมูลจริงๆ (ประเภทขึ้นอยู่กับ T ที่กำหนด)
  message?: string   // ข้อความเพิ่มเติม (? = มีหรือไม่มีก็ได้)
}

// รูปแบบ error ที่ FastAPI จะส่งกลับมาเมื่อเกิดปัญหา
export interface ApiError {
  code: string                              // รหัส error เช่น "UNAUTHORIZED"
  message: string                           // ข้อความอธิบาย error
  details?: Record<string, string[]>        // รายละเอียดเพิ่มเติม (เช่น validation errors)
}

// สำหรับ API ที่ส่งข้อมูลเป็นหน้าๆ (pagination)
// ใช้กับหน้าที่ต้องแสดงรายการยาวๆ
export interface PaginatedResponse<T> {
  items: T[]       // รายการข้อมูลในหน้าปัจจุบัน
  total: number    // จำนวนทั้งหมด
  page: number     // หน้าปัจจุบัน
  pageSize: number // จำนวนรายการต่อหน้า
}
