# Dev fixtures — รูปสมุดบัญชี OCR

ไฟล์ในโฟลเดอร์นี้ใช้เฉพาะ **โหมดพัฒนา (mock ThaiD)** เพื่อทดสอบ Step 4 โดยไม่ต้องถ่ายสมุดบัญชีจริงทุกครั้ง

## `bank-book-ocr-sample.jpg`

รูปตัวอย่างสำหรับปุ่ม **ใช้รูปสมุดบัญชีตัวอย่าง** ใน Step 4 (แสดงเมื่อ login ผ่าน `/login/thaid/dev-mock`)

### ฟิลด์ที่ OCR ต้องอ่านได้

| ฟิลด์ | ค่าที่ต้องตรง |
|--------|----------------|
| `account_name` | นาย ภูริพัฒน ปัญญา |
| `account_number` | เลขบัญชีชัด (เช่น `431-013603-2`) |
| `bank_name` | ชื่อธนาคารภาษาไทย (เช่น ธนาคารไทยพาณิชย์) |
| `deposit_type` | เช่น ออมทรัพย์ |
| `branch_name` | ชื่อสาขา (เช่น เซ็นทรัลเวิลด์) |

ชื่อบัญชีต้องตรงกับ `ocr_fixture` ใน `thaid-auth-service/app/dev_mock/seed/mock_profile_seed.json` และค่า fallback `THAID_MOCK_*` ใน `.env`

### เปลี่ยนรูปหรือชื่อ fixture

1. แก้ `ocr_fixture` ใน seed JSON (ชื่อ/คำนำหน้า)
2. แทนที่ `bank-book-ocr-sample.jpg` ด้วยรูปสมุดบัญชีจริงที่อ่านได้ครบตามตารางด้านบน (รูปสังเคราะห์จาก Canvas มักไม่ผ่าน Gemini OCR)
3. Restart `thaid-auth-service` หลังแก้ seed
4. สร้างรูปใหม่จากสคริปต์ (Windows): `powershell -File apps/frontend/scripts/generate-bank-book-fixture.ps1`
